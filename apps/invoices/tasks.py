import logging
from datetime import date, timedelta

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name="invoices.auto_generate_invoices")
def auto_generate_invoices():
    """
    Runs on each tenant's invoice frequency schedule.
    Generates draft invoices for all active instructors.
    """
    from apps.staff.models import StaffProfile
    from apps.tenants.models import Tenant, TenantSettings
    from .services import generate_invoice_for_instructor

    today = date.today()

    for tenant in Tenant.objects.filter(is_active=True):
        try:
            settings = TenantSettings.objects.get(tenant=tenant)
        except TenantSettings.DoesNotExist:
            continue

        anchor = getattr(settings, "pay_period_anchor_date", None) or date(2024, 1, 1)
        period_start, period_end = _calculate_period(today, settings.invoice_frequency, anchor)
        if period_start is None:
            continue

        instructors = StaffProfile.objects.filter(
            tenant=tenant,
            status=StaffProfile.Status.ACTIVE,
            is_deleted=False,
        )

        for instructor in instructors:
            try:
                invoice = generate_invoice_for_instructor(instructor, period_start, period_end)
                logger.info("Generated invoice %s for instructor %s", invoice.invoice_number, instructor.pk)
            except Exception:
                logger.exception("Failed to generate invoice for instructor %s", instructor.pk)


def _calculate_period(today: date, frequency: str, anchor: date = None) -> tuple:
    """Returns (period_start, period_end) for the current period based on frequency.

    Fortnightly / 8-weekly blocks are counted from the tenant's configurable
    `anchor` (pay_period_anchor_date), defaulting to 2024-01-01.
    """
    from apps.tenants.models import TenantSettings

    anchor = anchor or date(2024, 1, 1)

    if frequency == TenantSettings.InvoiceFrequency.WEEKLY:
        # Monday to Sunday of current week
        start = today - timedelta(days=today.weekday())
        end = start + timedelta(days=6)
        return start, end

    if frequency == TenantSettings.InvoiceFrequency.FORTNIGHTLY:
        days_since = (today - anchor).days
        block = days_since // 14
        start = anchor + timedelta(days=block * 14)
        end = start + timedelta(days=13)
        return start, end

    if frequency == TenantSettings.InvoiceFrequency.MONTHLY:
        start = today.replace(day=1)
        if today.month == 12:
            end = date(today.year + 1, 1, 1) - timedelta(days=1)
        else:
            end = date(today.year, today.month + 1, 1) - timedelta(days=1)
        return start, end

    if frequency == TenantSettings.InvoiceFrequency.EIGHT_WEEKLY:
        days_since = (today - anchor).days
        block = days_since // 56
        start = anchor + timedelta(days=block * 56)
        end = start + timedelta(days=55)
        return start, end

    return None, None


@shared_task(name="invoices.send_invoice_reminders")
def send_invoice_reminders():
    """
    Runs weekly.  Reminds instructors to submit their draft invoices.
    """
    from apps.notifications.models import Notification

    from .models import Invoice

    drafts = Invoice.objects.filter(
        status=Invoice.Status.DRAFT,
        is_deleted=False,
        tenant__is_active=True,
    ).select_related("instructor__user", "tenant")

    reminder_count = 0
    for invoice in drafts:
        user = getattr(invoice.instructor, "user", None)
        if not user:
            continue
        Notification.objects.create(
            tenant=invoice.tenant,
            recipient=user,
            notification_type=Notification.NotificationType.SYSTEM,
            title="Reminder: submit your invoice",
            body=(
                f"Your draft invoice {invoice.invoice_number} "
                f"({invoice.period_start:%d %b} – {invoice.period_end:%d %b %Y}) "
                f"is still unsubmitted."
            ),
            related_object_type="invoice",
            related_object_id=str(invoice.pk),
        )
        reminder_count += 1

    logger.info("send_invoice_reminders: sent %d reminders", reminder_count)
    return reminder_count
