from rest_framework import serializers

from .models import Site, Tenant, TenantBranding, TenantDomain, TenantSettings


class TenantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = ["id", "name", "slug", "is_active", "plan", "created_at"]
        read_only_fields = ["id", "created_at"]


class TenantDomainSerializer(serializers.ModelSerializer):
    class Meta:
        model = TenantDomain
        fields = ["id", "tenant", "domain", "is_primary", "is_custom"]
        read_only_fields = ["id"]


class TenantBrandingSerializer(serializers.ModelSerializer):
    class Meta:
        model = TenantBranding
        fields = ["id", "app_name", "logo", "primary_color", "secondary_color", "currency"]
        read_only_fields = ["id"]


class TenantSettingsSerializer(serializers.ModelSerializer):
    # Write-only: accepted on save, never returned in responses
    notification_email_password = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        style={"input_type": "password"},
        help_text="Gmail app password for outgoing notification emails. Leave blank to keep existing.",
    )
    # True when a password has already been saved (lets the frontend show a placeholder)
    notification_email_password_set = serializers.SerializerMethodField(read_only=True)
    # True when the server sends mail itself and the gym has nothing to configure.
    email_sending_managed = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = TenantSettings
        fields = [
            "id",
            "invoice_frequency",
            "pay_period_anchor_date",
            "payroll_approval_required",
            "whatsapp_enabled",
            "email_enabled",
            "cover_alerts_enabled",
            "invoice_reminders_enabled",
            "timezone",
            "currency_symbol",
            "cover_offer_expiry_hours",
            "auto_generate_invoices",
            "notification_from_email",
            "notification_from_name",
            "notification_email_password",
            "notification_email_password_set",
            "email_sending_managed",
        ]
        read_only_fields = ["id", "notification_email_password_set", "email_sending_managed"]

    def get_notification_email_password_set(self, obj: TenantSettings) -> bool:
        return bool(obj._notification_email_password)

    def get_email_sending_managed(self, obj: TenantSettings) -> bool:
        """Whether the server sends mail on the gym's behalf.

        With Resend configured the gym supplies no mail account at all — the
        from-address belongs to the verified domain and their own address
        becomes the reply-to, so the app password is never read. Without it,
        mail goes over SMTP using that password and the field is still needed.
        Deployments differ, so this is reported rather than assumed.
        """
        from django.conf import settings

        return bool(getattr(settings, "RESEND_API_KEY", ""))

    def update(self, instance: TenantSettings, validated_data: dict) -> TenantSettings:
        raw_password = validated_data.pop("notification_email_password", None)
        instance = super().update(instance, validated_data)
        # Only overwrite the stored password when the caller explicitly provides one
        if raw_password:
            instance.notification_email_password = raw_password
            instance.save(update_fields=["_notification_email_password"])
        return instance


class SiteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Site
        fields = ["id", "name", "address", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]
