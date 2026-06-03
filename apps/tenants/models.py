from django.conf import settings as django_settings
from django.db import models


def _encrypt_field(value: str) -> str:
    from cryptography.fernet import Fernet
    key = django_settings.FIELD_ENCRYPTION_KEY
    if not key:
        return value
    fernet = Fernet(key.encode() if isinstance(key, str) else key)
    return fernet.encrypt(value.encode()).decode()


def _decrypt_field(value: str) -> str:
    from cryptography.fernet import Fernet
    key = django_settings.FIELD_ENCRYPTION_KEY
    if not key:
        return value
    fernet = Fernet(key.encode() if isinstance(key, str) else key)
    return fernet.decrypt(value.encode()).decode()


class Tenant(models.Model):
    class Plan(models.TextChoices):
        FREE = "free", "Free"
        STARTER = "starter", "Starter"
        GROWTH = "growth", "Growth"
        ENTERPRISE = "enterprise", "Enterprise"

    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=100, unique=True, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    plan = models.CharField(max_length=20, choices=Plan.choices, default=Plan.STARTER)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # SaaS signup fields
    signup_email = models.EmailField(blank=True, default="")
    signup_phone = models.CharField(max_length=30, blank=True, default="")

    # Stripe billing
    stripe_customer_id = models.CharField(max_length=120, blank=True, default="")
    stripe_subscription_id = models.CharField(max_length=120, blank=True, default="")
    subscription_plan = models.CharField(max_length=50, default="trial")
    subscription_status = models.CharField(max_length=50, default="trialing")
    trial_ends_at = models.DateTimeField(null=True, blank=True)

    # Onboarding state
    setup_completed = models.BooleanField(default=False)
    onboarding_step = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = "tenants_tenant"

    def __str__(self):
        return self.name


class TenantDomain(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="domains")
    domain = models.CharField(max_length=253, unique=True, db_index=True)
    is_primary = models.BooleanField(default=False)
    is_custom = models.BooleanField(default=False)

    class Meta:
        db_table = "tenants_domain"

    def __str__(self):
        return self.domain


class TenantBranding(models.Model):
    tenant = models.OneToOneField(Tenant, on_delete=models.CASCADE, related_name="branding")
    app_name = models.CharField(max_length=100, default="FitOps")
    logo = models.ImageField(upload_to="branding/logos/", null=True, blank=True)
    primary_color = models.CharField(max_length=7, default="#2563EB")  # hex
    secondary_color = models.CharField(max_length=7, default="#64748B")
    currency = models.CharField(max_length=3, default="AUD")

    class Meta:
        db_table = "tenants_branding"

    def __str__(self):
        return f"Branding for {self.tenant.name}"


class TenantSettings(models.Model):
    class InvoiceFrequency(models.TextChoices):
        WEEKLY = "weekly", "Weekly"
        FORTNIGHTLY = "fortnightly", "Fortnightly"
        MONTHLY = "monthly", "Monthly"
        EIGHT_WEEKLY = "8-weekly", "8-Weekly"

    tenant = models.OneToOneField(Tenant, on_delete=models.CASCADE, related_name="settings")
    invoice_frequency = models.CharField(
        max_length=20,
        choices=InvoiceFrequency.choices,
        default=InvoiceFrequency.FORTNIGHTLY,
    )
    payroll_approval_required = models.BooleanField(default=True)
    whatsapp_enabled = models.BooleanField(default=False)
    email_enabled = models.BooleanField(default=True)
    cover_alerts_enabled = models.BooleanField(default=True)
    invoice_reminders_enabled = models.BooleanField(default=True)
    timezone = models.CharField(max_length=64, default="Australia/Sydney")
    currency_symbol = models.CharField(max_length=10, default="$")
    cover_offer_expiry_hours = models.PositiveSmallIntegerField(default=24)
    auto_generate_invoices = models.BooleanField(default=True)
    # Outgoing email configuration for notifications
    notification_from_email = models.EmailField(blank=True, default="")
    notification_from_name = models.CharField(max_length=100, blank=True, default="")
    _notification_email_password = models.TextField(
        blank=True,
        default="",
        db_column="notification_email_password",
    )

    class Meta:
        db_table = "tenants_settings"

    def __str__(self):
        return f"Settings for {self.tenant.name}"

    @property
    def notification_email_password(self) -> str:
        if not self._notification_email_password:
            return ""
        return _decrypt_field(self._notification_email_password)

    @notification_email_password.setter
    def notification_email_password(self, raw_password: str) -> None:
        if raw_password:
            # Normalize non-breaking spaces (\xa0) that browsers paste in place
            # of regular spaces — SMTP auth requires plain ASCII.
            raw_password = raw_password.replace('\xa0', ' ').strip()
        self._notification_email_password = _encrypt_field(raw_password) if raw_password else ""


class Site(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="sites", db_index=True)
    name = models.CharField(max_length=200)
    address = models.TextField(blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tenants_site"
        unique_together = ("tenant", "name")

    def __str__(self):
        return f"{self.name} ({self.tenant.name})"
