import logging

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=0)
def run_import_job(self, job_id: int) -> None:
    """
    Process a CSV import job in the background.

    The view creates the ImportJob record and saves the file, then
    dispatches this task immediately.  The task reads the file from
    storage, runs the appropriate parser, and updates the job with
    the final counts and any row-level errors.
    """
    from .models import ImportJob
    from .parsers import import_attendance, import_staff, import_timetable

    handlers = {
        ImportJob.ImportType.STAFF: import_staff,
        ImportJob.ImportType.TIMETABLE: import_timetable,
        ImportJob.ImportType.ATTENDANCE: import_attendance,
    }

    try:
        job = ImportJob.objects.select_related("tenant", "created_by").get(pk=job_id)
    except ImportJob.DoesNotExist:
        logger.error("run_import_job: ImportJob %d not found", job_id)
        return

    handler = handlers.get(job.import_type)
    if handler is None:
        job.status = ImportJob.Status.FAILED
        job.error_log = [{"error": f"Unknown import type: {job.import_type}"}]
        job.save(update_fields=["status", "error_log"])
        return

    job.status = ImportJob.Status.PROCESSING
    job.save(update_fields=["status"])

    try:
        file_content = job.file.read()
        rows_success, rows_failed, error_log = handler(
            file_content, job.tenant, job.created_by
        )
        job.rows_total = rows_success + rows_failed
        job.rows_success = rows_success
        job.rows_failed = rows_failed
        job.error_log = error_log
        job.status = ImportJob.Status.COMPLETE
        job.completed_at = timezone.now()
    except Exception as exc:
        logger.exception("run_import_job: unhandled error for job %d", job_id)
        job.status = ImportJob.Status.FAILED
        job.error_log = [{"error": str(exc)}]
    finally:
        job.save(update_fields=[
            "rows_total", "rows_success", "rows_failed",
            "error_log", "status", "completed_at",
        ])
