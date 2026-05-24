from rest_framework import serializers

from .models import StaffWhatsAppConsent, WhatsAppAccount, WhatsAppMessage, WhatsAppTemplate


class WhatsAppAccountSerializer(serializers.ModelSerializer):
    access_token = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        style={"input_type": "password"},
        help_text="Meta Cloud API access token. Leave blank to keep existing.",
    )
    access_token_set = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = WhatsAppAccount
        fields = [
            "id",
            "business_phone_number",
            "display_name",
            "phone_number_id",
            "waba_id",
            "access_token",
            "access_token_set",
            "webhook_verify_token",
            "is_active",
        ]
        read_only_fields = ["id", "access_token_set"]

    def get_access_token_set(self, obj: WhatsAppAccount) -> bool:
        return bool(obj._access_token_encrypted)

    def create(self, validated_data):
        raw_token = validated_data.pop("access_token", None)
        instance = super().create(validated_data)
        if raw_token:
            instance.access_token = raw_token
            instance.save(update_fields=["_access_token_encrypted"])
        return instance

    def update(self, instance, validated_data):
        raw_token = validated_data.pop("access_token", None)
        instance = super().update(instance, validated_data)
        if raw_token:
            instance.access_token = raw_token
            instance.save(update_fields=["_access_token_encrypted"])
        return instance


class WhatsAppTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = WhatsAppTemplate
        fields = [
            "id", "name", "template_id", "language", "category",
            "body_text", "variables", "is_active",
        ]
        read_only_fields = ["id"]


class WhatsAppMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = WhatsAppMessage
        fields = [
            "id", "direction", "staff", "phone_number", "template", "body",
            "message_status", "wamid", "sent_at", "delivered_at",
            "read_at", "failed_at", "error_code", "created_at",
        ]
        read_only_fields = fields


class StaffWhatsAppConsentSerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source="staff.name", read_only=True)

    class Meta:
        model = StaffWhatsAppConsent
        fields = [
            "id", "staff", "staff_name", "phone_number",
            "consent_given", "given_at", "revoked_at",
        ]
        read_only_fields = ["id"]
