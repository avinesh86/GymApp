"""
check_db_schema reports model columns that the live database lacks — the
kind of drift behind production returning 500 on every invoice query — and
with --fix adds them back, only when that is safe.
"""

import pytest
from django.contrib.auth.models import Group
from django.core.management import CommandError, call_command
from django.db import OperationalError, ProgrammingError, connection

from pathlib import Path

from apps.core.management.commands.check_db_schema import (
    TableDrift,
    find_schema_drift,
    find_unsafe_repairs,
)
from apps.invoices.models import Invoice, InvoiceApproval
from tests.factories import InvoiceFactory

DB_ERRORS = (OperationalError, ProgrammingError)


def _remove_field(model, name):
    with connection.schema_editor() as editor:
        editor.remove_field(model, model._meta.get_field(name))


def _restore_field(model, name):
    if model._meta.get_field(name).column in _columns(model._meta.db_table):
        return
    with connection.schema_editor() as editor:
        editor.add_field(model, model._meta.get_field(name))


def _columns(table):
    with connection.cursor() as cursor:
        return {
            c.name
            for c in connection.introspection.get_table_description(cursor, table)
        }


def _tables():
    with connection.cursor() as cursor:
        return set(connection.introspection.table_names(cursor))


@pytest.mark.django_db
def test_matching_schema_reports_no_drift(capsys):
    call_command("check_db_schema")

    assert "All model tables and columns exist" in capsys.readouterr().out


@pytest.mark.django_db(transaction=True)
def test_missing_invoice_column_is_reported():
    _remove_field(Invoice, "rejection_reason")
    try:
        drifts = find_schema_drift({"invoices"})

        assert [d.table for d in drifts] == ["invoice"]
        assert drifts[0].missing_columns == ["rejection_reason"]
        with pytest.raises(CommandError, match="1 table"):
            call_command("check_db_schema", "invoices")
    finally:
        _restore_field(Invoice, "rejection_reason")


@pytest.mark.django_db(transaction=True)
def test_fix_adds_missing_column_and_invoices_load_again(tenant, capsys):
    invoice = InvoiceFactory(tenant=tenant)
    _remove_field(Invoice, "rejection_reason")
    try:
        # The production symptom: every invoice query fails.
        with pytest.raises(DB_ERRORS):
            list(Invoice.objects.all())

        call_command("check_db_schema", "--fix")

        assert "rejection_reason" in _columns("invoice")
        reloaded = Invoice.objects.get(pk=invoice.pk)
        assert reloaded.rejection_reason == ""
        assert find_schema_drift() == []
        assert "Repaired 1 table" in capsys.readouterr().out
    finally:
        _restore_field(Invoice, "rejection_reason")


@pytest.mark.django_db(transaction=True)
def test_fix_creates_missing_table():
    with connection.schema_editor() as editor:
        editor.delete_model(InvoiceApproval)
    try:
        call_command("check_db_schema", "--fix")

        assert "invoice_approval" in _tables()
        assert InvoiceApproval.objects.count() == 0
    finally:
        if "invoice_approval" not in _tables():
            with connection.schema_editor() as editor:
                editor.create_model(InvoiceApproval)


@pytest.mark.django_db(transaction=True)
def test_fix_dry_run_prints_sql_and_changes_nothing(capsys):
    _remove_field(Invoice, "rejection_reason")
    try:
        with pytest.raises(CommandError, match="Dry run"):
            call_command("check_db_schema", "--fix", "--dry-run")

        assert "rejection_reason" in capsys.readouterr().out
        assert "rejection_reason" not in _columns("invoice")
    finally:
        _restore_field(Invoice, "rejection_reason")


@pytest.mark.django_db(transaction=True)
def test_fix_refuses_not_null_column_without_default_on_table_with_rows(tenant):
    # The migration that should have added period_start may have filled
    # existing rows with a one-off default the model does not know, so the
    # repair must not guess (MySQL would fill 0000-00-00 or fail).
    InvoiceFactory(tenant=tenant)
    _remove_field(Invoice, "period_start")
    try:
        with pytest.raises(CommandError, match="period_start"):
            call_command("check_db_schema", "--fix")

        assert "period_start" not in _columns("invoice")
    finally:
        with connection.cursor() as cursor:
            cursor.execute(
                "DELETE FROM invoice"
            )  # the ORM can't query without the column
        _restore_field(Invoice, "period_start")


@pytest.mark.django_db(transaction=True)
def test_fix_adds_not_null_column_without_default_when_table_is_empty():
    _remove_field(Invoice, "period_start")
    try:
        call_command("check_db_schema", "--fix")

        assert "period_start" in _columns("invoice")
    finally:
        _restore_field(Invoice, "period_start")


@pytest.mark.django_db(transaction=True)
def test_fix_refuses_callable_default_on_table_with_rows(tenant):
    # approved_at defaults to timezone.now: repairing it would stamp every
    # existing approval with the time of the repair.
    invoice = InvoiceFactory(tenant=tenant)
    InvoiceApproval.objects.create(invoice=invoice, role="manager", action="approve")
    _remove_field(InvoiceApproval, "approved_at")
    try:
        with pytest.raises(CommandError, match="approved_at"):
            call_command("check_db_schema", "--fix")

        assert "approved_at" not in _columns("invoice_approval")
    finally:
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM invoice_approval")
            cursor.execute("DELETE FROM invoice")
        _restore_field(InvoiceApproval, "approved_at")


@pytest.mark.django_db(transaction=True)
def test_dry_run_shows_the_indexes_and_constraints_too(capsys):
    with connection.schema_editor() as editor:
        editor.delete_model(InvoiceApproval)
    try:
        with pytest.raises(CommandError, match="Dry run"):
            call_command("check_db_schema", "--fix", "--dry-run")

        out = capsys.readouterr().out
        assert "CREATE TABLE" in out
        # The constraint/index SQL is only produced when the editor closes.
        assert "ADD CONSTRAINT" in out or "CREATE INDEX" in out
        assert "invoice_approval" not in _tables()
    finally:
        if "invoice_approval" not in _tables():
            with connection.schema_editor() as editor:
                editor.create_model(InvoiceApproval)


@pytest.mark.django_db
def test_missing_table_whose_m2m_table_survived_is_refused_before_any_change():
    drift = TableDrift(model=Group, table="auth_group", table_missing=True)

    problems = find_unsafe_repairs([drift])

    assert problems and "auth_group_permissions" in problems[0]


@pytest.mark.django_db(transaction=True)
def test_column_name_case_is_not_drift():
    # MySQL column names are case-insensitive; the ORM works either way.
    with connection.cursor() as cursor:
        cursor.execute(
            "ALTER TABLE invoice RENAME COLUMN rejection_reason TO Rejection_Reason"
        )
    try:
        assert find_schema_drift({"invoices"}) == []
    finally:
        with connection.cursor() as cursor:
            cursor.execute(
                "ALTER TABLE invoice RENAME COLUMN Rejection_Reason TO rejection_reason"
            )


DEPLOY_SH = Path(__file__).resolve().parent.parent / "scripts" / "deploy.sh"


def test_deploy_checks_schema_after_migrate_and_repairs_only_when_asked():
    script = DEPLOY_SH.read_text()

    migrate = script.index("manage.py migrate --noinput")
    check = script.index("manage.py check_db_schema\n")
    restart = script.index("Restart services")
    assert migrate < check < restart
    # The repair runs only under SCHEMA_FIX=1, which refuses SKIP_BACKUP=1.
    fix = script.index("manage.py check_db_schema --fix\n")
    assert script.rfind('if [ "$SCHEMA_FIX" = "1" ]; then', 0, fix) > migrate
    assert 'if [ "$SCHEMA_FIX" = "1" ] && [ "$SKIP_BACKUP" = "1" ]' in script
