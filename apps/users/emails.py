"""Transactional emails for the users app."""

import logging

from django.conf import settings
from django.core.mail import send_mail

from .invites import build_invite_url
from .models import User

logger = logging.getLogger(__name__)


def send_invite_email(user: User) -> bool:
    """Email a staff member their set-password link.

    Returns True if the email was handed to the backend, False on failure.
    Failures are logged, never raised, so they don't abort staff provisioning.
    In development the console email backend just prints the message.
    """
    invite_url = build_invite_url(user)
    gym_name = user.tenant.name
    subject = f"You've been added to {gym_name} on FitOps"
    body = (
        f"Hi {user.first_name or 'there'},\n\n"
        f"{gym_name} has set up a FitOps account for you. "
        "Set your password to log in:\n\n"
        f"{invite_url}\n\n"
        "This link expires once you set your password.\n"
    )
    return _send(user.email, subject, body, "invite")


def send_password_reset_email(user: User) -> bool:
    """Email a user a password-reset link (same single-use token mechanism).

    Used by self-service "forgot password" and admin-triggered resets. Returns
    True if handed to the backend, False on failure (logged, never raised).
    """
    reset_url = build_invite_url(user)
    subject = "Reset your FitOps password"
    body = (
        f"Hi {user.first_name or 'there'},\n\n"
        "We received a request to reset your FitOps password. "
        "Set a new password here:\n\n"
        f"{reset_url}\n\n"
        "This link expires after use, or in a few days. "
        "If you didn't request this, you can ignore this email.\n"
    )
    return _send(user.email, subject, body, "password reset")


def _send(to_email: str, subject: str, body: str, kind: str) -> bool:
    try:
        send_mail(
            subject=subject,
            message=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[to_email],
            fail_silently=False,
        )
        return True
    except Exception:
        logger.exception("Failed to send %s email to %s", kind, to_email)
        return False
