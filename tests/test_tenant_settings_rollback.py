"""
A release must be safe to roll back.

deploy.sh rolls the code back (not the database) when a deploy fails after
`migrate`, and a reverted release runs the old code against the new schema.
Older code doesn't know the columns added since, so its INSERT leaves them
out: gym signup creates a TenantSettings row exactly like that. Without a
database-level default, MySQL's strict mode rejects the row and signup
returns 500 (this happened with tenants.0012; 0013 fixed it).

These tests aren't tied to one release. A new required column must have a
``db_default`` (RUNBOOK §8 rule 5; `check_migration_defaults` enforces that in
CI), and then:

- an insert that leaves out every column with a ``db_default`` must work and
  give the same values new code would;
- every ``db_default`` a model declares must really exist in the database
  (on MySQL 8 a JSON default needs a hand-written migration, see 0013).
"""

import pytest
from django.apps import apps
from django.core.management import call_command
from django.db import connection, models

from apps.tenants.models import TenantSettings
from tests.factories import TenantFactory


def _has_db_default(field):
    return field.db_default is not models.NOT_PROVIDED


def _db_default_fields(model):
    return [f for f in model._meta.local_concrete_fields if _has_db_default(f)]


def _insert_like_old_code(tenant):
    """INSERT a settings row the way older code would: every column except
    the ones a newer release added (all of which have a db_default)."""
    row = TenantSettings(tenant=tenant)
    fields = [
        f
        for f in TenantSettings._meta.local_concrete_fields
        if not f.primary_key and not _has_db_default(f)
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
def test_older_code_can_still_create_gym_settings():
    left_out = _db_default_fields(TenantSettings)
    # The checklist release's four columns at least; more as releases add them.
    assert {f.name for f in left_out} >= {
        "facilities_checklists_enabled",
        "checklist_roles",
        "facilities_alert_start_hour",
        "facilities_alert_end_hour",
    }
    tenant = TenantFactory()
    TenantSettings.objects.filter(tenant=tenant).delete()

    _insert_like_old_code(tenant)

    saved = TenantSettings.objects.get(tenant=tenant)
    made_by_new_code = TenantSettings(tenant=tenant)
    for field in left_out:
        assert getattr(saved, field.attname) == getattr(
            made_by_new_code, field.attname
        ), f"{field.name}: the database default differs from the model's default"


def _column_default(table, column):
    """The column's default as the database reports it, or None."""
    with connection.cursor() as cursor:
        if connection.vendor == "sqlite":
            cursor.execute(f"PRAGMA table_info({connection.ops.quote_name(table)})")
            return next(row[4] for row in cursor.fetchall() if row[1] == column)
        cursor.execute(
            "SELECT COLUMN_DEFAULT FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s AND COLUMN_NAME = %s",
            [table, column],
        )
        return cursor.fetchone()[0]


@pytest.mark.django_db
def test_every_db_default_exists_in_the_database():
    missing = [
        f"{model._meta.label}.{field.name}"
        for model in apps.get_models()
        if model._meta.managed and not model._meta.proxy
        for field in _db_default_fields(model)
        if _column_default(model._meta.db_table, field.column) is None
    ]
    assert missing == [], "db_default declared on the model but not in the database"


# The defaults tenants.0013 added. Inherently about that one migration: its
# reverse must put back exactly what 0012 left.
GIVEN_BY_0013 = {
    "facilities_checklists_enabled",
    "checklist_roles",
    "facilities_alert_start_hour",
    "facilities_alert_end_hour",
}


def _column_has_default(column):
    return _column_default("tenants_settings", column) is not None


@pytest.mark.django_db(transaction=True)
def test_migration_0013_reverses_cleanly():
    """Undoing 0013 must really remove the defaults, or the database and
    Django's idea of it drift apart."""
    assert all(_column_has_default(c) for c in GIVEN_BY_0013)
    # What 0012 itself leaves: on MySQL, Django keeps the default it gives a
    # JSON column, so checklist_roles has one there even before 0013.
    kept_by_0012 = (
        {"checklist_roles"}
        if connection.vendor == "mysql" and not connection.mysql_is_mariadb
        else set()
    )
    try:
        call_command("migrate", "tenants", "0012", verbosity=0)
        for column in GIVEN_BY_0013:
            assert _column_has_default(column) == (column in kept_by_0012), column
    finally:
        call_command("migrate", verbosity=0)
    assert all(_column_has_default(c) for c in GIVEN_BY_0013)
