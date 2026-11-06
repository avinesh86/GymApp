"""
check_migration_defaults: a new migration must not add a required column to
an existing model without a database default (RUNBOOK §8 rule 5), because a
rolled-back release can't insert rows into it.
"""

import subprocess

import pytest
from django.conf import settings
from django.core.management import CommandError, call_command
from django.db import migrations, models
from django.db.migrations.loader import MigrationLoader

from apps.core.management.commands import check_migration_defaults as command
from apps.core.migration_checks import find_unsafe_add_fields, final_field_lookup

TENANTS_0012 = ("tenants", "0012_tenantsettings_checklist_roles_and_more")
TENANTS_0013 = ("tenants", "0013_checklist_settings_db_defaults")


def _migration(*operations, name="0099_demo", **attrs):
    migration = migrations.Migration(name, "demo")
    migration.operations = list(operations)
    for key, value in attrs.items():
        setattr(migration, key, value)
    return migration


def _check(*migs, final=None):
    """Run the check on demo migrations. ``final`` maps field name to the
    field as the last migration leaves it; by default, as it was added."""
    new = [("demo", m, f"apps/demo/migrations/{m.name}.py") for m in migs]
    if final is None:
        final = {
            op.name: op.field
            for m in migs
            for op in m.operations
            if isinstance(op, migrations.AddField)
        }
    return find_unsafe_add_fields(new, lambda app, model, field: final.get(field))


def _add(name, field, model="gym"):
    return migrations.AddField(model_name=model, name=name, field=field)


# ─── what gets flagged ───────────────────────────────────────────────────────


def test_required_column_without_db_default_on_existing_model_is_flagged():
    found = _check(_migration(_add("level", models.IntegerField(default=1))))
    assert [(f.model_name, f.field_name) for f in found] == [("gym", "level")]
    assert "db_default" in found[0].describe()
    assert "apps/demo/migrations/0099_demo.py" in found[0].describe()


def test_python_default_alone_is_not_enough():
    # Django drops the one-off default right after AddField.
    assert _check(_migration(_add("on", models.BooleanField(default=True))))


def test_required_column_added_inside_separate_database_and_state_is_flagged():
    op = migrations.SeparateDatabaseAndState(
        database_operations=[_add("level", models.IntegerField(default=1))]
    )
    assert _check(_migration(op), final={"level": models.IntegerField(default=1)})


@pytest.mark.parametrize(
    "field",
    [
        models.IntegerField(default=1, db_default=1),
        models.IntegerField(null=True),
        models.ManyToManyField("demo.Other"),
    ],
    ids=["db_default", "nullable", "many_to_many"],
)
def test_columns_old_code_can_leave_out_pass(field):
    assert _check(_migration(_add("x", field))) == []


def test_state_only_add_field_touches_no_column():
    op = migrations.SeparateDatabaseAndState(
        state_operations=[_add("level", models.IntegerField(default=1))]
    )
    assert _check(_migration(op)) == []


def test_model_created_in_the_same_release_passes():
    # Older code doesn't know the table, so it never inserts into it.
    create = migrations.CreateModel(
        name="Gym", fields=[("id", models.AutoField(primary_key=True))]
    )
    later = _migration(_add("level", models.IntegerField(default=1)), name="0100_later")
    assert _check(_migration(create), later) == []


def test_a_later_migration_adding_db_default_fixes_it():
    final = {"level": models.IntegerField(default=1, db_default=1)}
    assert (
        _check(_migration(_add("level", models.IntegerField(default=1))), final=final)
        == []
    )


def test_a_column_removed_again_passes():
    assert (
        _check(_migration(_add("level", models.IntegerField(default=1))), final={})
        == []
    )


def test_exemption_needs_a_reason():
    add = _add("level", models.IntegerField(default=1))
    with_reason = _migration(
        add,
        allow_add_field_without_db_default={"gym.level": "written only by a worker"},
    )
    without_reason = _migration(
        add, allow_add_field_without_db_default={"gym.level": " "}
    )
    assert _check(with_reason) == []
    assert _check(without_reason)


# ─── against this repo's real migrations ─────────────────────────────────────


def _real(*keys):
    loader = MigrationLoader(None, ignore_no_migrations=True)
    new = [
        (app, loader.graph.nodes[(app, name)], f"{app}/{name}.py") for app, name in keys
    ]
    return loader, new


def test_would_have_caught_tenants_0012_before_0013_fixed_it():
    loader, new = _real(TENANTS_0012)
    state = loader.project_state(TENANTS_0012)
    found = find_unsafe_add_fields(new, final_field_lookup(state))
    assert {f.field_name for f in found} == {
        "facilities_checklists_enabled",
        "checklist_roles",
        "facilities_alert_start_hour",
        "facilities_alert_end_hour",
    }


def test_tenants_0012_with_0013_passes():
    loader, new = _real(TENANTS_0012, TENANTS_0013)
    assert find_unsafe_add_fields(new, final_field_lookup(loader.project_state())) == []


# ─── the command ─────────────────────────────────────────────────────────────


def _in_a_git_checkout():
    try:
        return (
            subprocess.run(
                ["git", "rev-parse", "HEAD"], cwd=settings.BASE_DIR, capture_output=True
            ).returncode
            == 0
        )
    except OSError:
        return False


needs_git = pytest.mark.skipif(
    not _in_a_git_checkout(), reason="needs a git checkout (not in the Docker image)"
)


@needs_git
def test_command_passes_when_every_migration_is_on_the_base(capsys):
    call_command("check_migration_defaults", base="HEAD")
    assert "no new required column" in capsys.readouterr().out


@needs_git
def test_command_fails_and_names_the_column(monkeypatch, capsys):
    real_paths_on, real_lookup = command.paths_on, command.final_field_lookup

    def everything_but_0012(ref, repo_root):
        return {p for p in real_paths_on("HEAD", repo_root) if TENANTS_0012[1] not in p}

    monkeypatch.setattr(command, "paths_on", everything_but_0012)
    # The state as it was before 0013 existed.
    monkeypatch.setattr(
        command,
        "final_field_lookup",
        lambda _state: real_lookup(
            MigrationLoader(None, ignore_no_migrations=True).project_state(TENANTS_0012)
        ),
    )
    with pytest.raises(CommandError, match="4 new required column"):
        call_command("check_migration_defaults")
    out = capsys.readouterr().out
    assert "tenants.tenantsettings.facilities_checklists_enabled" in out
    assert "0012_tenantsettings_checklist_roles_and_more.py" in out


@needs_git
def test_command_explains_an_unfetched_base():
    with pytest.raises(CommandError, match="git fetch"):
        call_command("check_migration_defaults", base="origin/no-such-branch")
