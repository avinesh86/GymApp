"""
Invoice state machine.

Centralises the allowed status moves + audit so services don't write
`invoice.status = ...` ad hoc. `transition()` persists the status (plus any
extra fields) and records an InvoiceApproval row when an actor/action is given.
"""
from __future__ import annotations

from django.utils import timezone

from apps.core.audit import log_audit

from .models import Invoice, InvoiceApproval

S = Invoice.Status

# status -> allowed next statuses.
ALLOWED: dict[str, set[str]] = {
    S.DRAFT: {S.SUBMITTED, S.CANCELLED},
    S.REJECTED: {S.SUBMITTED, S.CANCELLED},
    S.SUBMITTED: {S.MANAGER_APPROVED, S.REJECTED, S.CANCELLED},
    S.MANAGER_APPROVED: {S.PAYROLL_APPROVED, S.PAID, S.REJECTED, S.CANCELLED},
    S.PAYROLL_APPROVED: {S.PAID, S.REJECTED, S.CANCELLED},
    S.PAID: set(),
    S.CANCELLED: set(),
}

# Statuses an instructor may still edit (line items + notes).
EDITABLE_STATUSES = {S.DRAFT, S.REJECTED}


class InvalidInvoiceTransition(ValueError):
    """Raised when a status change is not permitted from the current state."""


def can_transition(current: str, target: str) -> bool:
    return target in ALLOWED.get(current, set())


def transition(invoice: Invoice, target: str, actor=None, *, action: str = "", role: str = "",
               notes: str = "", extra_fields=None) -> Invoice:
    """Move an invoice to `target`, persisting status + any extra fields, and
    logging an InvoiceApproval row when `action` is given."""
    current = invoice.status
    if target != current and not can_transition(current, target):
        raise InvalidInvoiceTransition(f"Invoice {invoice.pk}: {current} -> {target} not allowed.")

    update_fields = {"status", "updated_at"}
    invoice.status = target
    if extra_fields:
        for field, value in extra_fields.items():
            setattr(invoice, field, value)
            update_fields.add(field)
    if actor is not None:
        invoice.updated_by = actor
        update_fields.add("updated_by")

    invoice.save(update_fields=list(update_fields))

    if action:
        InvoiceApproval.objects.create(
            invoice=invoice,
            approved_by=actor,
            role=role or (getattr(actor, "role", "") or ""),
            action=action,
            notes=notes,
            approved_at=timezone.now(),
        )

    log_audit(actor, f"invoice.{target}", invoice, {}, {"status": target})
    return invoice
