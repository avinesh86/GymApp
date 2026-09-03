"""Transactional emails for the users app (invite + password reset).

Sends through the recipient's tenant outgoing-email config, the same way cover
and notification emails do. Both messages carry a single action link, so they
share one HTML shell — users/account_action_email.html — with a plain-text
alternative for clients that will not render it.
"""

import logging

from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

from apps.tenants.email import get_tenant_email_sender

from .invites import build_invite_url
from .models import User

logger = logging.getLogger(__name__)


def _send(
    user: User,
    subject: str,
    *,
    kind: str,
    heading: str,
    intro: str,
    action_label: str,
    action_url: str,
    footer_note: str,
    plain_body: str,
) -> bool:
    """Send one account email. Failures are logged, never raised."""
    sender = get_tenant_email_sender(user.tenant, default_display_name=user.tenant.name)

    html_body = render_to_string(
        "users/account_action_email.html",
        {
            "heading": heading,
            "greeting_name": user.first_name or "there",
            "intro": intro,
            "action_label": action_label,
            "action_url": action_url,
            "footer_note": footer_note,
        },
    )

    message = EmailMultiAlternatives(
        subject=subject,
        body=plain_body,
        from_email=sender.from_email,
        to=[user.email],
        reply_to=[sender.reply_to] if sender.reply_to else None,
        connection=sender.connection,
    )
    message.attach_alternative(html_body, "text/html")

    try:
        message.send()
        return True
    except Exception:
        logger.exception("Failed to send %s email to %s", kind, user.email)
        return False


def send_invite_email(user: User) -> bool:
    """Email a staff member their set-password link."""
    gym_name = user.tenant.name
    url = build_invite_url(user)
    return _send(
        user,
        f"You've been added to {gym_name} on FitOps",
        kind="invite",
        heading="Welcome to FitOps",
        intro=(
            f"{gym_name} has set up a FitOps account for you. "
            "Set your password to log in."
        ),
        action_label="Set your password",
        action_url=url,
        footer_note="This link expires once you set your password.",
        plain_body=(
            f"Hi {user.first_name or 'there'},\n\n"
            f"{gym_name} has set up a FitOps account for you. "
            "Set your password to log in:\n\n"
            f"{url}\n\n"
            "This link expires once you set your password.\n"
        ),
    )


def send_password_reset_email(user: User) -> bool:
    """Email a user a password-reset link (single-use token)."""
    url = build_invite_url(user)
    return _send(
        user,
        "Reset your FitOps password",
        kind="password reset",
        heading="Reset your password",
        intro=(
            "We received a request to reset your FitOps password. "
            "Choose a new one using the button below."
        ),
        action_label="Reset password",
        action_url=url,
        footer_note=(
            "This link expires after use, or in a few days. "
            "If you didn't request this, you can ignore this email."
        ),
        plain_body=(
            f"Hi {user.first_name or 'there'},\n\n"
            "We received a request to reset your FitOps password. "
            "Set a new password here:\n\n"
            f"{url}\n\n"
            "This link expires after use, or in a few days. "
            "If you didn't request this, you can ignore this email.\n"
        ),
    )
