"""
Find new required columns that a rolled-back release couldn't insert into.

A failed deploy rolls the code back but not the database (RUNBOOK §8 rule 5).
The older code doesn't know columns added since, so its INSERTs leave them
out. Django drops the one-off default it used to fill existing rows right
after AddField, so a NOT NULL column with no database default (``db_default``)
then rejects every insert: on MySQL's strict mode that's a 500.

A migration is "new" when its file isn't on the base ref (``origin/main``,
i.e. what production runs). Columns on models that a new migration creates
are fine: the older code doesn't know the table at all. So is a column a
later new migration gives a ``db_default`` (as tenants.0013 did for 0012).
"""

from dataclasses import dataclass

from django.db import models
from django.db.migrations.operations import (
    AddField,
    CreateModel,
    SeparateDatabaseAndState,
)

# On a Migration class: {"<model_name>.<field_name>": "why this is safe"}.
EXEMPTIONS_ATTRIBUTE = "allow_add_field_without_db_default"


@dataclass(frozen=True)
class UnsafeAddField:
    app_label: str
    migration: str
    path: str
    model_name: str
    field_name: str

    def describe(self) -> str:
        return (
            f"{self.path}: {self.app_label}.{self.model_name}.{self.field_name} "
            "is a new required column with no db_default. Code from before this "
            "release can't insert rows after a rollback. Add db_default=... "
            "(or null=True)."
        )


def _database_operations(operations):
    """The operations that touch the database, unpacking SeparateDatabaseAndState."""
    for operation in operations:
        if isinstance(operation, SeparateDatabaseAndState):
            yield from _database_operations(operation.database_operations)
        else:
            yield operation


def _is_required_column(field) -> bool:
    if field.many_to_many or getattr(field, "generated", False):
        return False
    return not field.null and field.db_default is models.NOT_PROVIDED


def find_unsafe_add_fields(new_migrations, final_field) -> list[UnsafeAddField]:
    """
    ``new_migrations``: (app_label, Migration instance, path) for every
    migration not yet on the base ref.
    ``final_field(app_label, model_name, field_name)``: the field as the last
    migration leaves it, or None if it (or its model) is gone by then.
    """
    created = {
        (app_label, op.name_lower)
        for app_label, migration, _ in new_migrations
        for op in _database_operations(migration.operations)
        if isinstance(op, CreateModel)
    }
    found = []
    for app_label, migration, path in new_migrations:
        exempt = {
            key.lower()
            for key, reason in getattr(migration, EXEMPTIONS_ATTRIBUTE, {}).items()
            if str(reason).strip()
        }
        for op in _database_operations(migration.operations):
            if not isinstance(op, AddField) or not _is_required_column(op.field):
                continue
            if (app_label, op.model_name_lower) in created:
                continue
            if f"{op.model_name_lower}.{op.name_lower}" in exempt:
                continue
            final = final_field(app_label, op.model_name_lower, op.name)
            if final is None or not _is_required_column(final):
                continue
            found.append(
                UnsafeAddField(
                    app_label=app_label,
                    migration=migration.name,
                    path=path,
                    model_name=op.model_name_lower,
                    field_name=op.name,
                )
            )
    return found


def final_field_lookup(project_state):
    """Turn a ProjectState into the ``final_field`` callable above."""

    def final_field(app_label, model_name, field_name):
        model_state = project_state.models.get((app_label, model_name))
        if model_state is None:
            return None
        return model_state.fields.get(field_name)

    return final_field
