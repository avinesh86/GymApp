"""
Find new required columns that a rolled-back release couldn't insert into.

A failed deploy rolls the code back but not the database (RUNBOOK §8 rule 5).
Older code doesn't know columns added since, so its INSERTs leave them out;
and it still writes NULL to a column it knew as nullable. Django drops the
one-off default it used to fill existing rows right after AddField, so a
NOT NULL column with no database default (``db_default``) then rejects those
inserts: on MySQL's strict mode that's a 500.

A migration is "new" when its file isn't on the base ref (``origin/main``,
i.e. what production runs). The new migrations are replayed in order:

- AddField of a required column on a model that already exists, or AlterField
  that makes an existing column required (it was nullable or had a
  db_default), is a problem...
- ...unless a later new migration fixes it (AlterField to null=True or adding
  a db_default) or removes it. Renames are followed.
- Models a new migration creates are fine: older code never writes to them.

Not checked (see RUNBOOK §8 rule 5): columns added with RunSQL, edits to a
migration file that is already on the base ref, removed or renamed columns
that exist there, and a model deleted and re-created under the same name.
"""

from dataclasses import dataclass

from django.db import models
from django.db.migrations.operations import (
    AddField,
    AlterField,
    CreateModel,
    DeleteModel,
    RemoveField,
    RenameField,
    RenameModel,
    SeparateDatabaseAndState,
)

# On a Migration class: {"<model_name>.<field_name>": "why this is safe"}.
EXEMPTIONS_ATTRIBUTE = "allow_without_db_default"


@dataclass(frozen=True)
class Problem:
    path: str
    app_label: str
    model_name: str
    field_name: str
    what: str

    def describe(self) -> str:
        return f"{self.path}: {self.app_label}.{self.model_name}.{self.field_name} {self.what}"


ADDED = (
    "is a new required column with no db_default. Code from before this release "
    "leaves it out of its inserts, which then fail after a rollback. "
    "Add db_default=... (or null=True)."
)
MADE_REQUIRED = (
    "is made required with no db_default. Code from before this release can "
    "still insert NULL or leave it out, which then fails after a rollback. "
    "Add db_default=... (or keep null=True)."
)


def _operations(operations, touches_db=True, group=None):
    """(operation, touches_db, group) triples, unpacking SeparateDatabaseAndState.

    ``group`` is the SeparateDatabaseAndState an operation came from (or
    None). Only operations that touch the database raise a problem. A state
    operation can fix one only when its SeparateDatabaseAndState also has a
    database step (RunPython/RunSQL doing the real change, as in
    tenants.0013), and not a problem raised in that same block."""
    for operation in operations:
        if isinstance(operation, SeparateDatabaseAndState):
            yield from _operations(operation.database_operations, touches_db, operation)
            yield from _operations(operation.state_operations, False, operation)
        else:
            yield operation, touches_db, group


def _has_db_default(field) -> bool:
    default = field.db_default
    if default is models.NOT_PROVIDED or default is None:
        return False
    # db_default=Value(None) is DEFAULT NULL: no help on a NOT NULL column.
    if isinstance(default, models.Value) and default.value is None:
        return False
    return True


def is_required_column(field) -> bool:
    """A column an INSERT that leaves it out (or sends NULL) can't satisfy."""
    if field.many_to_many or getattr(field, "generated", False):
        return False
    return not field.null and not _has_db_default(field)


def _exemptions(migration, path, app_label, touched):
    raw = getattr(migration, EXEMPTIONS_ATTRIBUTE, {})
    problems, exempt = [], set()
    for key, reason in raw.items():
        model_name, _, field_name = key.lower().partition(".")
        if (model_name, field_name) not in touched:
            problems.append(
                Problem(
                    path,
                    app_label,
                    model_name,
                    field_name,
                    f"is listed in {EXEMPTIONS_ATTRIBUTE} but this migration "
                    "doesn't add or alter it (typo, or left behind after a rename?).",
                )
            )
        elif not str(reason).strip():
            problems.append(
                Problem(
                    path,
                    app_label,
                    model_name,
                    field_name,
                    f"is listed in {EXEMPTIONS_ATTRIBUTE} without a reason.",
                )
            )
        else:
            exempt.add((model_name, field_name))
    return problems, exempt


def find_unsafe_columns(new_migrations, field_before) -> list[Problem]:
    """
    ``new_migrations``: (app_label, Migration, path) for every migration not
    yet on the base ref, in the order they apply.
    ``field_before(app_label, migration_name, model_name, field_name)``: the
    field as it was just before that migration, or None if it didn't exist.
    """
    created: set[tuple[str, str]] = set()
    # (app_label, model_name, field_name lowercased) -> Problem, until fixed.
    open_problems: dict[tuple[str, str, str], Problem] = {}
    other_problems: list[Problem] = []
    # The SeparateDatabaseAndState block each open problem was raised in.
    raised_in: dict[tuple[str, str, str], object] = {}

    for app_label, migration, path in new_migrations:
        operations = list(_operations(migration.operations))
        touched = {
            (op.model_name_lower, op.name_lower)
            for op, _, _ in operations
            if isinstance(op, (AddField, AlterField))
        }
        problems, exempt = _exemptions(migration, path, app_label, touched)
        other_problems += problems

        for op, touches_db, group in operations:
            if isinstance(op, CreateModel):
                created.add((app_label, op.name_lower))
            elif isinstance(op, DeleteModel):
                created.discard((app_label, op.name_lower))
                for key in [
                    k for k in open_problems if k[:2] == (app_label, op.name_lower)
                ]:
                    del open_problems[key]
            elif isinstance(op, RenameModel):
                old, new = op.old_name_lower, op.new_name_lower
                if (app_label, old) in created:
                    created.discard((app_label, old))
                    created.add((app_label, new))
                for key in [k for k in open_problems if k[:2] == (app_label, old)]:
                    new_key = (app_label, new, key[2])
                    open_problems[new_key] = open_problems.pop(key)
                    raised_in[new_key] = raised_in.pop(key, None)
            elif isinstance(op, RemoveField):
                open_problems.pop((app_label, op.model_name_lower, op.name_lower), None)
            elif isinstance(op, RenameField):
                old_key = (app_label, op.model_name_lower, op.old_name_lower)
                if old_key in open_problems:
                    new_key = (app_label, op.model_name_lower, op.new_name_lower)
                    open_problems[new_key] = open_problems.pop(old_key)
                    raised_in[new_key] = raised_in.pop(old_key, None)
            elif isinstance(op, (AddField, AlterField)):
                key = (app_label, op.model_name_lower, op.name_lower)
                if (app_label, op.model_name_lower) in created:
                    continue
                if not is_required_column(op.field):
                    real_fix = touches_db or (
                        group is not None
                        and group.database_operations
                        and raised_in.get(key) is not group
                    )
                    if real_fix:
                        open_problems.pop(key, None)
                    continue
                if not touches_db:
                    continue
                if key in open_problems or (key[1], key[2]) in exempt:
                    continue
                if isinstance(op, AddField):
                    what = ADDED
                else:
                    before = field_before(
                        app_label, migration.name, op.model_name_lower, op.name
                    )
                    if before is None:
                        what = ADDED  # added earlier in this same migration
                    elif is_required_column(before):
                        continue  # was already required: nothing new
                    else:
                        what = MADE_REQUIRED
                open_problems[key] = Problem(
                    path, app_label, op.model_name_lower, op.name, what
                )
                raised_in[key] = group

    return other_problems + list(open_problems.values())


def field_before_lookup(loader):
    """``field_before`` for find_unsafe_columns, from a MigrationLoader."""
    states = {}

    def field_before(app_label, migration_name, model_name, field_name):
        node = (app_label, migration_name)
        if node not in states:
            states[node] = loader.project_state(node, at_end=False)
        model_state = states[node].models.get((app_label, model_name))
        if model_state is None:
            return None
        return model_state.fields.get(field_name)

    return field_before
