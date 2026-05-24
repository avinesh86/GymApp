import logging
from datetime import timedelta

from celery import shared_task
from django.conf import settings as django_settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils import timezone

from .models import CoverOffer, CoverRequest

logger = logging.getLogger(__name__)


def _build_email_connection(tenant_settings) -> object | None:
    """
    Returns a Django email backend connection configured with the tenant's
    outgoing email credentials.  Falls back to None (use global settings).
    """
    from django.core.mail import get_connection

    from_email = getattr(tenant_settings, "notification_from_email", "") or ""
    password = getattr(tenant_settings, "notification_email_password", "") or ""

    if not from_email or not password:
        return None

    return get_connection(
        backend="django.core.mail.backends.smtp.EmailBackend",
        host=django_settings.EMAIL_HOST,
        port=django_settings.EMAIL_PORT,
        username=from_email,
        password=password,
        use_tls=django_settings.EMAIL_USE_TLS,
        fail_silently=False,
    )


def _send_cover_request_email(offer: CoverOffer) -> None:
    """Renders and sends the cover request HTML email to the staff member."""
    from apps.tenants.models import TenantSettings

    staff = offer.staff
    cover_request = offer.cover_request
    event = cover_request.timetable_event

    recipient_email = staff.user.email if staff.user else None
    if not recipient_email:
        logger.warning("No email for staff %s — skipping cover email", staff.pk)
        return

    try:
        tenant_settings = TenantSettings.objects.get(tenant=cover_request.tenant)
    except TenantSettings.DoesNotExist:
        tenant_settings = None

    # Resolve from_email: prefer tenant-configured address, fall back to global default
    from_email_address = (
        getattr(tenant_settings, "notification_from_email", "") or django_settings.DEFAULT_FROM_EMAIL
    )
    from_name = (
        getattr(tenant_settings, "notification_from_name", "") or cover_request.tenant.name
    )
    from_email = f"{from_name} <{from_email_address}>" if from_name else from_email_address
    reply_to = getattr(django_settings, "EMAIL_REPLY_TO", from_email_address) or from_email_address

    connection = _build_email_connection(tenant_settings)

    accept_url = (
        f"{getattr(django_settings, 'FRONTEND_URL', 'http://localhost:3000')}"
        f"/cover/accept/{offer.accept_code}"
    )

    context = {
        "staff_name": staff.name,
        "class_name": event.class_type.name,
        "event_date": event.start_datetime.strftime("%A, %d %B %Y"),
        "event_time": event.start_datetime.strftime("%H:%M"),
        "location": event.site.name if event.site else "",
        "urgency": cover_request.urgency,
        "bonus_amount": cover_request.bonus_amount if cover_request.bonus_amount else None,
        "notes": getattr(cover_request, "notes", ""),
        "accept_code": offer.accept_code,
        "accept_url": accept_url,
        "tenant_name": cover_request.tenant.name,
    }

    html_body = render_to_string("cover/cover_request_email.html", context)
    subject = f"Cover needed: {event.class_type.name} on {context['event_date']}"
    plain_body = (
        f"Cover needed for {event.class_type.name} on {context['event_date']} "
        f"at {context['event_time']}. Accept code: {offer.accept_code}"
    )

    message = EmailMultiAlternatives(
        subject=subject,
        body=plain_body,
        from_email=from_email,
        to=[recipient_email],
        reply_to=[reply_to],
        connection=connection,
    )
    message.attach_alternative(html_body, "text/html")
    message.send()
    logger.info("Cover request email sent to %s for offer %s", recipient_email, offer.pk)


def _create_cover_in_app_notification(offer: CoverOffer) -> None:
    """Creates an in-app notification for the staff member with a Take Cover action."""
    from apps.notifications.models import Notification

    staff = offer.staff
    if not staff.user:
        return

    cover_request = offer.cover_request
    event = cover_request.timetable_event

    Notification.objects.create(
        tenant=cover_request.tenant,
        recipient=staff.user,
        notification_type=Notification.NotificationType.COVER_REQUEST,
        title=f"Cover needed: {event.class_type.name}",
        body=(
            f"{event.class_type.name} on {event.start_datetime.strftime('%d %b %Y at %H:%M')} "
            f"needs a cover instructor. Be the first to accept!"
        ),
        related_object_type="cover_offer",
        related_object_id=str(offer.pk),
        action_type="accept_cover",
        action_payload={
            "offer_id": offer.pk,
            "cover_request_id": cover_request.pk,
            "accept_code": offer.accept_code,
        },
    )


@shared_task(name="cover.notify_cover_offers")
def notify_cover_offers(offer_pk: int):
    """Send in-app and email notification for a newly created cover offer."""
    try:
        offer = CoverOffer.objects.select_related(
            "staff__user",
            "cover_request__timetable_event__class_type",
            "cover_request__timetable_event__site",
            "cover_request__tenant",
        ).get(pk=offer_pk)
    except CoverOffer.DoesNotExist:
        logger.error("CoverOffer %s not found", offer_pk)
        return

    try:
        _create_cover_in_app_notification(offer)
    except Exception:
        logger.exception("Failed to create in-app notification for offer %s", offer_pk)

    try:
        _send_cover_request_email(offer)
    except Exception:
        logger.exception("Failed to send cover request email for offer %s", offer_pk)

    # WhatsApp notification (Phase 2)
    from apps.tenants.models import TenantSettings
    try:
        tenant_settings = TenantSettings.objects.get(tenant=offer.cover_request.tenant)
        if tenant_settings.whatsapp_enabled:
            from apps.whatsapp.services import send_cover_request_message
            send_cover_request_message(offer)
    except Exception:
        logger.exception("Failed to send WhatsApp cover notification for offer %s", offer_pk)


@shared_task(name="cover.schedule_cover_escalation")
def schedule_cover_escalation(cover_request_pk: int, next_tier: int):
    """Escalates a cover request to the next tier or notifies admins when all tiers exhausted."""
    from .services import escalate_cover_request
    escalate_cover_request(cover_request_pk, next_tier)


@shared_task(name="cover.expire_cover_offers")
def expire_cover_offers():
    """
    Runs every 30 minutes.  Expires pending offers past the tenant's
    cover_offer_expiry_hours threshold.
    """
    from apps.tenants.models import TenantSettings

    settings_qs = TenantSettings.objects.select_related("tenant").filter(
        tenant__is_active=True
    )

    total_expired = 0
    for tenant_settings in settings_qs:
        cutoff = timezone.now() - timedelta(hours=tenant_settings.cover_offer_expiry_hours)
        expired_count = CoverOffer.objects.filter(
            cover_request__tenant=tenant_settings.tenant,
            status=CoverOffer.Status.PENDING,
            offered_at__lt=cutoff,
        ).update(status=CoverOffer.Status.EXPIRED, responded_at=timezone.now())
        total_expired += expired_count

    logger.info("expire_cover_offers: expired %d offers", total_expired)
    return total_expired


@shared_task(name="cover.send_cover_reminders")
def send_cover_reminders():
    """
    Runs hourly.  Sends reminders for open cover requests that have not yet
    been accepted.
    """
    open_requests = CoverRequest.objects.filter(
        status__in=[CoverRequest.Status.OPEN, CoverRequest.Status.OFFERED],
        is_deleted=False,
        tenant__is_active=True,
    ).select_related("timetable_event__class_type", "tenant")

    reminder_count = 0
    for cover_request in open_requests:
        logger.info("Reminder for cover request %s", cover_request.pk)
        reminder_count += 1

    logger.info("send_cover_reminders: sent %d reminders", reminder_count)
    return reminder_count
