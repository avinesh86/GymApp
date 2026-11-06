"""
Finish what 0002_initial left undone on databases where it only half ran.

Production had 0002 recorded as applied, but only its first two columns
(invoice.created_by, invoice.instructor) existed: the other 17 foreign-key
columns and both invoice indexes were missing, so every invoice query 500'd.
MySQL commits each schema change, so a migration that fails part-way and is
then faked leaves exactly this.

This adds whichever of 0002's columns and indexes are missing, and does
nothing on a database where 0002 ran properly (every other environment).
A NOT NULL column is only added to an empty table: rows would need a value
the migration can't know, so it stops with a clear error before changing
anything (the deploy then rolls back).
"""

from django.db import migrations

# Every column and index 0002_initial creates, by model.
FIELDS_FROM_0002 = {
    "invoice": ["created_by", "instructor", "tenant", "updated_by"],
    "invoiceapproval": ["approved_by", "invoice"],
    "invoicelineitem": [
        "created_by",
        "invoice",
        "tenant",
        "timetable_event",
        "updated_by",
    ],
    "payrollbatch": ["created_by", "tenant", "updated_by"],
    "payrun": ["created_by", "invoice", "payroll_batch", "tenant", "updated_by"],
}
INDEXES_FROM_0002 = {
    "invoice": ["invoice_tenant__07f66d_idx", "invoice_tenant__622a8f_idx"],
}


def _live_schema(connection, table):
    with connection.cursor() as cursor:
        columns = {
            c.name.lower()
            for c in connection.introspection.get_table_description(cursor, table)
        }
        constraints = {
            name.lower()
            for name in connection.introspection.get_constraints(cursor, table)
        }
        cursor.execute(f"SELECT 1 FROM {connection.ops.quote_name(table)} LIMIT 1")
        has_rows = cursor.fetchone() is not None
    return columns, constraints, has_rows


def find_missing(apps, connection):
    """[(model, [missing fields], [missing indexes], has_rows)] for each
    model 0002 touched that isn't complete."""
    missing = []
    for model_name, field_names in FIELDS_FROM_0002.items():
        model = apps.get_model("invoices", model_name)
        columns, constraints, has_rows = _live_schema(connection, model._meta.db_table)
        fields = [
            model._meta.get_field(name)
            for name in field_names
            if model._meta.get_field(name).column.lower() not in columns
        ]
        indexes = [
            index
            for index in model._meta.indexes
            if index.name in INDEXES_FROM_0002.get(model_name, [])
            and index.name.lower() not in constraints
        ]
        if fields or indexes:
            missing.append((model, fields, indexes, has_rows))
    return missing


def repair(apps, schema_editor):
    missing = find_missing(apps, schema_editor.connection)

    # Refuse up front, so nothing is half-done.
    blocked = [
        f"{model._meta.db_table}.{field.column}"
        for model, fields, _, has_rows in missing
        if has_rows
        for field in fields
        if not field.null
    ]
    if blocked:
        raise RuntimeError(
            "invoices.0005 can't add NOT NULL columns to tables that already have rows "
            f"(the right values are unknown): {', '.join(blocked)}. Nothing was changed. "
            "Fill them by hand, then run migrate again."
        )

    for model, fields, _, _ in missing:
        for field in fields:
            schema_editor.add_field(model, field)
    # Indexes after columns: they cover the columns just added. Look again
    # first: on SQLite adding a column rebuilds the table, indexes included.
    for model, _, indexes, _ in missing:
        _, constraints, _ = _live_schema(schema_editor.connection, model._meta.db_table)
        for index in indexes:
            if index.name.lower() not in constraints:
                schema_editor.add_index(model, index)


class Migration(migrations.Migration):
    # MySQL can't roll schema changes back anyway; each one commits as it runs.
    atomic = False

    dependencies = [
        ("invoices", "0004_invoice_number_local_date"),
    ]

    operations = [
        migrations.RunPython(repair, migrations.RunPython.noop),
    ]
