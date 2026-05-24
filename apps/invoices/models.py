import random
import string
from datetime import date

from django.db import models
from django.utils import timezone

from apps.core.models import TenantAwareModel


def _generate_invoice_number() -> str:
    today = date.today().strftime("%Y%m%d")
    suffix = "".join(random.choices(string.ascii_uppercase, k=4))
    return f"INV-{today}-{suffix}"


class Invoice(TenantAwareModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SUBMITTED = "submitted", "Submitted"
        MANAGER_APPROVED = "manager_approved", "Manager Approved"
        PAYROLL_APPROVED = "payroll_approved", "Payroll Approved"
        PAID = "paid", "Paid"
        REJECTED = "rejected", "Rejected"
        CANCELLED = "cancelled", "Cancelled"

    instructor = models.ForeignKey(
        "staff.StaffProfile",
        on_delete=models.CASCADE,
        related_name="invoices",
    )
    period_start = models.DateField(db_index=True)
    period_end = models.DateField(db_index=True)
    status = models.CharField(
        max_length=30,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    invoice_number = models.CharField(max_length=30, unique=True, default=_generate_invoice_number)
    pdf_file = models.FileField(upload_to="invoices/pdfs/", null=True, blank=True)

    class Meta:
        db_table = "invoice"
        indexes = [
            models.Index(fields=["tenant", "instructor", "period_start"]),
            models.Index(fields=["tenant", "status"]),
        ]

    def __str__(self):
        return f"{self.invoice_number} — {self.instructor.name}"

    def recalculate_total(self):
        from django.db.models import Sum
        total = self.line_items.filter(is_deleted=False).aggregate(total=Sum("amount"))["total"] or 0
        self.total_amount = total
        self.save(update_fields=["total_amount", "updated_at"])


class InvoiceLineItem(TenantAwareModel):
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="line_items")
    timetable_event = models.ForeignKey(
        "timetable.TimetableEvent",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    description = models.CharField(max_length=300)
    quantity = models.DecimalField(max_digits=8, decimal_places=2, default=1)
    rate = models.DecimalField(max_digits=10, decimal_places=2)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    is_bonus = models.BooleanField(default=False)
    is_manual_adjustment = models.BooleanField(default=False)
    is_flagged = models.BooleanField(default=False, db_index=True)
    flag_reason = models.CharField(max_length=300, blank=True)

    class Meta:
        db_table = "invoice_line_item"

    def __str__(self):
        return f"{self.description} — ${self.amount}"

    def save(self, *args, **kwargs):
        self.amount = self.quantity * self.rate
        super().save(*args, **kwargs)


class InvoiceApproval(models.Model):
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="approvals")
    approved_by = models.ForeignKey("users.User", on_delete=models.SET_NULL, null=True)
    role = models.CharField(max_length=30)
    action = models.CharField(max_length=20)  # approve / reject
    notes = models.TextField(blank=True)
    approved_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "invoice_approval"

    def __str__(self):
        return f"{self.action} by {self.approved_by} on {self.invoice.invoice_number}"


class PayrollBatch(TenantAwareModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PROCESSING = "processing", "Processing"
        COMPLETE = "complete", "Complete"
        FAILED = "failed", "Failed"

    period_start = models.DateField()
    period_end = models.DateField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "invoice_payroll_batch"

    def __str__(self):
        return f"PayrollBatch {self.period_start} — {self.period_end} [{self.status}]"


class PayRun(TenantAwareModel):
    payroll_batch = models.ForeignKey(PayrollBatch, on_delete=models.CASCADE, related_name="pay_runs")
    invoice = models.OneToOneField(Invoice, on_delete=models.CASCADE, related_name="pay_run")
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2)
    payment_date = models.DateField(null=True, blank=True)
    payment_reference = models.CharField(max_length=200, blank=True)

    class Meta:
        db_table = "invoice_pay_run"

    def __str__(self):
        return f"PayRun {self.invoice.invoice_number} ${self.amount_paid}"
