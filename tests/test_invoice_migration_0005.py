"""
invoices.0005 finishes a half-applied 0002_initial: production had 0002
recorded as applied but was missing 17 of its foreign-key columns and both
invoice indexes, so every invoice query returned 500.
"""

import importlib

import pytest
from django.core.management import call_command
from django.db import OperationalError, ProgrammingError, connection
from django.db.migrations.loader import MigrationLoader

from apps.core.management.commands.check_db_schema import find_schema_drift
from apps.invoices.models import Invoice
from tests.factories import InvoiceFactory

migration = importlib.import_module("apps.invoices.migrations.0005_repair_partial_0002")

# What production was missing (everything 0002 adds except invoice.created_by
# and invoice.instructor, which did get created before it stopped).
PRODUCTION_MISSING = {
    "invoice": ["tenant", "updated_by"],
    "invoicelineitem": [
        "tenant",
        "created_by",
        "updated_by",
        "invoice",
        "timetable_event",
    ],
    "invoiceapproval": ["invoice", "approved_by"],
    "payrollbatch": ["tenant", "created_by", "updated_by"],
    "payrun": ["tenant", "created_by", "updated_by", "payroll_batch", "invoice"],
}
INDEX_NAMES = ["invoice_tenant__07f66d_idx", "invoice_tenant__622a8f_idx"]


def _historical_apps():
    loader = MigrationLoader(connection)
    return loader.project_state(("invoices", "0004_invoice_number_local_date")).apps


def _constraints(table):
    with connection.cursor() as cursor:
        return set(connection.introspection.get_constraints(cursor, table))


def _break_like_production(apps):
    invoice = apps.get_model("invoices", "invoice")
    with connection.schema_editor() as editor:
        for index in invoice._meta.indexes:
            if index.name in _constraints("invoice"):
                editor.remove_index(invoice, index)
        for model_name, field_names in PRODUCTION_MISSING.items():
            model = apps.get_model("invoices", model_name)
            for name in field_names:
                editor.remove_field(model, model._meta.get_field(name))


def _run_repair(apps):
    with connection.schema_editor(atomic=False) as editor:
        migration.repair(apps, editor)


def _restore(apps):
    """Put the schema back whatever happened, for the tests after this one."""
    if migration.find_missing(apps, connection):
        with connection.cursor() as cursor:
            for model_name in PRODUCTION_MISSING:
                table = apps.get_model("invoices", model_name)._meta.db_table
                cursor.execute(f"DELETE FROM {connection.ops.quote_name(table)}")
        _run_repair(apps)


@pytest.mark.django_db(transaction=True)
def test_repairs_the_production_schema():
    apps = _historical_apps()
    _break_like_production(apps)
    try:
        # The production symptom.
        with pytest.raises((OperationalError, ProgrammingError)):
            list(Invoice.objects.all())
        assert len(find_schema_drift({"invoices"})) == 5

        _run_repair(apps)

        assert find_schema_drift({"invoices"}) == []
        assert set(INDEX_NAMES) <= _constraints("invoice")
        assert list(Invoice.objects.all()) == []
    finally:
        _restore(apps)


@pytest.mark.django_db(transaction=True)
def test_does_nothing_on_a_healthy_database():
    apps = _historical_apps()
    assert migration.find_missing(apps, connection) == []

    _run_repair(apps)  # no error, no change

    assert find_schema_drift({"invoices"}) == []


@pytest.mark.django_db(transaction=True)
def test_stops_before_changing_anything_if_a_not_null_column_meets_rows(tenant):
    apps = _historical_apps()
    InvoiceFactory(tenant=tenant)
    invoice = apps.get_model("invoices", "invoice")
    with connection.schema_editor() as editor:
        for index in invoice._meta.indexes:
            editor.remove_index(invoice, index)
        editor.remove_field(invoice, invoice._meta.get_field("tenant"))
    try:
        with pytest.raises(RuntimeError, match="invoice.tenant_id"):
            _run_repair(apps)

        # Nothing was added: the column and both indexes are still missing.
        ((model, fields, indexes, has_rows),) = migration.find_missing(apps, connection)
        assert [f.name for f in fields] == ["tenant"]
        assert sorted(i.name for i in indexes) == INDEX_NAMES
        assert has_rows
    finally:
        _restore(apps)


@pytest.mark.django_db
def test_migration_is_the_latest_and_applies_cleanly():
    call_command("migrate", "invoices", verbosity=0)
    loader = MigrationLoader(connection)
    assert ("invoices", "0005_repair_partial_0002") in loader.applied_migrations
