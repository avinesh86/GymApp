"""
Invoice-workflow notifications — in-app records across the lifecycle.
Centralised so the services stay thin.
"""
from __future__ import annotations

import logging

from apps.notifications.models import Notification
from apps.staff.models import StaffProfile

logger = logging.getLogger(__name__)
NT = Notification.NotificationType


def _period(invoice) -> str:
    return f"{invoice.period_start:%d %b} – {invoice.period_end:%d %b %Y}"


def _staff_with_roles(tenant, roles):
    return StaffProfile.objects.filter(
        tenant=tenant, role__in=roles, status=StaffProfile.Status.ACTIVE, is_deleted=False
    ).select_related("user")


def _instructor_user(invoice):
    return getattr(invoice.instructor, "user", None)


def _notify(tenant, user, ntype, title, body, invoice):
    if not user:
        return
    Notification.objects.create(
        tenant=tenant,
        recipient=user,
        notification_type=ntype,
        title=title,
        body=body,
        related_object_type="invoice",
        related_object_id=str(invoice.pk),
    )


def notify_draft_generated(invoice) -> None:
    _notify(
        invoice.tenant, _instructor_user(invoice), NT.SYSTEM,
        "Draft invoice ready",
        f"Your draft invoice {invoice.invoice_number} for {_period(invoice)} is ready to review and submit.",
        invoice,
    )


def notify_submitted(invoice) -> None:
    """Managers/admins are told an invoice was submitted."""
    for staff in _staff_with_roles(invoice.tenant, ["admin", "gym_manager"]):
        _notify(
            invoice.tenant, staff.user, NT.INVOICE_SUBMITTED,
            "Invoice submitted for approval",
            f"{invoice.instructor.name} submitted {invoice.invoice_number} "
            f"({_period(invoice)}, ${invoice.total_amount}).",
            invoice,
        )


def notify_manager_approved(invoice) -> None:
    """Instructor + payroll are told a manager approved it."""
    _notify(
        invoice.tenant, _instructor_user(invoice), NT.INVOICE_APPROVED,
        "Invoice approved by manager",
        f"{invoice.invoice_number} was approved and is now with payroll.",
        invoice,
    )
    for staff in _staff_with_roles(invoice.tenant, ["payroll", "admin"]):
        _notify(
            invoice.tenant, staff.user, NT.INVOICE_APPROVED,
            "Invoice ready to pay",
            f"{invoice.instructor.name}'s {invoice.invoice_number} (${invoice.total_amount}) is ready for payment.",
            invoice,
        )


def notify_rejected(invoice, reason: str) -> None:
    _notify(
        invoice.tenant, _instructor_user(invoice), NT.INVOICE_REJECTED,
        "Invoice rejected",
        f"{invoice.invoice_number} was rejected: {reason}. Please amend and resubmit.",
        invoice,
    )


def notify_paid(invoice) -> None:
    """Receipt-style confirmation to the instructor."""
    ref = invoice.payment_reference or "—"
    when = f"{invoice.payment_date:%d %b %Y}" if invoice.payment_date else "soon"
    _notify(
        invoice.tenant, _instructor_user(invoice), NT.INVOICE_PAID,
        "Invoice paid — receipt",
        f"{invoice.invoice_number} (${invoice.total_amount}) has been paid on {when}. "
        f"Reference: {ref}.",
        invoice,
    )
