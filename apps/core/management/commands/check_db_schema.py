"""
Compare every model's columns with the live database.

Migrations can be recorded in ``django_migrations`` without their SQL ever
having run (a faked migration, or a database copied from another server).
``makemigrations --check`` cannot see that: it compares models with migration
files, never with the database. This command compares models with the tables
that actually exist, so drift shows up as a clear report instead of a 500.

Usage:

    python manage.py check_db_schema            # report; exit 1 on drift
    python manage.py check_db_schema invoices   # only these app labels

Only reads the schema; it never changes it.
"""
from dataclasses import dataclass, field

from django.apps import apps
from django.core.management.base import BaseCommand, CommandError
from django.db import connection


@dataclass
class TableDrift:
    model_label: str
    table: str
    table_missing: bool = False
    missing_columns: list[str] = field(default_factory=list)


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
    label = model._meta.label
    if table not in existing_tables:
        return TableDrift(model_label=label, table=table, table_missing=True)

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
    return TableDrift(model_label=label, table=table, missing_columns=missing)


class Command(BaseCommand):
    help = "Report model tables/columns that are missing from the live database."

    def add_arguments(self, parser):
        parser.add_argument("app_labels", nargs="*", help="Limit the check to these apps.")

    def handle(self, *args, **options):
        app_labels = set(options["app_labels"]) or None
        drifts = find_schema_drift(app_labels)

        if not drifts:
            self.stdout.write(self.style.SUCCESS("Database schema matches the models."))
            return

        for drift in drifts:
            self.stdout.write(self.style.ERROR(_describe(drift)))
        raise CommandError(
            f"{len(drifts)} table(s) do not match the models. "
            "Check `showmigrations` for migrations recorded but not applied."
        )


def _describe(drift: TableDrift) -> str:
    if drift.table_missing:
        return f"{drift.model_label}: table `{drift.table}` does not exist"
    columns = ", ".join(drift.missing_columns)
    return f"{drift.model_label}: `{drift.table}` is missing column(s): {columns}"
