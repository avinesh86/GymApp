import logging

from celery import shared_task
from django.utils import timezone

from apps.core.timezones import local_today, to_tenant_local

from .emails import send_report
from .export import last_full_period
from .models import ReportSchedule

logger = logging.getLogger(__name__)


@shared_task(name="reports.send_scheduled_reports")
def send_scheduled_reports():
    """
    Runs every 15 minutes. Emails each active schedule's report for the
    period that last ended (yesterday, last week or last month), once per
    period, from the schedule's send time in the gym's timezone. A missed run
    catches up on the next one.
    """
    sent = 0
    schedules = ReportSchedule.objects.filter(
        is_active=True, is_deleted=False, created_by__isnull=False
    ).select_related("tenant", "created_by")
    for schedule in schedules:
        now = to_tenant_local(timezone.now(), schedule.tenant)
        if now.time() < schedule.send_time:
            continue
        start, _ = last_full_period(schedule.frequency, local_today(schedule.tenant))
        if schedule.last_period_start == start or not schedule.recipients:
            continue
        try:
            send_report(schedule, start)
        except Exception:
            logger.exception("Scheduled report %s failed", schedule.pk)
            continue
        schedule.last_period_start = start
        schedule.last_sent_at = timezone.now()
        schedule.save(update_fields=["last_period_start", "last_sent_at", "updated_at"])
        sent += 1

    logger.info("send_scheduled_reports: sent %d reports", sent)
    return sent
