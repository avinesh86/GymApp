import logging
from datetime import date, timedelta

from celery import shared_task

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
    from_date = date.today()
    to_date = from_date + timedelta(weeks=4)

    rules = (
        RecurringTimetableRule.objects.filter(is_active=True, tenant__is_active=True)
        .select_related("tenant", "class_type", "site", "instructor")
    )

    total_created = 0
    for rule in rules:
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
    today = date.today()
    count = (
        TimetableEvent.objects.filter(
            is_deleted=False,
            instructor__isnull=True,
            start_datetime__date__gte=today,
            status=TimetableEvent.Status.SCHEDULED,
        )
        .update(status=TimetableEvent.Status.UNFILLED)
    )
    logger.info("check_unfilled_classes: flagged %d events as unfilled", count)
    return count
