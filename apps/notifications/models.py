from django.db import models

from apps.core.models import TenantAwareModel


class Notification(TenantAwareModel):
    class NotificationType(models.TextChoices):
        COVER_REQUEST = "cover_request", "Cover Request"
        COVER_ACCEPTED = "cover_accepted", "Cover Accepted"
        INVOICE_SUBMITTED = "invoice_submitted", "Invoice Submitted"
        INVOICE_APPROVED = "invoice_approved", "Invoice Approved"
        INVOICE_REJECTED = "invoice_rejected", "Invoice Rejected"
        INVOICE_PAID = "invoice_paid", "Invoice Paid"
        CLASS_CANCELLED = "class_cancelled", "Class Cancelled"
        CLASS_REMINDER = "class_reminder", "Class Reminder"
        SYSTEM = "system", "System"

    recipient = models.ForeignKey(
        "users.User",
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    notification_type = models.CharField(
        max_length=30,
        choices=NotificationType.choices,
        db_index=True,
    )
    title = models.CharField(max_length=200)
    body = models.TextField()
    is_read = models.BooleanField(default=False, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True)
    related_object_type = models.CharField(max_length=100, blank=True)
    related_object_id = models.CharField(max_length=50, blank=True)
    # Optional call-to-action attached to this notification
    action_type = models.CharField(max_length=50, blank=True, db_index=True)
    action_payload = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "notification"
        indexes = [
            models.Index(fields=["tenant", "recipient", "is_read"]),
        ]

    def __str__(self):
        return f"Notification to {self.recipient.email}: {self.title}"


class NotificationPreference(TenantAwareModel):
    staff = models.ForeignKey(
        "staff.StaffProfile",
        on_delete=models.CASCADE,
        related_name="notification_preferences",
    )
    notification_type = models.CharField(max_length=30)
    in_app = models.BooleanField(default=True)
    email = models.BooleanField(default=True)
    whatsapp = models.BooleanField(default=False)

    class Meta:
        db_table = "notification_preference"
        unique_together = ("staff", "notification_type")

    def __str__(self):
        return f"Pref {self.staff.name} — {self.notification_type}"
