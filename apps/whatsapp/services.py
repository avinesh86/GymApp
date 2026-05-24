import hashlib
import hmac
import logging

import requests
from django.conf import settings
from django.utils import timezone

from .models import WhatsAppAccount, WhatsAppMessage, WhatsAppWebhookEvent

logger = logging.getLogger(__name__)

META_API_BASE = "https://graph.facebook.com/v25.0"


def send_cover_request_message(cover_offer) -> WhatsAppMessage | None:
    """
    Sends a WhatsApp cover-request notification to the staff member named
    in the offer using the approved cover_request_notification template.
    Returns the WhatsAppMessage record, or None on failure.
    """
    staff = cover_offer.staff
    tenant = cover_offer.cover_request.tenant

    consent = getattr(staff, "whatsapp_consent", None)
    if not consent or not consent.consent_given or consent.revoked_at:
        logger.info("No WhatsApp consent for staff %s", staff.pk)
        return None

    account = WhatsAppAccount.objects.filter(tenant=tenant, is_active=True).first()
    if not account:
        logger.warning("No active WhatsApp account for tenant %s", tenant.pk)
        return None

    event = cover_offer.cover_request.timetable_event

    # Use approved template — free-form text is blocked for outbound messages
    template_payload = {
        "messaging_product": "whatsapp",
        "to": consent.phone_number,
        "type": "template",
        "template": {
            "name": "cover_request_notification",
            "language": {"code": "en"},
            "components": [
                {
                    "type": "body",
                    "parameters": [
                        {"type": "text", "text": staff.name},
                        {"type": "text", "text": event.class_type.name},
                        {"type": "text", "text": event.start_datetime.strftime("%A %d %b %Y")},
                        {"type": "text", "text": event.start_datetime.strftime("%H:%M")},
                        {"type": "text", "text": cover_offer.accept_code},
                    ],
                }
            ],
        },
    }

    body = (
        f"Hi {staff.name}, cover is needed for {event.class_type.name} "
        f"on {event.start_datetime:%A %d %b %Y} at {event.start_datetime:%H:%M}. "
        f"Reply ACCEPT {cover_offer.accept_code} to take this class."
    )

    return _send_whatsapp_template(
        whatsapp_account=account,
        phone_number=consent.phone_number,
        template_payload=template_payload,
        body=body,
        staff=staff,
    )


def _send_whatsapp_template(
    whatsapp_account: WhatsAppAccount,
    phone_number: str,
    template_payload: dict,
    body: str,
    staff=None,
) -> WhatsAppMessage:
    """Sends a pre-built template payload and records the message."""
    msg = WhatsAppMessage.objects.create(
        tenant=whatsapp_account.tenant,
        direction=WhatsAppMessage.Direction.OUTBOUND,
        staff=staff,
        phone_number=phone_number,
        template=None,
        body=body,
        message_status=WhatsAppMessage.Status.QUEUED,
        created_by=None,
        updated_by=None,
    )

    url = f"{META_API_BASE}/{whatsapp_account.phone_number_id}/messages"
    headers = {
        "Authorization": f"Bearer {whatsapp_account.access_token}",
        "Content-Type": "application/json",
    }

    try:
        response = requests.post(url, json=template_payload, headers=headers, timeout=15)
        response.raise_for_status()
        data = response.json()
        wamid = data.get("messages", [{}])[0].get("id", "")
        msg.wamid = wamid
        msg.message_status = WhatsAppMessage.Status.SENT
        msg.sent_at = timezone.now()
        msg.save(update_fields=["wamid", "message_status", "sent_at"])
        logger.info("WhatsApp cover notification sent to %s (offer %s)", phone_number, staff.pk if staff else "?")
    except requests.RequestException:
        logger.exception("WhatsApp template send failed for message %s", msg.pk)
        msg.message_status = WhatsAppMessage.Status.FAILED
        msg.failed_at = timezone.now()
        msg.save(update_fields=["message_status", "failed_at"])

    return msg


def send_whatsapp_message(
    whatsapp_account: WhatsAppAccount,
    phone_number: str,
    template,
    variables: dict,
    body: str = "",
    staff=None,
) -> WhatsAppMessage:
    """
    Sends a WhatsApp message via the Meta Business Cloud API.
    Creates and returns a WhatsAppMessage record.
    """
    msg = WhatsAppMessage.objects.create(
        tenant=whatsapp_account.tenant,
        direction=WhatsAppMessage.Direction.OUTBOUND,
        staff=staff,
        phone_number=phone_number,
        template=template,
        body=body,
        message_status=WhatsAppMessage.Status.QUEUED,
        created_by=None,
        updated_by=None,
    )

    payload = _build_message_payload(
        whatsapp_account, phone_number, template, variables, body
    )

    url = f"{META_API_BASE}/{whatsapp_account.phone_number_id}/messages"
    headers = {
        "Authorization": f"Bearer {whatsapp_account.access_token}",
        "Content-Type": "application/json",
    }

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=15)
        response.raise_for_status()
        data = response.json()
        wamid = data.get("messages", [{}])[0].get("id", "")
        msg.wamid = wamid
        msg.message_status = WhatsAppMessage.Status.SENT
        msg.sent_at = timezone.now()
        msg.save(update_fields=["wamid", "message_status", "sent_at"])
    except requests.RequestException as exc:
        logger.exception("WhatsApp send failed for message %s", msg.pk)
        msg.message_status = WhatsAppMessage.Status.FAILED
        msg.failed_at = timezone.now()
        msg.error_code = str(exc)[:50]
        msg.save(update_fields=["message_status", "failed_at", "error_code"])

    return msg


def _build_message_payload(account, phone_number, template, variables, body):
    if template:
        components = []
        if variables:
            params = [{"type": "text", "text": str(v)} for v in variables.values()]
            components.append({"type": "body", "parameters": params})
        return {
            "messaging_product": "whatsapp",
            "to": phone_number,
            "type": "template",
            "template": {
                "name": template.name,
                "language": {"code": template.language},
                "components": components,
            },
        }
    return {
        "messaging_product": "whatsapp",
        "to": phone_number,
        "type": "text",
        "text": {"body": body},
    }


def verify_webhook(verify_token: str, hub_challenge: str, expected_token: str) -> str | None:
    """
    Validates the Meta webhook verification request.
    Returns the hub.challenge string if valid, None otherwise.
    """
    if verify_token == expected_token:
        return hub_challenge
    return None


def handle_webhook_event(payload: dict, tenant) -> WhatsAppWebhookEvent:
    """
    Persists the raw webhook payload and dispatches to the appropriate handler.
    """
    event_type = _extract_event_type(payload)
    event = WhatsAppWebhookEvent.objects.create(
        tenant=tenant,
        event_type=event_type,
        payload=payload,
        processed=False,
    )

    try:
        _dispatch_event(event, tenant)
        event.processed = True
        event.processed_at = timezone.now()
        event.save(update_fields=["processed", "processed_at"])
    except Exception as exc:
        logger.exception("Webhook event %s processing failed", event.pk)
        event.error = str(exc)[:500]
        event.save(update_fields=["error"])

    return event


def _extract_event_type(payload: dict) -> str:
    try:
        entry = payload.get("entry", [{}])[0]
        changes = entry.get("changes", [{}])[0]
        value = changes.get("value", {})
        if "messages" in value:
            return "message"
        if "statuses" in value:
            return "status_update"
    except (IndexError, KeyError):
        pass
    return "unknown"


def _dispatch_event(event: WhatsAppWebhookEvent, tenant):
    if event.event_type == "message":
        try:
            entry = event.payload["entry"][0]["changes"][0]["value"]
            message_data = entry["messages"][0]
            process_inbound_message(message_data, tenant)
        except (KeyError, IndexError) as exc:
            raise ValueError(f"Malformed message payload: {exc}") from exc
    elif event.event_type == "status_update":
        _handle_status_update(event.payload)


def process_inbound_message(message_data: dict, tenant):
    """
    Handles an inbound WhatsApp message.
    Routes cover replies to the cover service.
    """
    from_number = message_data.get("from", "")
    body = ""

    if message_data.get("type") == "text":
        body = message_data.get("text", {}).get("body", "").strip()

    WhatsAppMessage.objects.create(
        tenant=tenant,
        direction=WhatsAppMessage.Direction.INBOUND,
        phone_number=from_number,
        body=body,
        message_status=WhatsAppMessage.Status.DELIVERED,
        delivered_at=timezone.now(),
    )

    if body.upper().startswith("ACCEPT "):
        from apps.cover.services import process_whatsapp_cover_reply
        result = process_whatsapp_cover_reply(from_number, body, tenant)
        logger.info("Cover reply from %s: %s", from_number, result)


def _handle_status_update(payload: dict):
    try:
        entry = payload["entry"][0]["changes"][0]["value"]
        for status_update in entry.get("statuses", []):
            wamid = status_update.get("id")
            new_status = status_update.get("status")
            timestamp = status_update.get("timestamp")
            if wamid:
                _update_message_status(wamid, new_status)
    except (KeyError, IndexError):
        logger.warning("Could not parse status update payload")


def _update_message_status(wamid: str, new_status: str):
    update_fields = {}
    now = timezone.now()

    if new_status == "delivered":
        update_fields = {"message_status": WhatsAppMessage.Status.DELIVERED, "delivered_at": now}
    elif new_status == "read":
        update_fields = {"message_status": WhatsAppMessage.Status.READ, "read_at": now}
    elif new_status == "failed":
        update_fields = {"message_status": WhatsAppMessage.Status.FAILED, "failed_at": now}

    if update_fields:
        WhatsAppMessage.objects.filter(wamid=wamid).update(**update_fields)


def validate_meta_signature(request_body: bytes, signature_header: str) -> bool:
    """
    Validates the X-Hub-Signature-256 header sent by Meta.
    """
    app_secret = settings.META_APP_SECRET
    if not app_secret:
        logger.warning("META_APP_SECRET not configured — skipping signature validation.")
        return True

    if not signature_header.startswith("sha256="):
        return False

    expected_signature = hmac.new(
        app_secret.encode(),
        msg=request_body,
        digestmod=hashlib.sha256,
    ).hexdigest()

    provided_signature = signature_header[7:]
    return hmac.compare_digest(expected_signature, provided_signature)
