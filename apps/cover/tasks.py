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


@shared_task(name="cover.expire_stale_cover_requests")
def expire_stale_cover_requests():
    """
    Runs daily.  Marks open/offered cover requests as expired when the
    associated timetable event's end_datetime has already passed.
    """
    now = timezone.now()
    expired_count = CoverRequest.objects.filter(
        status__in=[
            CoverRequest.Status.OPEN,
            CoverRequest.Status.OFFERED,
            CoverRequest.Status.CRITICAL,
        ],
        is_deleted=False,
        timetable_event__end_datetime__lt=now,
        tenant__is_active=True,
    ).update(status=CoverRequest.Status.EXPIRED)

    logger.info("expire_stale_cover_requests: expired %d cover requests", expired_count)
    return expired_count


@shared_task(name="cover.send_cover_reminders")
def send_cover_reminders():
    """
    Runs hourly.  Sends an in-app reminder to instructors who still have a
    pending cover offer on an unfilled request.
    """
    from apps.notifications.models import Notification

    pending_offers = CoverOffer.objects.filter(
        status=CoverOffer.Status.PENDING,
        is_deleted=False,
        cover_request__status__in=[
            CoverRequest.Status.OFFERED,
            CoverRequest.Status.CRITICAL,
        ],
        cover_request__tenant__is_active=True,
    ).select_related(
        "staff__user",
        "cover_request__timetable_event__class_type",
        "cover_request__tenant",
    )

    reminder_count = 0
    for offer in pending_offers:
        if not offer.staff.user:
            continue
        event = offer.cover_request.timetable_event
        Notification.objects.create(
            tenant=offer.cover_request.tenant,
            recipient=offer.staff.user,
            notification_type=Notification.NotificationType.COVER_REQUEST,
            title="Reminder: cover still needs you",
            body=(
                f"{event.class_type.name} on {event.start_datetime:%d %b %Y at %H:%M} "
                f"still needs cover. Accept code: {offer.accept_code}"
            ),
            related_object_type="cover_offer",
            related_object_id=str(offer.pk),
            action_type="accept_cover",
            action_payload={"offer_id": offer.pk, "accept_code": offer.accept_code},
        )
        reminder_count += 1

    logger.info("send_cover_reminders: sent %d reminders", reminder_count)
    return reminder_count


@shared_task(name="cover.advance_cover_requests")
def advance_cover_requests():
    """
    PythonAnywhere-safe replacement for the Celery `countdown` escalation.

    Runs each scheduler tick and, idempotently:
      - marks unfilled requests Critical once they cross the critical timeframe
        (and alerts managers once, guarded by critical_notified_at);
      - escalates to the next tier with fresh eligible candidates once the
        current tier has no pending offers left (expired/declined).
    """
    from apps.tenants.models import TenantSettings

    from . import notifications
    from .models import CoverOffer, CoverRequest
    from .services import _create_offers, get_cover_candidates
    from .state import hours_until, transition

    now = timezone.now()
    settings_by_tenant = {
        ts.tenant_id: ts for ts in TenantSettings.objects.filter(tenant__is_active=True)
    }

    requests = CoverRequest.objects.filter(
        status__in=[
            CoverRequest.Status.OPEN,
            CoverRequest.Status.OFFERED,
            CoverRequest.Status.CRITICAL,
        ],
        is_deleted=False,
        tenant__is_active=True,
    ).select_related("timetable_event__class_type", "tenant", "absence")

    critical_count = 0
    escalated = 0

    for cover_request in requests:
        ts = settings_by_tenant.get(cover_request.tenant_id)
        threshold = getattr(ts, "cover_critical_threshold_hours", 4) or 4
        hours_left = hours_until(cover_request)

        # 1. Critical detection (once).
        if (
            cover_request.critical_notified_at is None
            and hours_left <= threshold
            and cover_request.status in (CoverRequest.Status.OPEN, CoverRequest.Status.OFFERED)
        ):
            transition(
                cover_request,
                CoverRequest.Status.CRITICAL,
                None,
                extra_fields={
                    "urgency": CoverRequest.Urgency.CRITICAL,
                    "critical_notified_at": now,
                },
            )
            notifications.notify_critical(cover_request)
            critical_count += 1

        # 2. Escalation: current tier exhausted (no pending offers left).
        offers = list(
            CoverOffer.objects.filter(cover_request=cover_request).select_related("staff")
        )
        pending = [o for o in offers if o.status == CoverOffer.Status.PENDING]
        if offers and not pending:
            offered_ids = {o.staff_id for o in offers}
            max_tier = max((getattr(o.staff, "priority_tier", 1) or 1) for o in offers)
            candidates = get_cover_candidates(cover_request)
            for tier in range(max_tier + 1, 4):
                fresh = [i for i in candidates.get(tier, []) if i.pk not in offered_ids]
                if fresh:
                    system_user = cover_request.created_by
                    _create_offers(cover_request, fresh, system_user)
                    escalated += 1
                    break

    logger.info(
        "advance_cover_requests: %d critical, %d escalated", critical_count, escalated
    )
    return {"critical": critical_count, "escalated": escalated}
