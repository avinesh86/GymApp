"""Emailing a scheduled report: the PDF attached to a short note."""

import logging

from django.core.mail import EmailMultiAlternatives
from django.utils.html import escape

from apps.tenants.email import get_tenant_email_sender

from .export import build_report, render_report_pdf, report_filename

logger = logging.getLogger(__name__)


def send_report(schedule, day) -> None:
    """Build ``schedule``'s report for the period containing ``day`` and email
    it to the schedule's recipients. Raises if sending fails."""
    tenant = schedule.tenant
    report = build_report(
        tenant, schedule.created_by, schedule.frequency, day, schedule.sections
    )
    pdf = render_report_pdf(report)

    subject = f"{tenant.name}: {schedule.name} — {report['period']}"
    plain = (
        f"Hi,\n\nAttached is the {report['title'].lower()} for {report['period']} "
        f"from FitOps ({schedule.name}).\n\n"
        "You're receiving this because you were added to this scheduled report. "
        "A manager can change or stop it on the Reports page in FitOps.\n"
    )
    html = (
        f"<p>Hi,</p><p>Attached is the <strong>{escape(report['title'].lower())}</strong> "
        f"for <strong>{escape(report['period'])}</strong> from FitOps "
        f"({escape(schedule.name)}).</p>"
        '<p style="color:#6B7280;font-size:12px">You\'re receiving this because you were '
        "added to this scheduled report. A manager can change or stop it on the "
        "Reports page in FitOps.</p>"
    )

    sender = get_tenant_email_sender(tenant, default_display_name=tenant.name)
    message = EmailMultiAlternatives(
        subject=subject,
        body=plain,
        from_email=sender.from_email,
        to=list(schedule.recipients),
        reply_to=[sender.reply_to] if sender.reply_to else None,
        connection=sender.connection,
    )
    message.attach_alternative(html, "text/html")
    message.attach(report_filename(report), pdf, "application/pdf")
    message.send()
