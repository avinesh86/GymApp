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

        period_start, period_end = _calculate_period(today, settings.invoice_frequency)
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


def _calculate_period(today: date, frequency: str) -> tuple:
    """Returns (period_start, period_end) for the current period based on frequency."""
    from apps.tenants.models import TenantSettings

    if frequency == TenantSettings.InvoiceFrequency.WEEKLY:
        # Monday to Sunday of current week
        start = today - timedelta(days=today.weekday())
        end = start + timedelta(days=6)
        return start, end

    if frequency == TenantSettings.InvoiceFrequency.FORTNIGHTLY:
        # Two-week block, arbitrary epoch: 2024-01-01
        epoch = date(2024, 1, 1)
        days_since = (today - epoch).days
        fortnight_num = days_since // 14
        start = epoch + timedelta(days=fortnight_num * 14)
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
        epoch = date(2024, 1, 1)
        days_since = (today - epoch).days
        block_num = days_since // 56
        start = epoch + timedelta(days=block_num * 56)
        end = start + timedelta(days=55)
        return start, end

    return None, None


@shared_task(name="invoices.send_invoice_reminders")
def send_invoice_reminders():
    """
    Runs weekly.  Reminds instructors to submit their draft invoices.
    """
    from .models import Invoice

    drafts = Invoice.objects.filter(
        status=Invoice.Status.DRAFT,
        is_deleted=False,
        tenant__is_active=True,
    ).select_related("instructor__user", "tenant")

    reminder_count = 0
    for invoice in drafts:
        logger.info(
            "Invoice reminder for %s — invoice %s",
            invoice.instructor.name,
            invoice.invoice_number,
        )
        reminder_count += 1

    logger.info("send_invoice_reminders: sent %d reminders", reminder_count)
    return reminder_count
