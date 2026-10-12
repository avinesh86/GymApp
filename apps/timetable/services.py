import logging
from datetime import date, timedelta

from django.utils import timezone

from apps.core.audit import log_audit
from apps.core.timezones import local_day_bounds, tenant_timezone

from .models import RecurringTimetableRule, TimetableEvent

logger = logging.getLogger(__name__)


def _local_bounds(day: date, start_time, end_time, tz):
    """Aware start/end for a class on ``day`` at the gym's wall-clock times.
    An end at or before the start runs past midnight."""
    start_dt = timezone.make_aware(timezone.datetime.combine(day, start_time), tz)
    end_dt = timezone.make_aware(timezone.datetime.combine(day, end_time), tz)
    if end_dt <= start_dt:
        end_dt += timedelta(days=1)
    return start_dt, end_dt


def _occurrence_bounds(rule: RecurringTimetableRule, day: date, tz):
    if rule.end_time:
        return _local_bounds(day, rule.start_time, rule.end_time, tz)
    start_dt = timezone.make_aware(timezone.datetime.combine(day, rule.start_time), tz)
    return start_dt, start_dt + timedelta(minutes=rule.class_type.duration_minutes)


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

    # The rule's start_time is the gym's wall-clock time, so build and compare
    # dates in the gym's timezone, not UTC.
    tz = tenant_timezone(rule.tenant)
    range_start, range_end = local_day_bounds(rule.tenant, effective_from, effective_to)
    existing_dates = {
        timezone.localtime(start, tz).date()
        for start in TimetableEvent.objects.filter(
            tenant=rule.tenant,
            recurring_rule=rule,
            start_datetime__gte=range_start,
            start_datetime__lt=range_end,
        ).values_list("start_datetime", flat=True)
    }

    events_to_create = []
    current = effective_from

    while current <= effective_to:
        if current.weekday() == rule.day_of_week and current not in existing_dates:
            start_dt, end_dt = _occurrence_bounds(rule, current, tz)
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
                    recurring_pattern_id=rule.series_id,
                )
            )
        current += timedelta(days=1)

    created = TimetableEvent.objects.bulk_create(events_to_create)
    logger.info("Generated %d events for rule %s", len(created), rule.pk)
    return created


def get_week_events(tenant, from_date: date) -> list:
    """Returns all non-deleted events for the week starting from_date."""
    week_start, week_end = local_day_bounds(tenant, from_date, from_date + timedelta(days=6))
    return (
        TimetableEvent.objects.filter(
            tenant=tenant,
            is_deleted=False,
            start_datetime__gte=week_start,
            start_datetime__lt=week_end,
        )
        .select_related("class_type", "site", "instructor", "attendance_record")
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


# ─── Series edit / delete ─────────────────────────────────────────────────────

class SeriesScope:
    FOLLOWING = "following"  # this class and every later one in the series
    ALL = "all"              # every class in the series
    CHOICES = (FOLLOWING, ALL)


def _series_lookup(event: TimetableEvent) -> dict | None:
    """How to find the rest of an event's series, or None if it has none.

    Rules created together share a series_id, which their events carry as
    recurring_pattern_id. Events generated before series ids existed only have
    their rule, so that rule is their series.
    """
    if event.recurring_pattern_id:
        return {"recurring_pattern_id": event.recurring_pattern_id}
    if event.recurring_rule_id:
        return {"recurring_rule_id": event.recurring_rule_id}
    return None


def is_in_series(event: TimetableEvent) -> bool:
    return _series_lookup(event) is not None


def series_rules(event: TimetableEvent):
    qs = RecurringTimetableRule.objects.filter(tenant=event.tenant, is_deleted=False)
    if event.recurring_pattern_id:
        return qs.filter(series_id=event.recurring_pattern_id)
    if event.recurring_rule_id:
        return qs.filter(pk=event.recurring_rule_id)
    return qs.none()


def series_events(event: TimetableEvent, scope: str):
    """The classes a series action touches.

    Classes with attendance recorded are left alone: they feed reports,
    payroll and invoices, so a series change must not rewrite or remove them.
    """
    lookup = _series_lookup(event)
    if lookup is None:
        return TimetableEvent.objects.none()
    qs = TimetableEvent.objects.filter(
        tenant=event.tenant, is_deleted=False, attendance_record__isnull=True, **lookup
    )
    if scope == SeriesScope.FOLLOWING:
        qs = qs.filter(start_datetime__gte=event.start_datetime)
    return qs.order_by("start_datetime")


def _cutoff_date(event: TimetableEvent) -> date:
    """The class's calendar day in the gym's timezone."""
    return timezone.localtime(event.start_datetime, tenant_timezone(event.tenant)).date()


def update_series(event: TimetableEvent, scope: str, changes: dict, updated_by) -> int:
    """Apply ``changes`` (start_time, end_time, site, notes, internal_notes) to
    the classes in the series. Returns how many classes changed.

    Times are wall-clock times applied on each class's own local date. The
    series' rules are updated too, so classes generated later match. With
    scope "following" each rule is split at this class's date, so earlier
    classes are not touched.
    """
    from django.db import transaction

    tz = tenant_timezone(event.tenant)
    now = timezone.now()
    with transaction.atomic():
        events = list(series_events(event, scope))
        for ev in events:
            day = timezone.localtime(ev.start_datetime, tz).date()
            if "end_time" in changes:
                start_time = changes.get("start_time") or timezone.localtime(ev.start_datetime, tz).time()
                ev.start_datetime, ev.end_datetime = _local_bounds(day, start_time, changes["end_time"], tz)
            elif "start_time" in changes:
                # Keep each class's length when only the start moves.
                duration = ev.end_datetime - ev.start_datetime
                ev.start_datetime = timezone.make_aware(
                    timezone.datetime.combine(day, changes["start_time"]), tz
                )
                ev.end_datetime = ev.start_datetime + duration
            for field in ("site", "notes", "internal_notes"):
                if field in changes:
                    setattr(ev, field, changes[field])
            ev.updated_by = updated_by
            ev.updated_at = now  # bulk_update skips auto_now
        TimetableEvent.objects.bulk_update(
            events,
            ["start_datetime", "end_datetime", "site", "notes", "internal_notes", "updated_by", "updated_at"],
        )

        rule_changes = {k: changes[k] for k in ("start_time", "end_time", "site") if k in changes}
        if rule_changes:
            _update_series_rules(event, scope, rule_changes, updated_by)

    log_audit(
        updated_by, "update_series", event,
        {"scope": scope},
        {"scope": scope, "fields": sorted(changes), "updated": len(events)},
    )
    return len(events)


def _update_series_rules(event: TimetableEvent, scope: str, rule_changes: dict, updated_by):
    cutoff = _cutoff_date(event)
    for rule in series_rules(event):
        if scope == SeriesScope.FOLLOWING and rule.valid_from < cutoff:
            if rule.valid_to and rule.valid_to < cutoff:
                continue  # ended before this class; nothing to carry on
            # Split: the old rule ends the day before, a changed copy carries on.
            new_rule = RecurringTimetableRule.objects.get(pk=rule.pk)
            new_rule.pk = None
            new_rule.valid_from = cutoff
            for field, value in rule_changes.items():
                setattr(new_rule, field, value)
            new_rule.created_by = updated_by
            new_rule.updated_by = updated_by
            new_rule.save()
            rule.valid_to = cutoff - timedelta(days=1)
            rule.updated_by = updated_by
            rule.save(update_fields=["valid_to", "updated_by", "updated_at"])
            # Later classes now belong to the new rule, so generating for it
            # finds them and does not create duplicates.
            TimetableEvent.objects.filter(
                tenant=event.tenant, recurring_rule=rule, start_datetime__gte=event.start_datetime,
            ).update(recurring_rule=new_rule)
        else:
            for field, value in rule_changes.items():
                setattr(rule, field, value)
            rule.updated_by = updated_by
            rule.save(update_fields=[*rule_changes, "updated_by", "updated_at"])


def delete_series(event: TimetableEvent, scope: str, deleted_by) -> int:
    """Soft-delete the classes in the series and stop its rules generating
    more. Returns how many classes were deleted."""
    from django.db import transaction

    cutoff = _cutoff_date(event)
    with transaction.atomic():
        deleted = series_events(event, scope).update(
            is_deleted=True, updated_by=deleted_by, updated_at=timezone.now()
        )
        for rule in series_rules(event):
            if scope == SeriesScope.ALL or rule.valid_from >= cutoff:
                rule.is_active = False
                fields = ["is_active"]
            else:
                new_end = cutoff - timedelta(days=1)
                if rule.valid_to and rule.valid_to <= new_end:
                    continue
                rule.valid_to = new_end
                fields = ["valid_to"]
            rule.updated_by = deleted_by
            rule.save(update_fields=[*fields, "updated_by", "updated_at"])

    log_audit(deleted_by, "delete_series", event, {"scope": scope}, {"scope": scope, "deleted": deleted})
    return deleted
