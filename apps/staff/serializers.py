from rest_framework import serializers

from .models import (
    PaymentDetails,
    StaffAvailability,
    StaffClassTypeCapability,
    StaffPayRate,
    StaffPayRateOverride,
    StaffProfile,
    StaffQualification,
)


class StaffQualificationSerializer(serializers.ModelSerializer):
    is_expired = serializers.ReadOnlyField()
    issued_date = serializers.DateField(source="issued_at", read_only=True)
    expiry_date = serializers.DateField(source="expires_at", read_only=True)

    class Meta:
        model = StaffQualification
        fields = ["id", "name", "issued_at", "issued_date", "expires_at", "expiry_date", "document", "is_expired"]
        read_only_fields = ["id", "issued_date", "expiry_date"]


class StaffClassTypeCapabilitySerializer(serializers.ModelSerializer):
    class_type_name = serializers.CharField(source="class_type.name", read_only=True)

    class Meta:
        model = StaffClassTypeCapability
        fields = ["id", "class_type", "class_type_name", "is_active"]
        read_only_fields = ["id"]


class StaffAvailabilitySerializer(serializers.ModelSerializer):
    day_label = serializers.CharField(source="get_day_of_week_display", read_only=True)

    class Meta:
        model = StaffAvailability
        fields = ["id", "day_of_week", "day_label", "start_time", "end_time", "site", "is_available"]
        read_only_fields = ["id"]


class StaffPayRateSerializer(serializers.ModelSerializer):
    rate_per_hour = serializers.DecimalField(source="amount", max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = StaffPayRate
        fields = ["id", "rate_type", "amount", "per_head_rate", "rate_per_hour", "effective_from", "effective_to", "created_at"]
        read_only_fields = ["id", "rate_per_hour", "created_at"]


class StaffPayRateOverrideSerializer(serializers.ModelSerializer):
    class Meta:
        model = StaffPayRateOverride
        fields = [
            "id", "class_type", "site", "amount",
            "effective_from", "effective_to", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class PaymentDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentDetails
        fields = [
            "id", "business_name", "business_logo",
            "bank_name", "account_number", "account_name",
            "sort_code", "payment_reference", "additional_notes",
        ]
        read_only_fields = ["id"]


class NameMixin:
    """Expose first_name / last_name derived from the single name field."""

    def get_first_name(self, obj):
        parts = (obj.name or "").split()
        return parts[0] if parts else ""

    def get_last_name(self, obj):
        parts = (obj.name or "").split()
        return " ".join(parts[1:]) if len(parts) > 1 else ""


class StaffProfileSerializer(NameMixin, serializers.ModelSerializer):
    qualifications = StaffQualificationSerializer(many=True, read_only=True)
    capabilities = StaffClassTypeCapabilitySerializer(many=True, read_only=True)
    first_name = serializers.SerializerMethodField()
    last_name = serializers.SerializerMethodField()

    class Meta:
        model = StaffProfile
        fields = [
            "id", "user", "name", "first_name", "last_name",
            "email", "phone", "role", "status",
            "bio", "avatar", "reliability_score",
            "priority_tier", "cover_reliability_score",
            "qualifications", "capabilities",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "first_name", "last_name", "created_at", "updated_at", "reliability_score"]


class StaffProfileListSerializer(NameMixin, serializers.ModelSerializer):
    first_name = serializers.SerializerMethodField()
    last_name = serializers.SerializerMethodField()

    class Meta:
        model = StaffProfile
        fields = ["id", "name", "first_name", "last_name", "email", "phone", "role", "status", "avatar", "reliability_score"]
        read_only_fields = ["id", "name", "first_name", "last_name", "email", "phone", "role", "status", "avatar", "reliability_score"]
