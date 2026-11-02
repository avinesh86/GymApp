from rest_framework import serializers

from apps.timetable.models import TimetableEvent
from apps.timetable.serializers import TimetableEventSerializer
from .models import AttendanceRecord


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

