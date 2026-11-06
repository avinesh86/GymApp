"""
Fail when a migration not yet on the base ref adds a required column to an
existing model, or makes an existing column required, without a database
default (RUNBOOK §8 rule 5). See apps/core/migration_checks.py.

    python manage.py check_migration_defaults                 # against origin/main
    python manage.py check_migration_defaults --base origin/test

Reads migration files and git only; it never connects to the database. The
base ref must be fetched (CI: ``git fetch --depth=1 origin main``).

If a column really can't have a default and the risk is understood, list it
on the migration with the reason, and say why in the pull request:

    class Migration(migrations.Migration):
        allow_without_db_default = {
            "tenantsettings.some_field": "why a rolled-back release never inserts here",
        }
"""

import subprocess
import sys
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db.migrations.loader import MigrationLoader

from apps.core.migration_checks import field_before_lookup, find_unsafe_columns


def paths_on(ref: str, repo_root: Path) -> set[str]:
    """Every file path in ``ref``'s tree, relative to the repo root."""
    try:
        result = subprocess.run(
            ["git", "ls-tree", "-r", "--name-only", ref],
            cwd=repo_root,
            capture_output=True,
            text=True,
            check=True,
        )
    except (OSError, subprocess.CalledProcessError) as exc:
        detail = getattr(exc, "stderr", "") or str(exc)
        raise CommandError(
            f"Can't list the files on {ref!r} ({detail.strip()}). "
            f"Fetch it first, e.g. `git fetch --depth=1 origin main`."
        ) from exc
    return set(result.stdout.splitlines())


def migration_file(migration):
    module = sys.modules.get(type(migration).__module__)
    return getattr(module, "__file__", None)


def new_migrations(loader, on_base: set[str], repo_root: Path):
    """(app_label, Migration, repo-relative path) for this project's
    migrations whose files aren't on the base ref, in the order they apply.

    A squashed migration counts as already live when every migration it
    replaces is on the base ref (its operations ran there already); one that
    replaces unreleased migrations is refused."""
    plan = []
    for leaf in sorted(loader.graph.leaf_nodes()):
        plan += loader.graph.forwards_plan(leaf)
    found, seen = [], set()
    for node in plan:
        if node in seen:
            continue
        seen.add(node)
        migration = loader.graph.nodes[node]
        module_file = migration_file(migration)
        if not module_file:
            continue
        try:
            relative = Path(module_file).resolve().relative_to(repo_root)
        except ValueError:
            continue  # a third-party app's migration, not in this repo
        if {"site-packages", "dist-packages"} & set(relative.parts):
            continue  # a virtualenv inside the repo
        if relative.as_posix() in on_base:
            continue
        replaced = [
            (relative.parent / f"{name}.py").as_posix()
            for app_label, name in (migration.replaces or [])
            if app_label == node[0]
        ]
        if migration.replaces:
            if len(replaced) == len(migration.replaces) and all(
                path in on_base for path in replaced
            ):
                continue
            # Its replaced migrations aren't loaded (no database), so what
            # they add can't be checked through the squash.
            raise CommandError(
                f"{relative.as_posix()} squashes migrations that aren't on the "
                "base yet. Only squash migrations that are already released."
            )
        found.append((node[0], migration, relative.as_posix()))
    return found


class Command(BaseCommand):
    help = (
        "Fail when a new migration adds a required column to an existing model "
        "without db_default (unsafe to roll back)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--base",
            default="origin/main",
            help="Migrations whose files are on this git ref are already live (default: origin/main).",
        )

    def handle(self, *args, **options):
        repo_root = Path(settings.BASE_DIR).resolve()
        on_base = paths_on(options["base"], repo_root)
        loader = MigrationLoader(None, ignore_no_migrations=True)
        pending = new_migrations(loader, on_base, repo_root)
        problems = find_unsafe_columns(pending, field_before_lookup(loader))
        if not problems:
            self.stdout.write(
                self.style.SUCCESS(
                    f"{len(pending)} migration(s) not on {options['base']}: "
                    "no new required column without a database default."
                )
            )
            return
        for problem in problems:
            self.stdout.write(self.style.ERROR(problem.describe()))
        raise CommandError(
            f"{len(problems)} problem(s) with new required columns. "
            "See RUNBOOK §8 rule 5."
        )
