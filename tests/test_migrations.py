"""
Migration health checks.

These are the checks `scripts/deploy.sh` runs against the server before it
applies anything — running them in CI too means a broken migration set fails a
pull request instead of a deploy.
"""

from io import StringIO

import pytest
from django.apps import apps
from django.core.management import call_command
from django.db import connection
from django.db.migrations.autodetector import MigrationAutodetector
from django.db.migrations.executor import MigrationExecutor
from django.db.migrations.loader import MigrationLoader
from django.db.migrations.questioner import NonInteractiveMigrationQuestioner
from django.db.migrations.state import ProjectState


def test_no_model_changes_without_a_migration():
    """Every model change must ship with the migration that applies it.

    A model edited without `makemigrations` deploys fine and then fails at
    runtime with a missing column, which is a painful way to find out.
    """
    loader = MigrationLoader(None, ignore_no_migrations=True)
    autodetector = MigrationAutodetector(
        loader.project_state(),
        ProjectState.from_apps(apps),
        NonInteractiveMigrationQuestioner(specified_apps=set(), dry_run=True),
    )
    changes = autodetector.changes(graph=loader.graph)

    described = {
        app: [operation.describe() for m in migrations for operation in m.operations]
        for app, migrations in changes.items()
    }
    assert not changes, f"Models changed with no migration: {described}"


@pytest.mark.django_db
def test_every_migration_is_applied():
    """The test database is fully migrated — no migration silently fails."""
    executor = MigrationExecutor(connection)
    targets = executor.loader.graph.leaf_nodes()
    plan = executor.migration_plan(targets)

    assert plan == [], f"Unapplied migrations: {[str(migration) for migration, _ in plan]}"


@pytest.mark.django_db
def test_migration_graph_has_no_conflicts():
    """Two migrations with the same parent (a merge conflict) break `migrate`."""
    loader = MigrationLoader(connection)
    conflicts = loader.detect_conflicts()

    assert not conflicts, f"Conflicting migrations: {conflicts}"


@pytest.mark.django_db
def test_migrate_plan_runs_clean():
    """`migrate --plan` is what the deploy script prints before applying."""
    output = StringIO()
    call_command("migrate", "--plan", stdout=output, verbosity=1)

    assert "No planned migration operations" in output.getvalue()
