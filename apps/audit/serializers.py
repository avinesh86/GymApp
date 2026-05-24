from rest_framework import serializers

from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    user_email = serializers.CharField(source="user.email", read_only=True, default="")

    class Meta:
        model = AuditLog
        fields = [
            "id", "user", "user_email", "action", "object_type", "object_id",
            "before_data", "after_data", "ip_address", "created_at",
        ]
        read_only_fields = fields
