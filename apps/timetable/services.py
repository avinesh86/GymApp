import logging
from datetime import date, timedelta

from django.utils import timezone

from apps.core.audit import log_audit

from .models import RecurringTimetableRule, TimetableEvent

logger = logging.getLogger(__name__)


def generate_recurring_events(rule: RecurringTimetableRule, from_date: date, to_date: date) -> list:
    """
    Generates TimetableEvent rows for a recurring rule between from_date and to_date
    (inclusive).  Skips dates where an event already exists for this rule to
    ensure idempotency.

    Returns a list of the created TimetableEvent instances.
    """
    from apps.timetable.models import ClassType

    if not rule.is_active:
        return []

    effective_from = max(from_date, rule.valid_from)
    effective_to = min(to_date, rule.valid_to) if rule.valid_to else to_date

    if effective_from > effective_to:
        return []

    existing_datetimes = set(
        TimetableEvent.objects.filter(
            tenant=rule.tenant,
            recurring_rule=rule,
            start_datetime__date__gte=effective_from,
            start_datetime__date__lte=effective_to,
        ).values_list("start_datetime__date", flat=True)
    )

    events_to_create = []
    current = effective_from

    while current <= effective_to:
        if current.weekday() == rule.day_of_week and current not in existing_datetimes:
            start_dt = timezone.datetime.combine(current, rule.start_time)
            if timezone.is_naive(start_dt):
                start_dt = timezone.make_aware(start_dt)
            end_dt = start_dt + timedelta(minutes=rule.class_type.duration_minutes)
            events_to_create.append(
                TimetableEvent(
                    tenant=rule.tenant,
                    class_type=rule.class_type,
                    site=rule.site,
                    instructor=rule.instructor,
                    start_datetime=start_dt,
                    end_datetime=end_dt,
                    status=(
                        TimetableEvent.Status.SCHEDULED
                        if rule.instructor
                        else TimetableEvent.Status.UNFILLED
                    ),
                    recurring_rule=rule,
                )
            )
        current += timedelta(days=1)

    created = TimetableEvent.objects.bulk_create(events_to_create)
    logger.info("Generated %d events for rule %s", len(created), rule.pk)
    return created


def get_week_events(tenant, from_date: date) -> list:
    """Returns all non-deleted events for the week starting from_date."""
    to_date = from_date + timedelta(days=6)
    return (
        TimetableEvent.objects.filter(
            tenant=tenant,
            is_deleted=False,
            start_datetime__date__gte=from_date,
            start_datetime__date__lte=to_date,
        )
        .select_related("class_type", "site", "instructor")
        .order_by("start_datetime")
    )


def assign_instructor(timetable_event: TimetableEvent, instructor, assigned_by) -> TimetableEvent:
    """Assign an instructor to a timetable event, or unassign when instructor is None.

    Assigning marks the event scheduled; unassigning (instructor=None) marks it
    unfilled so it surfaces as needing an instructor again.
    """
    before = {"instructor_id": timetable_event.instructor_id, "status": timetable_event.status}

    timetable_event.instructor = instructor
    timetable_event.status = (
        TimetableEvent.Status.SCHEDULED if instructor else TimetableEvent.Status.UNFILLED
    )
    timetable_event.updated_by = assigned_by
    timetable_event.save(update_fields=["instructor", "status", "updated_by", "updated_at"])

    after = {
        "instructor_id": instructor.pk if instructor else None,
        "status": timetable_event.status,
    }
    log_audit(assigned_by, "assign_instructor", timetable_event, before, after)
    return timetable_event


def cancel_event(timetable_event: TimetableEvent, cancelled_by, reason: str = "") -> TimetableEvent:
    """Soft-cancels a timetable event."""
    before = {"status": timetable_event.status}

    timetable_event.status = TimetableEvent.Status.CANCELLED
    timetable_event.notes = (timetable_event.notes + f"\nCancelled: {reason}").strip()
    timetable_event.updated_by = cancelled_by
    timetable_event.save(update_fields=["status", "notes", "updated_by", "updated_at"])

    after = {"status": TimetableEvent.Status.CANCELLED, "reason": reason}
    log_audit(cancelled_by, "cancel_event", timetable_event, before, after)
    return timetable_event
