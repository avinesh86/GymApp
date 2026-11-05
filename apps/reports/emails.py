"""Emailing a scheduled report: the report in the body, and as an attached PDF."""

import logging

from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

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
    # The report goes in the body as well as attached, so it can be read
    # straight from the inbox (and still arrives if an attachment is stripped).
    plain = _plain_body(report, schedule.name)
    html = render_to_string(
        "reports/report_email.html", {**report, "schedule_name": schedule.name}
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


def _plain_body(report: dict, schedule_name: str) -> str:
    """The text-only version: each section's figures and tables, line by line."""
    lines = [
        "Hi,",
        "",
        f"Here is the {report['title'].lower()} for {report['period']} "
        f"({schedule_name}). The full report, with charts, is attached as a PDF.",
    ]
    for section in report["sections"]:
        lines += ["", section["title"].upper()]
        if section["error"]:
            lines.append(section["error"])
            continue
        lines += [f"  {label}: {value}" for label, value in section["stats"]]
        if section["note"]:
            lines.append(f"  {section['note']}")
        for table in section["tables"]:
            lines += ["", f"  {table['title']}", "  " + " | ".join(map(str, table["columns"]))]
            lines += ["  " + " | ".join(map(str, row)) for row in table["rows"]]
    lines += [
        "",
        f"Generated {report['generated_on']}.",
        "You're receiving this because you were added to this scheduled report. "
        "A manager can change or stop it on the Reports page in FitOps.",
        "",
    ]
    return "\n".join(lines)
