"""
Database-level defaults for the settings 0012 added, so code that doesn't
know these columns (the previous release, after a rollback) can still insert
a TenantSettings row. Without them MySQL's strict mode rejects the INSERT
and gym signup returns 500.

MySQL 8 can't take Django's `ALTER COLUMN ... SET DEFAULT (...)` for a JSON
column (error 1101), but does accept the default when the column is
redefined with MODIFY, so checklist_roles is done by hand there. MariaDB and
SQLite use Django's normal path.
"""

import json

from django.db import migrations, models

import apps.tenants.models

CHECKLIST_ROLES = ["owner", "admin", "gym_manager", "team_leader"]


def _is_mysql(connection):
    return connection.vendor == "mysql" and not connection.mysql_is_mariadb


def _json_field(db_default):
    kwargs = {"blank": True, "default": apps.tenants.models.default_checklist_roles}
    if db_default is not None:
        kwargs["db_default"] = db_default
    field = models.JSONField(**kwargs)
    field.set_attributes_from_name("checklist_roles")
    return field


def _set_roles_default(apps_registry, schema_editor, db_default):
    model = apps_registry.get_model("tenants", "TenantSettings")
    table = schema_editor.quote_name(model._meta.db_table)
    if _is_mysql(schema_editor.connection):
        default = ""
        if db_default is not None:
            default =" DEFAULT (CAST(%s AS JSON))" % schema_editor.quote_value(json.dumps(db_default))
        schema_editor.execute(f"ALTER TABLE {table} MODIFY `checklist_roles` JSON NOT NULL{default}")
        return
    old = model._meta.get_field("checklist_roles")
    new = _json_field(db_default)
    new.model = model
    schema_editor.alter_field(model, old, new)


def add_roles_default(apps_registry, schema_editor):
    _set_roles_default(apps_registry, schema_editor, CHECKLIST_ROLES)


def remove_roles_default(apps_registry, schema_editor):
    _set_roles_default(apps_registry, schema_editor, None)


class Migration(migrations.Migration):
    dependencies = [
        ("tenants", "0012_tenantsettings_checklist_roles_and_more"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AlterField(
                    model_name="tenantsettings",
                    name="checklist_roles",
                    field=models.JSONField(
                        blank=True,
                        db_default=CHECKLIST_ROLES,
                        default=apps.tenants.models.default_checklist_roles,
                    ),
                ),
            ],
            database_operations=[migrations.RunPython(add_roles_default, remove_roles_default)],
        ),
        migrations.AlterField(
            model_name="tenantsettings",
            name="facilities_alert_end_hour",
            field=models.PositiveSmallIntegerField(db_default=17, default=17),
        ),
        migrations.AlterField(
            model_name="tenantsettings",
            name="facilities_alert_start_hour",
            field=models.PositiveSmallIntegerField(db_default=9, default=9),
        ),
        migrations.AlterField(
            model_name="tenantsettings",
            name="facilities_checklists_enabled",
            field=models.BooleanField(db_default=True, default=True),
        ),
    ]
