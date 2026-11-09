"""Licence expiry and subscription renewal: status, and reminders on the days
each record asks for, held to the gym's alert hours."""
from __future__ import annotations

import calendar
from datetime import date, timedelta
from decimal import Decimal

from apps.core.timezones import format_date, local_today
from apps.notifications.models import Notification

from .checklists import in_alert_hours
from .models import Licence, Subscription
from .services import _email, alert_recipients, get_config

# A record counts as "due soon" inside this many days if it asks for no
# reminders of its own.
DEFAULT_SOON_DAYS = 30


def clean_reminder_days(value) -> list[int]:
    """Whole days, 0–365, largest first, no repeats."""
    if not isinstance(value, list):
        raise ValueError("Reminder days must be a list of numbers.")
    days = set()
    for v in value:
        if isinstance(v, bool) or not isinstance(v, int) or not 0 <= v <= 365:
            raise ValueError("Each reminder is a whole number of days from 0 to 365.")
        days.add(v)
    return sorted(days, reverse=True)


def add_months(day: date, months: int) -> date:
    month = day.month - 1 + months
    year = day.year + month // 12
    month = month % 12 + 1
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


# ─── What each record is counting down to ────────────────────────────────────


def licence_deadline(licence: Licence) -> date | None:
    return licence.expires_on


def subscription_deadline(sub: Subscription) -> date | None:
    """The last day to act: the renewal date less any notice period."""
    if not sub.next_renewal:
        return None
    return sub.next_renewal - timedelta(days=sub.notice_days)


def _soon_window(record) -> int:
    return max(record.reminder_days or [DEFAULT_SOON_DAYS])


def licence_status(licence: Licence, today: date) -> str:
    if not licence.expires_on:
        return "no_expiry"
    left = (licence.expires_on - today).days
    if left < 0:
        return "expired"
    return "expiring" if left <= _soon_window(licence) else "valid"


def subscription_status(sub: Subscription, today: date) -> str:
    if not sub.is_active:
        return "cancelled"
    if not sub.next_renewal:
        return "active"
    if sub.next_renewal < today:
        return "lapsed"
    deadline = subscription_deadline(sub)
    return "renewing" if (deadline - today).days <= _soon_window(sub) else "active"


def monthly_cost(sub: Subscription) -> Decimal:
    if not sub.cost or not sub.is_active:
        return Decimal("0")
    return (sub.cost / Subscription.CYCLE_MONTHS[sub.billing_cycle]).quantize(Decimal("0.01"))


# ─── Keeping auto-renewing subscriptions current ─────────────────────────────


def roll_forward_renewals(tenant, today: date) -> int:
    """An auto-renewing subscription whose renewal date has passed has
    renewed: move it to the next date and start its reminders afresh."""
    rolled = 0
    subs = Subscription.objects.filter(
        tenant=tenant, is_deleted=False, is_active=True, auto_renew=True, next_renewal__lt=today
    )
    for sub in subs:
        step = Subscription.CYCLE_MONTHS[sub.billing_cycle]
        renewal = sub.next_renewal
        while renewal < today:
            renewal = add_months(renewal, step)
        sub.next_renewal = renewal
        sub.reminders_sent = []
        sub.save(update_fields=["next_renewal", "reminders_sent", "updated_at"])
        rolled += 1
    return rolled


# ─── Reminders ───────────────────────────────────────────────────────────────


def _due_reminder(record, deadline: date | None, today: date) -> int | None:
    """The reminder to send now, if any: the nearest threshold crossed and
    not yet sent. Crossing several at once (say a licence added two weeks
    before expiry) sends one reminder, not three."""
    if deadline is None:
        return None
    left = (deadline - today).days
    if left < 0:
        return None
    crossed = [d for d in (record.reminder_days or []) if left <= d and d not in (record.reminders_sent or [])]
    return min(crossed) if crossed else None


def _mark_sent(record, deadline: date, today: date):
    left = (deadline - today).days
    sent = set(record.reminders_sent or [])
    sent.update(d for d in record.reminder_days or [] if left <= d)
    record.reminders_sent = sorted(sent, reverse=True)
    record.save(update_fields=["reminders_sent", "updated_at"])


def _notify(tenant, record, title: str, body: str, kind: str) -> int:
    config = get_config(tenant)
    people = {u.pk: u for u in alert_recipients(tenant, config.alert_roles)}
    if record.responsible_id and record.responsible.is_active:
        people[record.responsible_id] = record.responsible
    for user in people.values():
        notification = Notification.objects.create(
            tenant=tenant,
            recipient=user,
            notification_type=Notification.NotificationType.FACILITIES,
            title=title,
            body=body,
            related_object_type=kind,
            related_object_id=str(record.pk),
        )
        if config.alert_email and user.email:
            _email(notification)
    return len(people)


def _when(days: int) -> str:
    if days == 0:
        return "today"
    return "tomorrow" if days == 1 else f"in {days} days"


def send_renewal_reminders(tenant, now=None) -> int:
    """Reminders for licences and subscriptions that have reached one of
    their reminder days. Only within the gym's alert hours; never WhatsApp."""
    if not in_alert_hours(tenant, now):
        return 0
    config = get_config(tenant)
    today = local_today(tenant)
    sent = 0

    if config.licences_enabled:
        for licence in Licence.objects.filter(tenant=tenant, is_deleted=False, expires_on__isnull=False).select_related("responsible", "site"):
            deadline = licence_deadline(licence)
            if _due_reminder(licence, deadline, today) is None:
                continue
            left = (deadline - today).days
            where = f" ({licence.site.name})" if licence.site else ""
            sent += _notify(
                tenant,
                licence,
                f"{licence.name} expires {_when(left)}",
                f"{licence.name}{where} expires on {format_date(deadline, tenant)}."
                + (f" Issued by {licence.issuer}." if licence.issuer else "")
                + " Renew it and update the expiry date in Facilities → Licences.",
                "licence",
            )
            _mark_sent(licence, deadline, today)

    if config.subscriptions_enabled:
        roll_forward_renewals(tenant, today)
        subs = Subscription.objects.filter(
            tenant=tenant, is_deleted=False, is_active=True, next_renewal__isnull=False
        ).select_related("responsible", "site")
        for sub in subs:
            deadline = subscription_deadline(sub)
            if _due_reminder(sub, deadline, today) is None:
                continue
            left = (deadline - today).days
            renews = "renews" if sub.auto_renew else "ends"
            body = f"{sub.name}{f' ({sub.provider})' if sub.provider else ''} {renews} on {format_date(sub.next_renewal, tenant)}"
            if sub.cost:
                body += f" — ${sub.cost} {sub.get_billing_cycle_display().lower()}"
            body += "."
            if sub.notice_days:
                body += f" Notice to cancel is due by {format_date(deadline, tenant)}."
            title = (
                f"{sub.name}: notice to cancel due {_when(left)}"
                if sub.notice_days
                else f"{sub.name} {renews} {_when(left)}"
            )
            sent += _notify(tenant, sub, title, body, "subscription")
            _mark_sent(sub, deadline, today)
    return sent
