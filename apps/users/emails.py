"""Transactional emails for the users app (invite + password reset).

Sends through the recipient's tenant outgoing-email config (the Gmail App
Password set in Settings -> Notifications), the same way cover/invoice emails
do. Falls back to the global Django email settings when the tenant hasn't
configured its own sender.
"""

import logging

from django.conf import settings
from django.core.mail import EmailMessage, get_connection

from .invites import build_invite_url
from .models import User

logger = logging.getLogger(__name__)


def _connection_and_sender(tenant):
    """(connection, from_email) for a tenant's configured outgoing email.

    Uses the tenant's notification_from_email + app password when set; otherwise
    returns (None, DEFAULT_FROM_EMAIL) so Django's default backend is used.
    """
    from apps.tenants.models import TenantSettings

    ts = TenantSettings.objects.filter(tenant=tenant).first()
    from_email = (getattr(ts, "notification_from_email", "") or "").strip()
    password = getattr(ts, "notification_email_password", "") or ""
    from_name = (getattr(ts, "notification_from_name", "") or "").strip()

    if not from_email or not password:
        return None, settings.DEFAULT_FROM_EMAIL

    connection = get_connection(
        backend="django.core.mail.backends.smtp.EmailBackend",
        host=settings.EMAIL_HOST,
        port=settings.EMAIL_PORT,
        username=from_email,
        password=password,
        use_tls=settings.EMAIL_USE_TLS,
        fail_silently=False,
    )
    sender = f"{from_name} <{from_email}>" if from_name else from_email
    return connection, sender


def _send(user: User, subject: str, body: str, kind: str) -> bool:
    connection, from_email = _connection_and_sender(user.tenant)
    try:
        EmailMessage(
            subject=subject,
            body=body,
            from_email=from_email,
            to=[user.email],
            connection=connection,
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
