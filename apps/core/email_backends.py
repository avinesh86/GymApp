"""Django email backend that posts to Resend's HTTP API.

DigitalOcean blocks outbound SMTP on the production droplet — ports 25, 587,
465 and 2525 all time out — so mail cannot leave over the usual transport.
Resend accepts messages over HTTPS on 443, which is not blocked.

Configured the same way as any other backend, so every existing
``EmailMessage(...).send()`` keeps working untouched::

    EMAIL_BACKEND=apps.core.email_backends.ResendEmailBackend
    RESEND_API_KEY=re_...
    DEFAULT_FROM_EMAIL=FitOps <noreply@fitops.northernarena.nz>

The from-address must belong to a domain verified in Resend; anything else is
rejected. Notably that rules out sending as @gmail.com, which is why the
per-tenant Gmail App Password is no longer the transport.
"""

import logging

import requests
from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend

logger = logging.getLogger(__name__)

RESEND_SEND_URL = "https://api.resend.com/emails"
DEFAULT_TIMEOUT_SECONDS = 15


class ResendEmailBackend(BaseEmailBackend):
    """Sends each message as one POST to Resend.

    Resend has no batch endpoint for distinct messages, and the volumes here
    are small — a cover request fans out to a handful of staff — so a request
    per message is fine and keeps per-message error reporting intact.
    """

    def __init__(self, fail_silently=False, api_key=None, timeout=None, **kwargs):
        super().__init__(fail_silently=fail_silently, **kwargs)
        self.api_key = api_key or getattr(settings, "RESEND_API_KEY", "")
        self.timeout = timeout or DEFAULT_TIMEOUT_SECONDS

    def send_messages(self, email_messages) -> int:
        """Returns how many messages Resend accepted."""
        if not email_messages:
            return 0

        if not self.api_key:
            message = "RESEND_API_KEY is not set — cannot send mail through Resend."
            if not self.fail_silently:
                raise ValueError(message)
            logger.error(message)
            return 0

        sent = 0
        session = requests.Session()
        session.headers.update(
            {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            }
        )
        try:
            for email_message in email_messages:
                if self._send(session, email_message):
                    sent += 1
        finally:
            session.close()
        return sent

    def _send(self, session, email_message) -> bool:
        recipients = email_message.recipients()
        if not recipients:
            return False

        try:
            response = session.post(
                RESEND_SEND_URL,
                json=_build_payload(email_message),
                timeout=self.timeout,
            )
            response.raise_for_status()
        except requests.RequestException:
            logger.exception(
                "Resend rejected the message to %s (subject %r)",
                ", ".join(recipients),
                email_message.subject,
            )
            if not self.fail_silently:
                raise
            return False

        return True


def _build_payload(email_message) -> dict:
    """Map a Django EmailMessage onto Resend's send payload."""
    payload = {
        "from": email_message.from_email,
        "to": list(email_message.to),
        "subject": email_message.subject,
    }

    body, html_body = _split_bodies(email_message)
    if body:
        payload["text"] = body
    if html_body:
        payload["html"] = html_body

    # Resend requires at least one body; a subject-only message is rejected.
    if "text" not in payload and "html" not in payload:
        payload["text"] = ""

    if email_message.cc:
        payload["cc"] = list(email_message.cc)
    if email_message.bcc:
        payload["bcc"] = list(email_message.bcc)
    if email_message.reply_to:
        payload["reply_to"] = list(email_message.reply_to)

    headers = {
        name: value
        for name, value in (email_message.extra_headers or {}).items()
        # Set from the fields above; passing them again is rejected as duplicate.
        if name.lower() not in {"from", "to", "cc", "bcc", "subject", "reply-to"}
    }
    if headers:
        payload["headers"] = headers

    return payload


def _split_bodies(email_message) -> tuple[str, str]:
    """(plain_text, html) for a message, whichever of the two it carries."""
    if email_message.content_subtype == "html":
        return "", email_message.body

    html_body = ""
    for content, mimetype in getattr(email_message, "alternatives", []) or []:
        if mimetype == "text/html":
            html_body = content
            break

    return email_message.body, html_body
