"""Transactional emails for the users app (invite + password reset).

Sends through the recipient's tenant outgoing-email config (the Gmail App
Password set in Settings -> Notifications), the same way cover and notification
emails do.
"""

import logging

from django.core.mail import EmailMessage

from apps.tenants.email import get_tenant_email_sender

from .invites import build_invite_url
from .models import User

logger = logging.getLogger(__name__)


def _send(user: User, subject: str, body: str, kind: str) -> bool:
    sender = get_tenant_email_sender(user.tenant)
    try:
        EmailMessage(
            subject=subject,
            body=body,
            from_email=sender.from_email,
            to=[user.email],
            connection=sender.connection,
        ).send()
        return True
    except Exception:
        logger.exception("Failed to send %s email to %s", kind, user.email)
        return False


def send_invite_email(user: User) -> bool:
    """Email a staff member their set-password link. Failures are logged, never raised."""
    gym_name = user.tenant.name
    body = (
        f"Hi {user.first_name or 'there'},\n\n"
        f"{gym_name} has set up a FitOps account for you. "
        "Set your password to log in:\n\n"
        f"{build_invite_url(user)}\n\n"
        "This link expires once you set your password.\n"
    )
    return _send(user, f"You've been added to {gym_name} on FitOps", body, "invite")


def send_password_reset_email(user: User) -> bool:
    """Email a user a password-reset link (single-use token). Logged, never raised."""
    body = (
        f"Hi {user.first_name or 'there'},\n\n"
        "We received a request to reset your FitOps password. "
        "Set a new password here:\n\n"
        f"{build_invite_url(user)}\n\n"
        "This link expires after use, or in a few days. "
        "If you didn't request this, you can ignore this email.\n"
    )
    return _send(user, "Reset your FitOps password", body, "password reset")
