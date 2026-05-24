from rest_framework import serializers

from .models import Notification, NotificationPreference


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = [
            "id", "notification_type", "title", "body",
            "is_read", "read_at", "related_object_type",
            "related_object_id", "action_type", "action_payload",
            "created_at",
        ]
        read_only_fields = fields


class MarkReadSerializer(serializers.Serializer):
    notification_ids = serializers.ListField(child=serializers.IntegerField())


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationPreference
        fields = ["id", "staff", "notification_type", "in_app", "email", "whatsapp"]
        read_only_fields = ["id"]
