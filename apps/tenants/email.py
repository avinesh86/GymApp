"""Outgoing email addressed from each tenant's own mailbox.

Tenants set a from-address and a Gmail App Password under Settings ->
Notifications. Every transactional email (cover offers, staff invites,
notification digests) goes out through that, so mail reaches staff from their
gym rather than from FitOps. Tenants without a configured sender fall back to
the global ``EMAIL_*`` settings.
"""

import logging
from dataclasses import dataclass
from email.utils import formataddr, parseaddr

from django.conf import settings
from django.core.mail import get_connection

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class TenantEmailSender:
    """How to send mail on behalf of one tenant.

    ``connection`` is ``None`` when the tenant has no sender of its own, which
    tells Django to use the global email settings instead.
    """

    connection: object | None
    address: str
    display_name: str = ""
    reply_to: str = ""

    @property
    def from_email(self) -> str:
        """The value for a message's ``from_email`` — ``Name <addr>`` or ``addr``.

        ``formataddr`` quotes names containing commas or quotes, which a plain
        f-string would emit as a malformed header.
        """
        if self.display_name:
            return formataddr((self.display_name, self.address))
        return self.address


def get_tenant_email_sender(tenant, default_display_name: str = "") -> TenantEmailSender:
    """Resolve how to send mail for ``tenant``.

    ``default_display_name`` is used when the tenant hasn't named its sender.
    """
    from .models import TenantSettings

    tenant_settings = TenantSettings.objects.filter(tenant=tenant).first()
    address = (getattr(tenant_settings, "notification_from_email", "") or "").strip()
    display_name = (
        (getattr(tenant_settings, "notification_from_name", "") or "").strip()
        or default_display_name
    )

    if getattr(settings, "RESEND_API_KEY", ""):
        # Resend only accepts a from-address on a domain verified with it, so
        # the tenant's own mailbox cannot be the sender. It becomes the
        # reply-to instead: mail shows the gym's name, replies reach the gym.
        return _shared_sender(display_name, reply_to=address)

    app_password = _read_app_password(tenant_settings)

    if not address or not app_password:
        return _shared_sender(display_name)

    connection = get_connection(
        backend="django.core.mail.backends.smtp.EmailBackend",
        host=settings.EMAIL_HOST,
        port=settings.EMAIL_PORT,
        username=address,
        password=app_password,
        use_tls=settings.EMAIL_USE_TLS,
        fail_silently=False,
    )
    return TenantEmailSender(
        connection=connection,
        address=address,
        display_name=display_name,
        reply_to=getattr(settings, "EMAIL_REPLY_TO", "") or address,
    )


def _shared_sender(display_name: str, reply_to: str = "") -> TenantEmailSender:
    """Sender built from the global settings, for every tenant to share.

    ``connection=None`` leaves Django to use the configured EMAIL_BACKEND —
    Resend in production.
    """
    # DEFAULT_FROM_EMAIL is allowed to carry a display name of its own
    # ("FitOps <noreply@fitops.io>"). Split it, or wrapping a name around it
    # again produces "Gym <FitOps <noreply@fitops.io>>".
    default_name, default_address = parseaddr(settings.DEFAULT_FROM_EMAIL)
    return TenantEmailSender(
        connection=None,
        address=default_address or settings.DEFAULT_FROM_EMAIL,
        display_name=display_name or default_name,
        reply_to=reply_to or getattr(settings, "EMAIL_REPLY_TO", ""),
    )


def _read_app_password(tenant_settings) -> str:
    """The tenant's stored App Password, or ``""`` when it cannot be read.

    Decryption fails when ``FIELD_ENCRYPTION_KEY`` no longer matches the key the
    password was encrypted with — after restoring a database into another
    environment, typically. That must not blow up every send path, so it is
    logged and treated as "no tenant sender configured".
    """
    if tenant_settings is None:
        return ""

    try:
        return tenant_settings.notification_email_password
    except Exception:
        logger.exception(
            "Cannot decrypt the outgoing email password for tenant %s — "
            "FIELD_ENCRYPTION_KEY probably differs from the key it was saved with",
            tenant_settings.tenant_id,
        )
        return ""
