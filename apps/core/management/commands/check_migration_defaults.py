"""
Fail when a migration not yet on the base ref adds a required column to an
existing model without a database default (RUNBOOK §8 rule 5).

    python manage.py check_migration_defaults                 # against origin/main
    python manage.py check_migration_defaults --base origin/test

Reads migration files and git only; it never connects to the database. The
base ref must be fetched (CI: ``git fetch --depth=1 origin main``).

If a column really can't have a default and the risk is understood, list it
on the migration with the reason, and say why in the pull request:

    class Migration(migrations.Migration):
        allow_add_field_without_db_default = {
            "tenantsettings.some_field": "why a rolled-back release never inserts here",
        }
"""

import subprocess
import sys
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db.migrations.loader import MigrationLoader

from apps.core.migration_checks import find_unsafe_add_fields, final_field_lookup


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


def new_migrations(loader: MigrationLoader, on_base: set[str], repo_root: Path):
    """(app_label, Migration, repo-relative path) for this project's
    migrations whose files aren't on the base ref."""
    found = []
    for (app_label, _name), migration in sorted(loader.graph.nodes.items()):
        module = sys.modules.get(type(migration).__module__)
        module_file = getattr(module, "__file__", None)
        if not module_file:
            continue
        try:
            path = Path(module_file).resolve().relative_to(repo_root).as_posix()
        except ValueError:
            continue  # a third-party app's migration, not in this repo
        if path not in on_base:
            found.append((app_label, migration, path))
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
        problems = find_unsafe_add_fields(
            pending, final_field_lookup(loader.project_state())
        )
        if not problems:
            self.stdout.write(
                self.style.SUCCESS(
                    f"{len(pending)} migration(s) not on {options['base']}: "
                    "no new required column lacks a database default."
                )
            )
            return
        for problem in problems:
            self.stdout.write(self.style.ERROR(problem.describe()))
        raise CommandError(
            f"{len(problems)} new required column(s) without db_default. "
            "See RUNBOOK §8 rule 5."
        )
