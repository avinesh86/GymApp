"""
PythonAnywhere scheduled task runner.

Replaces Celery Beat on PythonAnywhere where background workers are not
available.  PA's Hacker plan supports one scheduled task, so this single
management command runs ALL periodic tasks in sequence.

Usage (set this in PA → Tasks → Scheduled tasks, hourly):

    cd /home/<username>/GymApp && /home/<username>/.virtualenvs/fitops/bin/python manage.py run_scheduled_tasks

The command is idempotent and safe to re-run.  Individual task failures
are logged but do not prevent subsequent tasks from running.
"""
import logging

from django.core.management.base import BaseCommand

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Runs all periodic background tasks (replaces Celery Beat on PythonAnywhere)."

    def handle(self, *args, **options):
        self.stdout.write("━" * 60)
        self.stdout.write("Running scheduled tasks...")
        self.stdout.write("━" * 60)

        results = []

        # 1. Generate upcoming recurring timetable events (daily)
        results.append(self._run_task(
            "Generate recurring events",
            "apps.timetable.tasks",
            "generate_upcoming_recurring_events",
        ))

        # 2. Check unfilled classes (daily)
        results.append(self._run_task(
            "Check unfilled classes",
            "apps.timetable.tasks",
            "check_unfilled_classes",
        ))

        # 3. Expire stale cover offers (every 30 min — fine to run hourly)
        results.append(self._run_task(
            "Expire cover offers",
            "apps.cover.tasks",
            "expire_cover_offers",
        ))

        # 4. Send cover reminders (hourly)
        results.append(self._run_task(
            "Send cover reminders",
            "apps.cover.tasks",
            "send_cover_reminders",
        ))

        # 5. Process pending notifications (every 5 min — runs on each invocation)
        results.append(self._run_task(
            "Send pending notifications",
            "apps.notifications.tasks",
            "send_pending_notifications",
        ))

        # 6. Auto-generate invoices (frequency-dependent — safe to check hourly)
        results.append(self._run_task(
            "Auto-generate invoices",
            "apps.invoices.tasks",
            "auto_generate_invoices",
        ))

        # 7. Send invoice reminders (weekly — safe to run every invocation,
        #    the task itself is idempotent)
        results.append(self._run_task(
            "Send invoice reminders",
            "apps.invoices.tasks",
            "send_invoice_reminders",
        ))

        self.stdout.write("")
        self.stdout.write("━" * 60)
        passed = sum(1 for ok, _ in results if ok)
        failed = len(results) - passed
        style = self.style.SUCCESS if failed == 0 else self.style.WARNING
        self.stdout.write(style(
            f"Done: {passed} passed, {failed} failed out of {len(results)} tasks."
        ))

    def _run_task(self, label: str, module_path: str, func_name: str):
        """Import and execute a single task function, catching any errors."""
        self.stdout.write(f"\n▸ {label}...")
        try:
            import importlib
            module = importlib.import_module(module_path)
            task_func = getattr(module, func_name)

            # Call the underlying function directly (not .delay())
            # For @shared_task decorated functions, calling them directly
            # executes synchronously.
            result = task_func()
            self.stdout.write(self.style.SUCCESS(f"  ✓ {label}: {result}"))
            return True, result
        except Exception as exc:
            logger.exception("Scheduled task '%s' failed", label)
            self.stdout.write(self.style.ERROR(f"  ✗ {label}: {exc}"))
            return False, str(exc)
