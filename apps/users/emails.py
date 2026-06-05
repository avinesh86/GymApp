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
    try:
        send_mail(
            subject=subject,
            message=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )
        return True
    except Exception:
        logger.exception("Failed to send invite email to %s", user.email)
        return False
