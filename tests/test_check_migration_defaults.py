"""
check_migration_defaults: a new migration must not add a required column to
an existing model, or make an existing column required, without a database
default (RUNBOOK §8 rule 5), because a rolled-back release can't insert rows.
"""

import subprocess
from pathlib import Path

import pytest
from django.conf import settings
from django.core.management import CommandError, call_command
from django.db import migrations, models
from django.db.migrations.loader import MigrationLoader

from apps.core.management.commands import check_migration_defaults as command
from apps.core.migration_checks import field_before_lookup, find_unsafe_columns

TENANTS_0012 = ("tenants", "0012_tenantsettings_checklist_roles_and_more")
TENANTS_0013 = ("tenants", "0013_checklist_settings_db_defaults")


def _migration(*operations, name="0099_demo", **attrs):
    migration = migrations.Migration(name, "demo")
    migration.operations = list(operations)
    for key, value in attrs.items():
        setattr(migration, key, value)
    return migration


def _check(*migs, before=None):
    """Run the check on demo migrations, in order. ``before`` maps
    (model, field) to the field as it was before (default: not there)."""
    before = before or {}
    new = [("demo", m, f"apps/demo/migrations/{m.name}.py") for m in migs]
    return find_unsafe_columns(
        new, lambda app, mig, model, field: before.get((model, field))
    )


def _add(name, field, model="gym"):
    return migrations.AddField(model_name=model, name=name, field=field)


def _alter(name, field, model="gym"):
    return migrations.AlterField(model_name=model, name=name, field=field)


def _required():
    return models.IntegerField(default=1)


# ─── what gets flagged ───────────────────────────────────────────────────────


def test_required_column_without_db_default_on_existing_model_is_flagged():
    found = _check(_migration(_add("level", _required())))
    assert [(f.model_name, f.field_name) for f in found] == [("gym", "level")]
    assert "db_default" in found[0].describe()
    assert "apps/demo/migrations/0099_demo.py" in found[0].describe()


def test_python_default_alone_is_not_enough():
    # Django drops the one-off default right after AddField.
    assert _check(_migration(_add("on", models.BooleanField(default=True))))


@pytest.mark.parametrize(
    "db_default", [None, models.Value(None)], ids=["None", "Value(None)"]
)
def test_a_null_db_default_is_no_default(db_default):
    # DEFAULT NULL on a NOT NULL column still rejects an insert that leaves it out.
    assert _check(_migration(_add("x", models.IntegerField(db_default=db_default))))


def test_required_column_added_inside_separate_database_and_state_is_flagged():
    op = migrations.SeparateDatabaseAndState(
        database_operations=[_add("level", _required())]
    )
    assert _check(_migration(op))


@pytest.mark.parametrize(
    "rename",
    [
        migrations.RenameField("gym", "level", "tier"),
        migrations.RenameModel("Gym", "Club"),
    ],
    ids=["field", "model"],
)
def test_renaming_afterwards_doesnt_hide_it(rename):
    found = _check(
        _migration(_add("level", _required())), _migration(rename, name="0100_rename")
    )
    assert len(found) == 1


def test_making_an_existing_nullable_column_required_is_flagged():
    # Older code still inserts NULL there.
    found = _check(
        _migration(_alter("trial_ends", models.DateTimeField())),
        before={("gym", "trial_ends"): models.DateTimeField(null=True)},
    )
    assert len(found) == 1
    assert "made required" in found[0].describe()


def test_removing_a_db_default_from_an_existing_column_is_flagged():
    found = _check(
        _migration(_alter("level", _required())),
        before={("gym", "level"): models.IntegerField(default=1, db_default=1)},
    )
    assert len(found) == 1


def test_adding_nullable_then_making_it_required_in_the_same_release_is_flagged():
    found = _check(
        _migration(_add("level", models.IntegerField(null=True))),
        _migration(_alter("level", _required()), name="0100_required"),
        # Before 0100, the field is the nullable one 0099 added.
        before={("gym", "level"): models.IntegerField(null=True)},
    )
    assert len(found) == 1


# ─── what passes ─────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "field",
    [
        models.IntegerField(default=1, db_default=1),
        models.IntegerField(db_default=1),
        models.IntegerField(null=True),
        models.ManyToManyField("demo.Other"),
    ],
    ids=["default_and_db_default", "db_default_only", "nullable", "many_to_many"],
)
def test_columns_old_code_can_leave_out_pass(field):
    assert _check(_migration(_add("x", field))) == []


def test_altering_an_already_required_column_passes():
    found = _check(
        _migration(_alter("name", models.CharField(max_length=200))),
        before={("gym", "name"): models.CharField(max_length=100)},
    )
    assert found == []


def test_state_only_add_field_touches_no_column():
    op = migrations.SeparateDatabaseAndState(
        state_operations=[_add("level", _required())]
    )
    assert _check(_migration(op)) == []


def test_model_created_in_the_same_release_passes():
    # Older code doesn't know the table, so it never inserts into it.
    create = migrations.CreateModel(
        name="Gym", fields=[("id", models.AutoField(primary_key=True))]
    )
    later = _migration(_add("level", _required()), name="0100_later")
    assert _check(_migration(create), later) == []


def test_a_later_migration_adding_db_default_fixes_it():
    fix = _migration(
        _alter("level", models.IntegerField(default=1, db_default=1)), name="0100_fix"
    )
    assert _check(_migration(_add("level", _required())), fix) == []


def test_a_later_rename_then_fix_is_followed():
    rename = _migration(
        migrations.RenameField("gym", "level", "tier"), name="0100_rename"
    )
    fix = _migration(
        _alter("tier", models.IntegerField(default=1, db_default=1)), name="0101_fix"
    )
    assert _check(_migration(_add("level", _required())), rename, fix) == []


def test_a_column_removed_again_passes():
    remove = _migration(migrations.RemoveField("gym", "level"), name="0100_remove")
    assert _check(_migration(_add("level", _required())), remove) == []


# ─── exemptions ──────────────────────────────────────────────────────────────


def test_exemption_with_a_reason_passes():
    mig = _migration(
        _add("level", _required()),
        allow_without_db_default={"Gym.Level": "written only by a worker"},
    )
    assert _check(mig) == []


def test_exemption_without_a_reason_fails():
    mig = _migration(
        _add("level", _required()), allow_without_db_default={"gym.level": " "}
    )
    assert any("without a reason" in p.describe() for p in _check(mig))


def test_exemption_naming_nothing_in_the_migration_fails():
    mig = _migration(
        _add("level", models.IntegerField(null=True)),
        allow_without_db_default={"gym.levle": "typo"},
    )
    found = _check(mig)
    assert len(found) == 1
    assert "doesn't add or alter it" in found[0].describe()


# ─── against this repo's real migrations ─────────────────────────────────────


def _real(*keys):
    loader = MigrationLoader(None, ignore_no_migrations=True)
    new = [
        (app, loader.graph.nodes[(app, name)], f"{app}/{name}.py") for app, name in keys
    ]
    return find_unsafe_columns(new, field_before_lookup(loader))


def test_would_have_caught_tenants_0012_before_0013_fixed_it():
    assert {f.field_name for f in _real(TENANTS_0012)} == {
        "facilities_checklists_enabled",
        "checklist_roles",
        "facilities_alert_start_hour",
        "facilities_alert_end_hour",
    }


def test_tenants_0012_with_0013_passes():
    assert _real(TENANTS_0012, TENANTS_0013) == []


# ─── which migrations count as new ───────────────────────────────────────────


class _OneMigrationLoader:
    def __init__(self, node, migration):
        graph = type("Graph", (), {})()
        graph.nodes = {node: migration}
        graph.leaf_nodes = lambda: [node]
        graph.forwards_plan = lambda n: [n]
        self.graph = graph


def test_a_squash_of_migrations_already_on_the_base_is_not_new(monkeypatch):
    # Its operations already ran on production; re-checking them would flag
    # old columns that only had a Python default.
    squash = migrations.Migration("0099_squashed", "tenants")
    squash.replaces = [("tenants", "0011_x"), ("tenants", "0012_y")]
    folder = "apps/tenants/migrations"
    repo_root = Path(settings.BASE_DIR).resolve()
    monkeypatch.setattr(
        command,
        "migration_file",
        lambda m: str(repo_root / folder / "0099_squashed.py"),
    )
    loader = _OneMigrationLoader(("tenants", "0099_squashed"), squash)

    both = {f"{folder}/0011_x.py", f"{folder}/0012_y.py"}
    assert command.new_migrations(loader, both, repo_root) == []
    # One of them isn't live yet: the squash carries new operations.
    only_one = {f"{folder}/0011_x.py"}
    assert len(command.new_migrations(loader, only_one, repo_root)) == 1


# ─── the command ─────────────────────────────────────────────────────────────


def _in_a_git_checkout():
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=settings.BASE_DIR, capture_output=True
        )
    except OSError:
        return False
    return result.returncode == 0


needs_git = pytest.mark.skipif(
    not _in_a_git_checkout(), reason="needs a git checkout (not in the Docker image)"
)


@needs_git
def test_command_passes_when_every_migration_is_on_the_base(capsys):
    call_command("check_migration_defaults", base="HEAD")
    assert "no new required column" in capsys.readouterr().out


@needs_git
def test_command_fails_and_names_the_column(monkeypatch, capsys):
    real_paths_on, real_new = command.paths_on, command.new_migrations

    def everything_but_0012(ref, repo_root):
        return {p for p in real_paths_on("HEAD", repo_root) if TENANTS_0012[1] not in p}

    def without_0013(loader, on_base, repo_root):
        # As if 0013 hadn't been written yet.
        return [
            m
            for m in real_new(loader, on_base, repo_root)
            if m[1].name != TENANTS_0013[1]
        ]

    monkeypatch.setattr(command, "paths_on", everything_but_0012)
    monkeypatch.setattr(command, "new_migrations", without_0013)
    with pytest.raises(CommandError, match="4 problem"):
        call_command("check_migration_defaults")
    out = capsys.readouterr().out
    assert "tenants.tenantsettings.facilities_checklists_enabled" in out
    assert "0012_tenantsettings_checklist_roles_and_more.py" in out


@needs_git
def test_command_explains_an_unfetched_base():
    with pytest.raises(CommandError, match="git fetch"):
        call_command("check_migration_defaults", base="origin/no-such-branch")
