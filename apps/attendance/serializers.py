from django.conf import settings
from rest_framework import serializers

from apps.timetable.models import TimetableEvent
from apps.timetable.serializers import TimetableEventSerializer
from .models import AttendanceRecord, QRAttendanceToken


class AttendanceRecordSerializer(serializers.ModelSerializer):
    event = serializers.PrimaryKeyRelatedField(
        source="timetable_event",
        queryset=TimetableEvent.objects.all(),
    )
    event_detail = TimetableEventSerializer(source="timetable_event", read_only=True)

    class Meta:
        model = AttendanceRecord
        fields = [
            "id", "event", "event_detail", "count", "recorded_by",
            "recorded_at", "notes", "is_verified", "created_at",
        ]
        read_only_fields = ["id", "event_detail", "created_at", "recorded_by"]


class QRAttendanceTokenSerializer(serializers.ModelSerializer):
    event = serializers.IntegerField(source="timetable_event_id", read_only=True)
    url = serializers.SerializerMethodField()

    def get_url(self, obj):
        # Absolute URL to the public frontend page (not the raw API endpoint),
        # so a phone camera turns it into a tappable link to a form.
        base = settings.FRONTEND_URL.rstrip("/")
        return f"{base}/attendance/qr?token={obj.token}"

    class Meta:
        model = QRAttendanceToken
        fields = ["id", "timetable_event", "event", "token", "url", "created_at", "expires_at", "is_used"]
        read_only_fields = ["id", "event", "token", "url", "created_at", "expires_at", "is_used"]


class SubmitQRAttendanceSerializer(serializers.Serializer):
    token = serializers.CharField()
    count = serializers.IntegerField(min_value=0)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
