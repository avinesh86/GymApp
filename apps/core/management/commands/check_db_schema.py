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
        existing_tables = set(db_connection.introspection.table_names(cursor))
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

    Returns the SQL that was run (or, with ``collect_sql``, would be run).
    Tables are created before columns are added, and an auto-created
    many-to-many table is skipped when creating its parent model already made it.
    """
    unsafe = find_unsafe_repairs(drifts, db_connection)
    if unsafe:
        raise UnsafeRepair(
            "Not repaired, because the right value for existing rows is unknown "
            "(the skipped migration may have used a one-off default): "
            + "; ".join(unsafe)
            + ". Add these by hand with the SQL from `sqlmigrate`."
        )
    # Parents first: create_model() also creates their auto-created M2M tables.
    ordered = sorted(
        drifts,
        key=lambda d: (not d.table_missing, d.model._meta.auto_created is not False),
    )
    with db_connection.schema_editor(collect_sql=collect_sql) as editor:
        created: set[str] = set()
        for drift in ordered:
            model = drift.model
            if drift.table_missing:
                if drift.table in created:
                    continue
                editor.create_model(model)
                created.add(drift.table)
                created.update(
                    m2m.remote_field.through._meta.db_table
                    for m2m in model._meta.local_many_to_many
                    if m2m.remote_field.through._meta.auto_created
                )
                continue
            for model_field in _fields_for_columns(model, drift.missing_columns):
                editor.add_field(model, model_field)
        return list(editor.collected_sql) if collect_sql else []


class UnsafeRepair(Exception):
    pass


def find_unsafe_repairs(drifts, db_connection=connection) -> list[str]:
    """
    Missing columns that cannot be added safely from the model alone.

    A NOT NULL column with no model default may have been filled by a one-off
    default that only the migration file knows, so on a table that already has
    rows the model cannot say what value it should hold. Blank text fields are
    fine: Django fills those with '' exactly as the migration would have.
    """
    unsafe = []
    for drift in drifts:
        if drift.table_missing:
            continue
        fields = [
            f
            for f in _fields_for_columns(drift.model, drift.missing_columns)
            if not _safe_to_add_to_existing_rows(f)
        ]
        if fields and _table_has_rows(drift.table, db_connection):
            unsafe.append(f"`{drift.table}`.{', '.join(f.column for f in fields)}")
    return unsafe


def _safe_to_add_to_existing_rows(model_field) -> bool:
    if model_field.null or model_field.has_default():
        return True
    return (
        model_field.blank
        and model_field.empty_strings_allowed
        and not model_field.unique
    )


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
    if table not in existing_tables:
        return TableDrift(model=model, table=table, table_missing=True)

    live_columns = {
        column.name
        for column in db_connection.introspection.get_table_description(cursor, table)
    }
    expected_columns = [
        model_field.column
        for model_field in model._meta.local_concrete_fields
        if model_field.column
    ]
    missing = [column for column in expected_columns if column not in live_columns]
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
            self.stdout.write(self.style.SUCCESS("Database schema matches the models."))
            return

        for drift in drifts:
            self.stdout.write(self.style.ERROR(_describe(drift)))

        if not options["fix"]:
            raise CommandError(
                f"{len(drifts)} table(s) do not match the models. "
                "Check `showmigrations` for migrations recorded but not applied, "
                "or run `check_db_schema --fix --dry-run` to see the repair."
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
                f"Repaired {len(drifts)} table(s). Database schema now matches the models. "
                "Check whether the skipped migrations had data steps (RunPython)."
            )
        )


def _describe(drift: TableDrift) -> str:
    if drift.table_missing:
        return f"{drift.model_label}: table `{drift.table}` does not exist"
    columns = ", ".join(drift.missing_columns)
    return f"{drift.model_label}: `{drift.table}` is missing column(s): {columns}"
