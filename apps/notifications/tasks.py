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
    """Emails a notification from the tenant's own configured sender."""
    from django.core.mail import EmailMessage

    from apps.tenants.email import get_tenant_email_sender

    sender = get_tenant_email_sender(
        notification.tenant,
        default_display_name=notification.tenant.name,
    )
    try:
        EmailMessage(
            subject=notification.title,
            body=notification.body,
            from_email=sender.from_email,
            to=[notification.recipient.email],
            reply_to=[sender.reply_to] if sender.reply_to else None,
            connection=sender.connection,
        ).send()
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
