import logging
import os
import tempfile
from datetime import date
from decimal import Decimal

from django.core.files.base import ContentFile
from django.db import models
from django.template.loader import render_to_string
from django.utils import timezone

from apps.attendance.models import AttendanceRecord
from apps.core.audit import log_audit
from apps.staff.models import StaffPayRate, StaffPayRateOverride, StaffProfile
from apps.timetable.models import TimetableEvent

from . import notifications
from .models import Invoice, InvoiceApproval, InvoiceLineItem, PayrollBatch, PayRun
from .state import transition

logger = logging.getLogger(__name__)


def generate_invoice_for_instructor(
    instructor: StaffProfile,
    period_start: date,
    period_end: date,
) -> Invoice:
    """
    Generates a draft invoice for an instructor by pulling all completed
    timetable events in the period.  If a draft invoice already exists for
    this period it returns that instead of creating a duplicate.
    """
    existing = Invoice.objects.filter(
        tenant=instructor.tenant,
        instructor=instructor,
        period_start=period_start,
        period_end=period_end,
        status=Invoice.Status.DRAFT,
        is_deleted=False,
    ).first()

    if existing:
        return existing

    invoice = Invoice.objects.create(
        tenant=instructor.tenant,
        instructor=instructor,
        period_start=period_start,
        period_end=period_end,
        status=Invoice.Status.DRAFT,
    )

    events = TimetableEvent.objects.filter(
        tenant=instructor.tenant,
        instructor=instructor,
        status=TimetableEvent.Status.COMPLETED,
        start_datetime__date__gte=period_start,
        start_datetime__date__lte=period_end,
        is_deleted=False,
    ).select_related("class_type", "site")

    for event in events:
        attendance_count = _get_attendance_count(event)
        rate, rate_type, amount = _resolve_pay_rate(instructor, event, period_start, attendance_count)
        description = (
            f"{event.class_type.name} — {event.start_datetime:%d %b %Y %H:%M}"
        )
        InvoiceLineItem.objects.create(
            tenant=instructor.tenant,
            invoice=invoice,
            timetable_event=event,
            description=description,
            quantity=Decimal("1"),
            rate=rate,
            amount=amount,
        )

        # Apply bonus rules
        _apply_bonus_rules(invoice, event, attendance_count)

    invoice.recalculate_total()
    notifications.notify_draft_generated(invoice)
    return invoice


def flag_line_item_edited(line_item: InvoiceLineItem) -> None:
    """Mark a line item as instructor-edited so managers review it carefully."""
    line_item.is_flagged = True
    line_item.flag_reason = "Edited by instructor"
    line_item.save(update_fields=["is_flagged", "flag_reason", "amount", "updated_at"])


def _get_attendance_count(event: TimetableEvent) -> int:
    """Returns the attendance count for an event, or 0 if not recorded."""
    try:
        record = AttendanceRecord.objects.get(timetable_event=event)
        return record.count
    except AttendanceRecord.DoesNotExist:
        return 0


def _calculate_amount(rate_type: str, base_amount: Decimal, per_head_rate: Decimal, attendance_count: int) -> Decimal:
    """Calculates the total pay amount based on rate type."""
    if rate_type == "per_head":
        return per_head_rate * attendance_count
    if rate_type == "blended":
        return base_amount + (per_head_rate * attendance_count)
    # per_class, hourly, flat, override
    return base_amount


def _resolve_pay_rate(
    instructor: StaffProfile,
    event: TimetableEvent,
    as_of: date,
    attendance_count: int = 0,
) -> tuple[Decimal, str, Decimal]:
    """
    Resolves the pay rate for an event.  Priority:
    1. Class-type + site override
    2. Class-type-only override
    3. Default pay rate (most recent effective)

    Returns (base_rate, rate_type, calculated_amount).
    """
    override_qs = StaffPayRateOverride.objects.filter(
        staff=instructor,
        effective_from__lte=as_of,
        is_deleted=False,
    ).filter(
        models.Q(effective_to__isnull=True) | models.Q(effective_to__gte=as_of)
    )

    override = override_qs.filter(
        class_type=event.class_type, site=event.site
    ).order_by("-effective_from").first()

    if override is None:
        override = override_qs.filter(
            class_type=event.class_type, site__isnull=True
        ).order_by("-effective_from").first()

    if override:
        return override.amount, "override", override.amount

    default_rate = (
        StaffPayRate.objects.filter(
            staff=instructor,
            effective_from__lte=as_of,
            is_deleted=False,
        )
        .filter(
            models.Q(effective_to__isnull=True) | models.Q(effective_to__gte=as_of)
        )
        .order_by("-effective_from")
        .first()
    )

    if default_rate:
        amount = _calculate_amount(
            default_rate.rate_type,
            default_rate.amount,
            default_rate.per_head_rate,
            attendance_count,
        )
        return default_rate.amount, default_rate.rate_type, amount

    return Decimal("0"), "none", Decimal("0")


def _apply_bonus_rules(invoice: Invoice, event: TimetableEvent, attendance_count: int):
    """Creates bonus line items based on ClassBonus rules for the class type."""
    from apps.timetable.models import ClassBonus

    bonuses = ClassBonus.objects.filter(
        class_type=event.class_type,
        is_deleted=False,
    )

    for bonus in bonuses:
        label = bonus.name or bonus.get_bonus_type_display()
        description = f"{label} — {event.class_type.name} {event.start_datetime:%d %b}"

        if bonus.bonus_type == ClassBonus.BonusType.FLAT_BONUS:
            bonus_amount = bonus.bonus_amount

        elif bonus.bonus_type == ClassBonus.BonusType.ATTENDANCE_THRESHOLD:
            if attendance_count < bonus.threshold:
                continue
            bonus_amount = bonus.bonus_amount

        elif bonus.bonus_type == ClassBonus.BonusType.PER_HEAD_ABOVE:
            excess = max(0, attendance_count - bonus.threshold)
            if excess == 0:
                continue
            bonus_amount = bonus.bonus_amount * excess

        else:
            continue

        if bonus_amount > 0:
            InvoiceLineItem.objects.create(
                tenant=invoice.tenant,
                invoice=invoice,
                timetable_event=event,
                description=description,
                quantity=Decimal("1"),
                rate=bonus_amount,
                amount=bonus_amount,
                is_bonus=True,
            )


def apply_pay_rates(invoice: Invoice) -> Invoice:
    """Re-applies pay rates to all line items on a draft invoice."""
    if invoice.status != Invoice.Status.DRAFT:
        raise ValueError("Can only re-apply pay rates on draft invoices.")

    for line_item in invoice.line_items.filter(is_deleted=False, is_manual_adjustment=False, is_bonus=False):
        if line_item.timetable_event:
            attendance_count = _get_attendance_count(line_item.timetable_event)
            rate, _, amount = _resolve_pay_rate(
                invoice.instructor, line_item.timetable_event, invoice.period_start, attendance_count
            )
            line_item.rate = rate
            line_item.amount = amount * line_item.quantity
            line_item.save(update_fields=["rate", "amount", "updated_at"])

    invoice.recalculate_total()
    return invoice


def submit_invoice(invoice: Invoice, submitted_by) -> Invoice:
    """Submit a draft (or amended-rejected) invoice; notify managers."""
    if invoice.status not in (Invoice.Status.DRAFT, Invoice.Status.REJECTED):
        raise ValueError(f"Cannot submit invoice in status: {invoice.status}")

    transition(
        invoice,
        Invoice.Status.SUBMITTED,
        submitted_by,
        action="submit",
        extra_fields={"submitted_at": timezone.now()},
    )
    notifications.notify_submitted(invoice)
    return invoice


def approve_invoice(invoice: Invoice, approved_by, role: str) -> Invoice:
    """
    Advances the approval workflow one step:
    submitted -> manager_approved (records manager approver; notifies)
    manager_approved -> payroll_approved (records payroll approver; back-compat)
    """
    if invoice.status == Invoice.Status.SUBMITTED:
        transition(
            invoice, Invoice.Status.MANAGER_APPROVED, approved_by,
            action="approve", role=role,
            extra_fields={"manager_approver": approved_by, "manager_approved_at": timezone.now()},
        )
        notifications.notify_manager_approved(invoice)
    elif invoice.status == Invoice.Status.MANAGER_APPROVED:
        transition(
            invoice, Invoice.Status.PAYROLL_APPROVED, approved_by,
            action="approve", role=role,
            extra_fields={"payroll_approver": approved_by, "payroll_approved_at": timezone.now()},
        )
    else:
        raise ValueError(f"Cannot approve invoice in status: {invoice.status}")
    return invoice


def reject_invoice(invoice: Invoice, rejected_by, reason: str) -> Invoice:
    """Reject a submitted/manager-approved invoice; the instructor can amend + resubmit."""
    notes = (invoice.notes + f"\nRejected: {reason}").strip()
    transition(
        invoice, Invoice.Status.REJECTED, rejected_by,
        action="reject", notes=reason,
        extra_fields={
            "notes": notes,
            "rejection_reason": reason,
            "rejected_by": rejected_by,
            "rejected_at": timezone.now(),
        },
    )
    notifications.notify_rejected(invoice, reason)
    return invoice


def mark_invoice_paid(invoice: Invoice, paid_by, payment_date=None, payment_reference: str = "") -> Invoice:
    """Payroll marks a manager-approved invoice as paid (payment happens outside
    the system) — records the payroll approver, payment date + reference, and
    sends the instructor a receipt notification."""
    if invoice.status not in (Invoice.Status.MANAGER_APPROVED, Invoice.Status.PAYROLL_APPROVED):
        raise ValueError(f"Cannot mark paid from status: {invoice.status}")

    transition(
        invoice, Invoice.Status.PAID, paid_by,
        action="paid",
        extra_fields={
            "payroll_approver": invoice.payroll_approver or paid_by,
            "payroll_approved_at": invoice.payroll_approved_at or timezone.now(),
            "payment_date": payment_date or timezone.now().date(),
            "payment_reference": payment_reference or "",
        },
    )
    notifications.notify_paid(invoice)
    return invoice


def generate_invoice_pdf(invoice: Invoice) -> Invoice:
    """
    Generates a PDF for the invoice using WeasyPrint and stores it in
    invoice.pdf_file.  Returns the updated invoice.
    """
    from weasyprint import HTML

    context = {
        "invoice": invoice,
        "line_items": invoice.line_items.filter(is_deleted=False).order_by("created_at"),
        "branding": getattr(invoice.tenant, "branding", None),
    }

    html_string = render_to_string("invoices/invoice_pdf.html", context)

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        HTML(string=html_string).write_pdf(tmp_path)
        with open(tmp_path, "rb") as pdf_file:
            content = pdf_file.read()
    finally:
        os.unlink(tmp_path)

    filename = f"{invoice.invoice_number}.pdf"
    invoice.pdf_file.save(filename, ContentFile(content), save=True)
    return invoice


def generate_payroll_batch(
    tenant,
    period_start: date,
    period_end: date,
    created_by,
) -> PayrollBatch:
    """
    Creates a PayrollBatch and generates approved invoices into PayRun records.
    """
    batch = PayrollBatch.objects.create(
        tenant=tenant,
        period_start=period_start,
        period_end=period_end,
        status=PayrollBatch.Status.PROCESSING,
        created_by=created_by,
        updated_by=created_by,
    )

    approved_invoices = Invoice.objects.filter(
        tenant=tenant,
        status=Invoice.Status.PAYROLL_APPROVED,
        period_start=period_start,
        period_end=period_end,
        is_deleted=False,
    )

    for invoice in approved_invoices:
        PayRun.objects.create(
            tenant=tenant,
            payroll_batch=batch,
            invoice=invoice,
            amount_paid=invoice.total_amount,
            created_by=created_by,
            updated_by=created_by,
        )
        invoice.status = Invoice.Status.PAID
        invoice.save(update_fields=["status", "updated_at"])

    batch.status = PayrollBatch.Status.COMPLETE
    batch.completed_at = timezone.now()
    batch.save(update_fields=["status", "completed_at", "updated_at"])

    return batch
