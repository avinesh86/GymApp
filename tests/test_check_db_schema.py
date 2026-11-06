"""
check_db_schema reports model columns that the live database lacks — the
kind of drift behind production returning 500 on every invoice query.
"""
import pytest
from django.core.management import CommandError, call_command
from django.db import connection

from apps.core.management.commands.check_db_schema import find_schema_drift


@pytest.mark.django_db
def test_matching_schema_reports_no_drift(capsys):
    call_command("check_db_schema")

    assert "matches the models" in capsys.readouterr().out


@pytest.mark.django_db(transaction=True)
def test_missing_invoice_column_is_reported():
    with connection.schema_editor() as editor:
        editor.execute("ALTER TABLE invoice DROP COLUMN rejection_reason")
    try:
        drifts = find_schema_drift({"invoices"})

        assert [d.table for d in drifts] == ["invoice"]
        assert drifts[0].missing_columns == ["rejection_reason"]
        with pytest.raises(CommandError, match="1 table"):
            call_command("check_db_schema", "invoices")
    finally:
        with connection.schema_editor() as editor:
            editor.execute(
                "ALTER TABLE invoice ADD COLUMN rejection_reason varchar(500) NOT NULL DEFAULT ''"
            )
