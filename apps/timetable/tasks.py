import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from apps.core.timezones import local_day_bounds, local_today
from apps.tenants.models import Tenant

from .models import RecurringTimetableRule, TimetableEvent
from .services import generate_recurring_events

logger = logging.getLogger(__name__)


@shared_task(name="timetable.generate_upcoming_recurring_events")
def generate_upcoming_recurring_events():
    """
    Runs daily.  Generates timetable events for the next 4 weeks for every
    active recurring rule across all active tenants.
    """
    rules = (
        RecurringTimetableRule.objects.filter(is_active=True, tenant__is_active=True)
        .select_related("tenant", "class_type", "site", "instructor")
    )

    total_created = 0
    for rule in rules:
        # From the gym's today: in UTC it can still be yesterday there.
        from_date = local_today(rule.tenant)
        to_date = from_date + timedelta(weeks=4)
        try:
            created = generate_recurring_events(rule, from_date, to_date)
            total_created += len(created)
        except Exception:
            logger.exception("Failed to generate events for rule %s", rule.pk)

    logger.info("generate_upcoming_recurring_events: created %d events", total_created)
    return total_created


@shared_task(name="timetable.check_unfilled_classes")
def check_unfilled_classes():
    """
    Runs daily.  Flags upcoming events that have no instructor assigned.
    """
    count = 0
    for tenant in Tenant.objects.filter(is_active=True).select_related("settings"):
        # Upcoming from the start of the gym's today, not UTC's.
        today = local_today(tenant)
        day_start, _ = local_day_bounds(tenant, today, today)
        count += TimetableEvent.objects.filter(
            tenant=tenant,
            is_deleted=False,
            instructor__isnull=True,
            start_datetime__gte=day_start,
            status=TimetableEvent.Status.SCHEDULED,
        ).update(status=TimetableEvent.Status.UNFILLED)
    logger.info("check_unfilled_classes: flagged %d events as unfilled", count)
    return count


@shared_task(name="timetable.mark_past_events_completed")
def mark_past_events_completed():
    """
    Runs hourly.  Transitions past events that were never closed out
    (scheduled / unfilled / needs_cover) to COMPLETED, so the timetable
    stops showing a finished class as 'Scheduled'.

    Cancelled and already-completed events are left untouched.  Attendance
    can still be recorded afterwards: the awaiting-attendance list keys off
    "has no AttendanceRecord", not status, so completed-but-unrecorded
    classes continue to prompt for an attendance count.
    """
    now = timezone.now()
    open_statuses = [
        TimetableEvent.Status.SCHEDULED,
        TimetableEvent.Status.UNFILLED,
        TimetableEvent.Status.NEEDS_COVER,
    ]
    count = (
        TimetableEvent.objects.filter(
            is_deleted=False,
            end_datetime__lt=now,
            status__in=open_statuses,
        )
        # .update() bypasses auto_now, so set updated_at explicitly.
        .update(status=TimetableEvent.Status.COMPLETED, updated_at=now)
    )
    logger.info("mark_past_events_completed: completed %d past events", count)
    return count
