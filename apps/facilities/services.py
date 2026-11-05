"""Facilities rules: which parts are switched on, who is told about faults,
and keeping a machine's status in step with its faults."""
from __future__ import annotations

import logging
from dataclasses import dataclass

from django.utils import timezone

from apps.notifications.models import Notification
from apps.tenants.models import TenantSettings
from apps.users.constants import UserRole

from .models import Equipment, FaultReport

logger = logging.getLogger(__name__)

# Roles that can open the Facilities page. Instructors (incl. PTs) and class
# counters can only report a fault and see the fault status board.
FACILITIES_ROLES = (
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.GYM_MANAGER,
    UserRole.TEAM_LEADER,
    UserRole.PAYROLL,
)


@dataclass(frozen=True)
class FacilitiesConfig:
    equipment_enabled: bool
    maintenance_enabled: bool
    fault_reporting_enabled: bool
    alert_roles: tuple[str, ...]
    alert_email: bool


def get_config(tenant) -> FacilitiesConfig:
    s, _ = TenantSettings.objects.get_or_create(tenant=tenant)
    maintenance = s.facilities_maintenance_enabled
    return FacilitiesConfig(
        equipment_enabled=s.facilities_equipment_enabled,
        maintenance_enabled=maintenance,
        # Reported faults are worked through in maintenance tracking; with that
        # off there is nobody to receive them, so reporting is off too.
        fault_reporting_enabled=maintenance and s.fault_reporting_enabled,
        alert_roles=tuple(s.facilities_alert_roles or ()),
        # The gym-wide email switch still wins.
        alert_email=s.facilities_alert_email and s.email_enabled,
    )


def can_manage_facilities(user) -> bool:
    return getattr(user, "role", None) in FACILITIES_ROLES


# ─── Equipment status follows its faults ─────────────────────────────────────


def sync_equipment_status(equipment: Equipment | None) -> None:
    """Out of order while any open fault says it is out of use; back in service
    once the last such fault is fixed. A retired machine is left alone."""
    if equipment is None or equipment.status == Equipment.Status.RETIRED:
        return
    blocked = equipment.faults.filter(
        is_deleted=False,
        severity=FaultReport.Severity.OUT_OF_USE,
        status__in=FaultReport.OPEN_STATUSES,
    ).exists()
    wanted = Equipment.Status.OUT_OF_ORDER if blocked else Equipment.Status.IN_SERVICE
    if equipment.status != wanted:
        equipment.status = wanted
        equipment.save(update_fields=["status", "updated_at"])


def apply_status_change(fault: FaultReport, user) -> None:
    """Stamp who fixed it and when, or clear that if it is reopened."""
    if fault.status == FaultReport.Status.RESOLVED and fault.resolved_at is None:
        fault.resolved_at = timezone.now()
        fault.resolved_by = user
    elif fault.status != FaultReport.Status.RESOLVED:
        fault.resolved_at = None
        fault.resolved_by = None


# ─── Alerts ───────────────────────────────────────────────────────────────────


def alert_recipients(tenant, roles):
    from apps.users.models import User

    if not roles:
        return User.objects.none()
    return (
        User.objects.filter(
            memberships__tenant=tenant,
            memberships__role__in=roles,
            memberships__is_active=True,
            is_active=True,
        )
        .distinct()
    )


def notify_fault_reported(fault: FaultReport) -> int:
    """Tell the gym's chosen key people about a new fault.

    In the app always; by email only when the gym has turned that on. Never
    WhatsApp — the notification sender skips facilities alerts entirely.
    """
    tenant = fault.tenant
    config = get_config(tenant)
    reporter = fault.reported_by
    what = fault.equipment.name if fault.equipment_id else (fault.location or "General")
    severity = fault.get_severity_display()
    title = f"Fault reported: {fault.title}"
    body = f"{what} — {severity}."
    if reporter:
        body += f" Reported by {reporter.full_name or reporter.email}."
    if fault.description:
        body += f"\n\n{fault.description}"

    sent = 0
    for user in alert_recipients(tenant, config.alert_roles):
        if reporter and user.pk == reporter.pk:
            continue
        notification = Notification.objects.create(
            tenant=tenant,
            recipient=user,
            notification_type=Notification.NotificationType.FACILITIES,
            title=title,
            body=body,
            related_object_type="fault_report",
            related_object_id=str(fault.pk),
        )
        sent += 1
        if config.alert_email and user.email:
            _email(notification)
    return sent


def _email(notification) -> None:
    from django.core.mail import EmailMessage

    from apps.tenants.email import get_tenant_email_sender

    try:
        sender = get_tenant_email_sender(notification.tenant, default_display_name=notification.tenant.name)
        EmailMessage(
            subject=notification.title,
            body=notification.body,
            from_email=sender.from_email,
            to=[notification.recipient.email],
            reply_to=[sender.reply_to] if sender.reply_to else None,
            connection=sender.connection,
        ).send()
    except Exception:
        logger.exception("Facilities alert email failed for notification %s", notification.pk)
