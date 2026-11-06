"""Checklist rules: when a check is due, creating the due checks, overdue
alerts held to business hours, and completing a check (a failed item raises
a fault)."""
from __future__ import annotations

import calendar
import logging
from datetime import date, datetime, timedelta

from django.db import transaction
from django.db.models import F, Q
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.core.timezones import format_datetime, local_today, tenant_timezone, to_tenant_local
from apps.notifications.models import Notification
from apps.tenants.models import TenantSettings

from .models import ChecklistAnswer, ChecklistRun, ChecklistTemplate, FaultReport
from .services import _email, alert_recipients, get_config, notify_fault_reported, sync_equipment_status

logger = logging.getLogger(__name__)

# Due checks are created for this many past days too, so a check the
# scheduler missed still shows up (as overdue) instead of vanishing.
CATCH_UP_DAYS = 7

MONTH_STEPS = {
    ChecklistTemplate.Frequency.MONTHLY: 1,
    ChecklistTemplate.Frequency.QUARTERLY: 3,
    ChecklistTemplate.Frequency.YEARLY: 12,
}


# ─── When is it due? ─────────────────────────────────────────────────────────


def is_due_on(template: ChecklistTemplate, day: date) -> bool:
    start = template.start_date
    if day < start:
        return False
    freq = template.frequency
    if freq == ChecklistTemplate.Frequency.DAILY:
        return True
    if freq == ChecklistTemplate.Frequency.WEEKLY:
        days = template.weekdays or [start.weekday()]
        return day.weekday() in days
    if freq == ChecklistTemplate.Frequency.EVERY_N_DAYS:
        return (day - start).days % max(template.interval_days, 1) == 0
    step = MONTH_STEPS.get(freq)
    if step:
        months = (day.year - start.year) * 12 + (day.month - start.month)
        if months % step:
            return False
        # The 31st falls on the last day of a shorter month.
        last = calendar.monthrange(day.year, day.month)[1]
        return day.day == min(start.day, last)
    return False


def due_at(template: ChecklistTemplate, day: date, tenant) -> datetime:
    """The gym-local due-by time on ``day``, as an aware datetime."""
    return datetime.combine(day, template.due_time, tzinfo=tenant_timezone(tenant))


# ─── Who does them ───────────────────────────────────────────────────────────


def checklist_roles(tenant) -> list[str]:
    s, _ = TenantSettings.objects.get_or_create(tenant=tenant)
    return list(s.checklist_roles or [])


def can_do(template: ChecklistTemplate, user, roles=None) -> bool:
    roles = checklist_roles(template.tenant) if roles is None else roles
    if user.role not in roles:
        return False
    return not template.assigned_roles or user.role in template.assigned_roles


# ─── Creating due checks ─────────────────────────────────────────────────────


def create_due_runs(tenant, today: date | None = None) -> int:
    """Create a run for each active checklist due today or in the last few
    days (but not before the checklist existed). Safe to call repeatedly,
    and from overlapping callers: the unique (checklist, day) constraint
    settles any race. A few queries in all, however many checklists."""
    today = today or local_today(tenant)
    window_start = today - timedelta(days=CATCH_UP_DAYS)
    templates = list(ChecklistTemplate.objects.filter(tenant=tenant, is_active=True, is_deleted=False))
    if not templates:
        return 0
    existing = set(
        ChecklistRun.objects.filter(template__in=templates, due_date__gte=window_start).values_list(
            "template_id", "due_date"
        )
    )
    to_create = []
    for template in templates:
        made_at = to_tenant_local(template.schedule_start, tenant)
        day = max(window_start, template.start_date, made_at.date())
        while day <= today:
            if (template.id, day) not in existing and is_due_on(template, day):
                to_create.append(
                    ChecklistRun(
                        tenant=tenant,
                        template=template,
                        site=template.site,
                        due_date=day,
                        due_at=due_at(template, day, tenant),
                    )
                )
            day += timedelta(days=1)
    ChecklistRun.objects.bulk_create(to_create, ignore_conflicts=True)
    # Runs attempted: with overlapping callers some may already have existed.
    return len(to_create)


# ─── Overdue alerts, business hours only ─────────────────────────────────────


def in_alert_hours(tenant, now=None) -> bool:
    s, _ = TenantSettings.objects.get_or_create(tenant=tenant)
    hour = to_tenant_local(now or timezone.now(), tenant).hour
    return s.facilities_alert_start_hour <= hour < s.facilities_alert_end_hour


def alert_overdue_runs(tenant, now=None) -> int:
    """One notification per key person listing the checks that have gone
    overdue since the last alert. Held until business hours; each check is
    alerted once."""
    now = now or timezone.now()
    if not in_alert_hours(tenant, now):
        return 0
    candidates = ChecklistRun.objects.filter(
        tenant=tenant,
        is_deleted=False,
        completed_at__isnull=True,
        overdue_alerted_at__isnull=True,
        due_at__lt=now,
        due_at__gte=now - timedelta(days=CATCH_UP_DAYS),
        template__is_active=True,
        template__is_deleted=False,
    ).exclude(
        # A checklist set up (or switched back on, or rescheduled) after a
        # due time still shows that check, but it was born late and nobody's
        # fault: don't alert it. Checks from before the change still alert.
        due_at__lte=Coalesce(F("template__schedule_from"), F("template__created_at")),
        created_at__gte=Coalesce(F("template__schedule_from"), F("template__created_at")),
    )
    # Claim each run before sending: a run is ours only if our conditional
    # update stamped it. A second job that starts while this one is still
    # emailing finds them taken, so no check is alerted twice. (If sending
    # then fails, those checks aren't re-alerted: one missed alert beats
    # repeats to every key person.)
    claimed = [
        pk
        for pk in candidates.values_list("pk", flat=True)
        if ChecklistRun.objects.filter(pk=pk, overdue_alerted_at__isnull=True).update(overdue_alerted_at=now)
    ]
    runs = list(ChecklistRun.objects.filter(pk__in=claimed).select_related("template", "site"))
    if not runs:
        return 0

    config = get_config(tenant)
    lines = [
        f"• {r.template.name}{f' ({r.site.name})' if r.site else ''} — due {format_datetime(r.due_at, tenant)}"
        for r in sorted(runs, key=lambda r: r.due_at)
    ]
    count = len(runs)
    title = f"{count} check{'s' if count != 1 else ''} overdue"
    body = "These checks haven't been done:\n" + "\n".join(lines)

    sent = 0
    for user in alert_recipients(tenant, config.alert_roles):
        notification = Notification.objects.create(
            tenant=tenant,
            recipient=user,
            notification_type=Notification.NotificationType.FACILITIES,
            title=title,
            body=body,
            related_object_type="checklist_run",
            related_object_id=",".join(str(r.pk) for r in runs)[:50],
        )
        sent += 1
        if config.alert_email and user.email:
            _email(notification)
    return sent


# ─── Completing a check ──────────────────────────────────────────────────────


class ChecklistError(ValueError):
    pass


@transaction.atomic
def complete_run(run: ChecklistRun, user, answers: list[dict], notes: str = "") -> ChecklistRun:
    """Record a done check. ``answers`` is ``[{"item": id, "passed": bool,
    "note": str}]`` and must cover every item. Each failed item raises a
    fault in maintenance tracking when that is on."""
    run = ChecklistRun.objects.select_for_update().get(pk=run.pk)
    if run.completed_at:
        raise ChecklistError("This check has already been done.")
    template = run.template
    items = {item.id: item for item in template.items.all()}
    given = {}
    for answer in answers:
        try:
            given[int(answer["item"])] = answer
        except (KeyError, TypeError, ValueError):
            raise ChecklistError("Each answer needs its item.")
    if set(given) != set(items):
        raise ChecklistError("Answer every item before finishing the check.")

    raise_faults = get_config(run.tenant).maintenance_enabled
    faults = []
    for item_id, item in items.items():
        answer = given[item_id]
        passed = bool(answer.get("passed"))
        note = (answer.get("note") or "").strip()[:500]
        equipment = item.equipment or template.equipment
        fault = None
        if not passed and raise_faults:
            fault = FaultReport.objects.create(
                tenant=run.tenant,
                site=run.site or (equipment.site if equipment else None),
                equipment=equipment,
                title=item.text[:200],
                description=f"Failed on the {template.name} check ({run.due_date:%d %b %Y})."
                + (f"\n\n{note}" if note else ""),
                location="" if equipment else template.name,
                reported_by=user,
                created_by=user,
                updated_by=user,
            )
            faults.append(fault)
        ChecklistAnswer.objects.create(
            run=run,
            item=item,
            item_text=item.text,
            equipment=equipment,
            passed=passed,
            note=note,
            fault=fault,
        )

    run.completed_at = timezone.now()
    run.completed_by = user
    run.notes = (notes or "").strip()
    run.updated_by = user
    run.save(update_fields=["completed_at", "completed_by", "notes", "updated_by", "updated_at"])

    for fault in faults:
        sync_equipment_status(fault.equipment)
        transaction.on_commit(lambda f=fault: notify_fault_reported(f))
    return run


def open_overdue_filter(now=None, prefix: str = "") -> Q:
    """Checks past their due time and not done. ``prefix`` reaches them
    through a relation, e.g. ``"runs__"`` from a checklist."""
    return Q(**{
        f"{prefix}is_deleted": False,
        f"{prefix}completed_at__isnull": True,
        f"{prefix}due_at__lt": now or timezone.now(),
    })


def run_status(run: ChecklistRun, now=None) -> str:
    now = now or timezone.now()
    if run.completed_at:
        return "late" if run.completed_at > run.due_at else "done"
    return "overdue" if run.due_at < now else "due"

