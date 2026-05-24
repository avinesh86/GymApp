from cryptography.fernet import Fernet
from django.conf import settings
from django.db import models

from apps.core.models import TenantAwareModel


def _encrypt(value: str) -> str:
    key = settings.FIELD_ENCRYPTION_KEY
    if not key:
        return value
    fernet = Fernet(key.encode() if isinstance(key, str) else key)
    return fernet.encrypt(value.encode()).decode()


def _decrypt(value: str) -> str:
    key = settings.FIELD_ENCRYPTION_KEY
    if not key:
        return value
    fernet = Fernet(key.encode() if isinstance(key, str) else key)
    return fernet.decrypt(value.encode()).decode()


class WhatsAppAccount(TenantAwareModel):
    # The human-readable WhatsApp Business phone number (e.g. +64224004910)
    business_phone_number = models.CharField(max_length=30, blank=True, default="")
    display_name = models.CharField(max_length=200, blank=True)
    # Meta Cloud API credentials — optional until fully configured
    phone_number_id = models.CharField(max_length=100, blank=True, default="")
    waba_id = models.CharField(max_length=100, blank=True, default="", help_text="WhatsApp Business Account ID")
    _access_token_encrypted = models.TextField(blank=True, default="", db_column="access_token_encrypted")
    webhook_verify_token = models.CharField(max_length=128, blank=True, default="")
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "whatsapp_account"

    def __str__(self):
        return f"WhatsApp Account {self.display_name} ({self.tenant.slug})"

    @property
    def access_token(self) -> str:
        if not self._access_token_encrypted:
            return ""
        return _decrypt(self._access_token_encrypted)

    @access_token.setter
    def access_token(self, raw_token: str):
        self._access_token_encrypted = _encrypt(raw_token) if raw_token else ""


class WhatsAppTemplate(TenantAwareModel):
    name = models.CharField(max_length=200)
    template_id = models.CharField(max_length=100, blank=True)
    language = models.CharField(max_length=10, default="en")
    category = models.CharField(max_length=50, blank=True)
    body_text = models.TextField()
    variables = models.JSONField(default=list, help_text="Ordered list of variable names")
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "whatsapp_template"
        unique_together = ("tenant", "name")

    def __str__(self):
        return f"{self.name} ({self.tenant.slug})"


class WhatsAppMessage(TenantAwareModel):
    class Direction(models.TextChoices):
        INBOUND = "inbound", "Inbound"
        OUTBOUND = "outbound", "Outbound"

    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        SENT = "sent", "Sent"
        DELIVERED = "delivered", "Delivered"
        READ = "read", "Read"
        FAILED = "failed", "Failed"

    direction = models.CharField(max_length=10, choices=Direction.choices, db_index=True)
    staff = models.ForeignKey(
        "staff.StaffProfile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="whatsapp_messages",
    )
    phone_number = models.CharField(max_length=30, db_index=True)
    template = models.ForeignKey(
        WhatsAppTemplate,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    body = models.TextField(blank=True)
    message_status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.QUEUED,
        db_column="status",
    )
    wamid = models.CharField(max_length=200, blank=True, db_index=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    failed_at = models.DateTimeField(null=True, blank=True)
    error_code = models.CharField(max_length=50, blank=True)

    class Meta:
        db_table = "whatsapp_message"
        indexes = [
            models.Index(fields=["tenant", "direction", "message_status"]),
        ]

    def __str__(self):
        return f"{self.direction} to {self.phone_number} [{self.message_status}]"


class WhatsAppWebhookEvent(TenantAwareModel):
    event_type = models.CharField(max_length=100, db_index=True)
    payload = models.JSONField()
    processed = models.BooleanField(default=False, db_index=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    error = models.TextField(blank=True)

    class Meta:
        db_table = "whatsapp_webhook_event"

    def __str__(self):
        return f"WebhookEvent {self.event_type} processed={self.processed}"


class StaffWhatsAppConsent(TenantAwareModel):
    staff = models.OneToOneField(
        "staff.StaffProfile",
        on_delete=models.CASCADE,
        related_name="whatsapp_consent",
    )
    phone_number = models.CharField(max_length=30, db_index=True)
    consent_given = models.BooleanField(default=False)
    given_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "whatsapp_staff_consent"

    def __str__(self):
        return f"WhatsApp consent for {self.staff.name}: {'given' if self.consent_given else 'not given'}"
