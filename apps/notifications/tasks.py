import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name="notifications.send_pending_notifications")
def send_pending_notifications():
    """
    Runs every 5 minutes.  Processes any queued notification dispatch
    tasks — email and WhatsApp delivery for unread notifications.
    """
    from .models import Notification

    pending = (
        Notification.objects.filter(
            is_deleted=False,
            is_read=False,
            tenant__is_active=True,
        )
        .select_related("recipient", "tenant")
        .order_by("created_at")[:500]
    )

    sent_count = 0
    for notification in pending:
        try:
            _dispatch_notification(notification)
            sent_count += 1
        except Exception:
            logger.exception("Failed to dispatch notification %s", notification.pk)

    logger.info("send_pending_notifications: dispatched %d notifications", sent_count)
    return sent_count


def _dispatch_notification(notification):
    """Dispatches a notification via configured channels for the recipient."""
    from apps.staff.models import StaffProfile

    try:
        staff = StaffProfile.objects.get(
            user=notification.recipient,
            tenant=notification.tenant,
        )
    except StaffProfile.DoesNotExist:
        return

    from .models import NotificationPreference

    pref = NotificationPreference.objects.filter(
        staff=staff,
        notification_type=notification.notification_type,
    ).first()

    send_email = pref.email if pref else True
    send_whatsapp = pref.whatsapp if pref else False

    if send_email and notification.recipient.email:
        _send_email_notification(notification)

    if send_whatsapp:
        _send_whatsapp_notification(notification, staff)


def _send_email_notification(notification):
    from django.core.mail import send_mail
    from django.conf import settings

    try:
        send_mail(
            subject=notification.title,
            message=notification.body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[notification.recipient.email],
            fail_silently=False,
        )
    except Exception:
        logger.exception("Email notification failed for %s", notification.pk)


def _send_whatsapp_notification(notification, staff):
    from apps.whatsapp.models import StaffWhatsAppConsent, WhatsAppAccount
    from apps.whatsapp.services import send_whatsapp_message

    consent = StaffWhatsAppConsent.objects.filter(
        staff=staff, consent_given=True, revoked_at__isnull=True
    ).first()

    if not consent:
        return

    account = WhatsAppAccount.objects.filter(
        tenant=notification.tenant, is_active=True
    ).first()

    if not account:
        return

    send_whatsapp_message(
        whatsapp_account=account,
        phone_number=consent.phone_number,
        template=None,
        variables={},
        body=f"{notification.title}\n\n{notification.body}",
        staff=staff,
    )
