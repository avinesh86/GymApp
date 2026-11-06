"""
Compare every model's columns with the live database, and optionally add the
ones that are missing.

Migrations can be recorded in ``django_migrations`` without their SQL ever
having run (a faked migration, or a database copied from another server).
``makemigrations --check`` cannot see that: it compares models with migration
files, never with the database. This command compares models with the tables
that actually exist, so drift shows up as a clear report instead of a 500.

Usage:

    python manage.py check_db_schema                  # report; exit 1 on drift
    python manage.py check_db_schema invoices         # only these app labels
    python manage.py check_db_schema --fix --dry-run  # print the repair SQL
    python manage.py check_db_schema --fix            # add what is missing

``--fix`` only ever ADDS missing tables and columns, built from the current
models. It never drops, renames or alters anything. Run it only after
``makemigrations --check`` passes and ``migrate`` has finished, so the models
are exactly the schema the recorded migrations promised. It does not replay
data steps (``RunPython``) from a skipped migration; review those by hand.

Limits: only tables and columns are compared. Missing indexes, unique
constraints and foreign keys, and wrong column types or nullability, are NOT
detected, so a clean result means "every column exists", not "the schema is
identical".
"""

from dataclasses import dataclass, field

from django.apps import apps
from django.core.management.base import BaseCommand, CommandError
from django.db import connection


@dataclass
class TableDrift:
    model: type
    table: str
    table_missing: bool = False
    missing_columns: list[str] = field(default_factory=list)

    @property
    def model_label(self) -> str:
        return self.model._meta.label


def find_schema_drift(app_labels=None, db_connection=connection) -> list[TableDrift]:
    """Return one entry per managed model whose table or columns are missing."""
    with db_connection.cursor() as cursor:
        # MySQL and SQLite names are case-insensitive.
        existing_tables = {
            t.lower() for t in db_connection.introspection.table_names(cursor)
        }
        drifts = []
        for model in _managed_concrete_models(app_labels):
            drift = _drift_for_model(model, existing_tables, cursor, db_connection)
            if drift is not None:
                drifts.append(drift)
    return drifts


def repair_schema_drift(
    drifts, db_connection=connection, collect_sql=False
) -> list[str]:
    """
    Add the missing tables and columns described by ``drifts``.

    Everything that can't be done safely is refused up front, before any
    change. Then missing tables are created together (so foreign keys between
    them resolve), and their constraints and indexes are written before any
    column is touched. Each table's columns are then added in their own step,
    so a failure on one table can't lose another table's constraints (MySQL
    commits every schema change as it goes).

    Returns the SQL that was run, or with ``collect_sql`` would be run.
    """
    problems = find_unsafe_repairs(drifts, db_connection)
    if problems:
        raise UnsafeRepair(
            "Nothing was changed. These can't be repaired from the models alone: "
            + "; ".join(problems)
            + ". Add them by hand (`sqlmigrate <app> <migration>` shows the SQL)."
        )

    statements: list[str] = []
    missing_tables = [d for d in drifts if d.table_missing]
    if missing_tables:
        # Parents first: create_model() also creates their auto-created M2M tables.
        missing_tables.sort(key=lambda d: d.model._meta.auto_created is not False)
        created: set[str] = set()
        with db_connection.schema_editor(collect_sql=collect_sql) as editor:
            for drift in missing_tables:
                if drift.table in created:
                    continue
                editor.create_model(drift.model)
                created.add(drift.table)
                created.update(_auto_m2m_tables(drift.model))
        # Read after the block: constraints and indexes are only added on exit.
        statements += getattr(editor, "collected_sql", [])

    for drift in drifts:
        if drift.table_missing:
            continue
        with db_connection.schema_editor(collect_sql=collect_sql) as editor:
            for model_field in _fields_for_columns(drift.model, drift.missing_columns):
                editor.add_field(drift.model, model_field)
        statements += getattr(editor, "collected_sql", [])
    return statements if collect_sql else []


class UnsafeRepair(Exception):
    pass


def find_unsafe_repairs(drifts, db_connection=connection) -> list[str]:
    """
    What ``repair_schema_drift`` must not attempt.

    - On a table that already has rows, a NOT NULL column whose value the
      model can't supply: the skipped migration may have filled it with a
      one-off default only the migration file knows. A callable default
      (``timezone.now``, ``uuid4``) is no better: every existing row would get
      the repair's own timestamp, or the same "unique" value. Blank text
      fields are fine: the migration filled those with '' too.
    - A missing table whose many-to-many table still exists: creating the
      table would try to create that one again and fail half-way.
    """
    problems = []
    with db_connection.cursor() as cursor:
        existing_tables = {
            t.lower() for t in db_connection.introspection.table_names(cursor)
        }
    for drift in drifts:
        if drift.table_missing:
            leftover = [
                t for t in _auto_m2m_tables(drift.model) if t.lower() in existing_tables
            ]
            if leftover:
                problems.append(
                    f"table `{drift.table}` is missing but `{', '.join(leftover)}` still exists"
                )
            continue
        fields = [
            f
            for f in _fields_for_columns(drift.model, drift.missing_columns)
            if not _safe_to_add_to_existing_rows(f)
        ]
        if fields and _table_has_rows(drift.table, db_connection):
            problems.append(
                f"`{drift.table}`.{', '.join(f.column for f in fields)} "
                "(NOT NULL with no fixed default, on a table with rows)"
            )
    return problems


def _safe_to_add_to_existing_rows(model_field) -> bool:
    if model_field.null:
        return True
    if model_field.unique:
        return False
    if model_field.has_default():
        return not callable(model_field.default)
    return model_field.blank and model_field.empty_strings_allowed


def _auto_m2m_tables(model) -> list[str]:
    return [
        m2m.remote_field.through._meta.db_table
        for m2m in model._meta.local_many_to_many
        if m2m.remote_field.through._meta.auto_created
    ]


def _table_has_rows(table, db_connection) -> bool:
    with db_connection.cursor() as cursor:
        cursor.execute(f"SELECT 1 FROM {db_connection.ops.quote_name(table)} LIMIT 1")
        return cursor.fetchone() is not None


def _managed_concrete_models(app_labels):
    for model in apps.get_models(include_auto_created=True):
        meta = model._meta
        if not meta.managed or meta.proxy:
            continue
        if app_labels and meta.app_label not in app_labels:
            continue
        yield model


def _drift_for_model(model, existing_tables, cursor, db_connection):
    table = model._meta.db_table
    if table.lower() not in existing_tables:
        return TableDrift(model=model, table=table, table_missing=True)

    live_columns = {
        column.name.lower()
        for column in db_connection.introspection.get_table_description(cursor, table)
    }
    expected_columns = [
        model_field.column
        for model_field in model._meta.local_concrete_fields
        if model_field.column
    ]
    missing = [
        column for column in expected_columns if column.lower() not in live_columns
    ]
    if not missing:
        return None
    return TableDrift(model=model, table=table, missing_columns=missing)


def _fields_for_columns(model, columns):
    by_column = {f.column: f for f in model._meta.local_concrete_fields}
    return [by_column[column] for column in columns]


class Command(BaseCommand):
    help = "Report model tables/columns that are missing from the live database."

    def add_arguments(self, parser):
        parser.add_argument(
            "app_labels", nargs="*", help="Limit the check to these apps."
        )
        parser.add_argument(
            "--fix",
            action="store_true",
            help="Add the missing tables and columns (never drops or alters anything).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="With --fix: print the SQL instead of running it.",
        )

    def handle(self, *args, **options):
        app_labels = set(options["app_labels"]) or None
        drifts = find_schema_drift(app_labels)

        if not drifts:
            self.stdout.write(
                self.style.SUCCESS(
                    "All model tables and columns exist in the database."
                )
            )
            return

        for drift in drifts:
            self.stdout.write(self.style.ERROR(_describe(drift)))

        if not options["fix"]:
            raise CommandError(
                f"{len(drifts)} table(s) do not match the models. "
                "Check `showmigrations` for migrations recorded but not applied. "
                "`check_db_schema --fix --dry-run` shows the repair; to apply it on "
                "production, run Actions > Deploy with 'Repair missing tables/columns' ticked."
            )

        if options["dry_run"]:
            try:
                statements = repair_schema_drift(drifts, collect_sql=True)
            except UnsafeRepair as exc:
                raise CommandError(str(exc)) from exc
            for statement in statements:
                self.stdout.write(statement)
            raise CommandError("Dry run: nothing was changed.")

        self.stdout.write(self.style.WARNING("Adding the missing tables/columns..."))
        try:
            repair_schema_drift(drifts)
        except UnsafeRepair as exc:
            raise CommandError(str(exc)) from exc
        except Exception as exc:
            raise CommandError(
                f"Repair failed: {exc}. Some changes may already be applied "
                "(MySQL commits each schema change). Re-run the check to see what is left."
            ) from exc

        remaining = find_schema_drift(app_labels)
        if remaining:
            for drift in remaining:
                self.stdout.write(self.style.ERROR(_describe(drift)))
            raise CommandError(
                f"{len(remaining)} table(s) still do not match after the repair."
            )
        self.stdout.write(
            self.style.SUCCESS(
                f"Repaired {len(drifts)} table(s); all model tables and columns now exist. "
                "Check whether the skipped migrations had data steps (RunPython)."
            )
        )


def _describe(drift: TableDrift) -> str:
    if drift.table_missing:
        return f"{drift.model_label}: table `{drift.table}` does not exist"
    columns = ", ".join(drift.missing_columns)
    return f"{drift.model_label}: `{drift.table}` is missing column(s): {columns}"
