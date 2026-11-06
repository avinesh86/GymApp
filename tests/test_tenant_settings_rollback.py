"""
A release must be safe to roll back.

deploy.sh rolls the code back (not the database) when a deploy fails after
`migrate`, and a reverted release runs the old code against the new schema.
Code from before the checklists release doesn't know the columns
tenants.0012 added, so its INSERT leaves them out: gym signup creates a
TenantSettings row exactly like that. Without a database-level default,
MySQL's strict mode rejects the row and signup returns 500.
"""

import pytest
from django.core.management import call_command
from django.db import connection

from apps.tenants.models import TenantSettings
from tests.factories import TenantFactory

ADDED_BY_CHECKLISTS_RELEASE = {
    "facilities_checklists_enabled",
    "checklist_roles",
    "facilities_alert_start_hour",
    "facilities_alert_end_hour",
}


def _insert_like_old_code(tenant):
    """INSERT a settings row the way pre-checklists code would: every
    column it knew about, none of the ones added since."""
    row = TenantSettings(tenant=tenant)
    fields = [
        f
        for f in TenantSettings._meta.local_concrete_fields
        if not f.primary_key and f.name not in ADDED_BY_CHECKLISTS_RELEASE
    ]
    columns = ", ".join(connection.ops.quote_name(f.column) for f in fields)
    placeholders = ", ".join(["%s"] * len(fields))
    values = [f.get_db_prep_save(f.pre_save(row, add=True), connection) for f in fields]
    table = connection.ops.quote_name(TenantSettings._meta.db_table)
    with connection.cursor() as cursor:
        cursor.execute(
            f"INSERT INTO {table} ({columns}) VALUES ({placeholders})", values
        )


@pytest.mark.django_db
def test_code_from_before_checklists_can_still_create_gym_settings():
    tenant = TenantFactory()
    TenantSettings.objects.filter(tenant=tenant).delete()

    _insert_like_old_code(tenant)

    settings = TenantSettings.objects.get(tenant=tenant)
    assert settings.facilities_checklists_enabled is True
    assert settings.checklist_roles == ["owner", "admin", "gym_manager", "team_leader"]
    assert settings.facilities_alert_start_hour == 9
    assert settings.facilities_alert_end_hour == 17


def _column_has_default(column):
    with connection.cursor() as cursor:
        if connection.vendor == "sqlite":
            cursor.execute("PRAGMA table_info(tenants_settings)")
            return (
                next(row[4] for row in cursor.fetchall() if row[1] == column)
                is not None
            )
        cursor.execute(
            "SELECT COLUMN_DEFAULT FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tenants_settings' AND COLUMN_NAME = %s",
            [column],
        )
        return cursor.fetchone()[0] is not None


@pytest.mark.django_db(transaction=True)
def test_migration_0013_reverses_cleanly():
    """Undoing 0013 must really remove the defaults, or the database and
    Django's idea of it drift apart."""
    assert all(_column_has_default(c) for c in ADDED_BY_CHECKLISTS_RELEASE)
    try:
        call_command("migrate", "tenants", "0012", verbosity=0)
        assert not any(_column_has_default(c) for c in ADDED_BY_CHECKLISTS_RELEASE)
    finally:
        call_command("migrate", verbosity=0)
    assert all(_column_has_default(c) for c in ADDED_BY_CHECKLISTS_RELEASE)
