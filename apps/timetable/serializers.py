from django.utils import timezone as djtz
from rest_framework import serializers

from apps.core.timezones import tenant_timezone

from .models import ClassBonus, ClassType, RecurringTimetableRule, TimetableEvent


def _tenant_timezone(event):
    """The tenant's timezone for an event. Times are stored as UTC; the
    timetable must show the gym's local time, or a 9am NZ class renders as
    9pm the day before."""
    return tenant_timezone(event.tenant)


class ClassBonusSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClassBonus
        fields = ["id", "name", "bonus_type", "threshold", "bonus_amount", "description"]
        read_only_fields = ["id"]


class ClassTypeSerializer(serializers.ModelSerializer):
    bonuses = ClassBonusSerializer(many=True, read_only=True)

    class Meta:
        model = ClassType
        fields = [
            "id", "name", "color", "description", "duration_minutes", "default_location",
            "required_qualifications", "red_threshold", "amber_threshold",
            "green_threshold", "purple_threshold", "is_active",
            "bonuses", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class RecurringTimetableRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = RecurringTimetableRule
        fields = [
            "id", "class_type", "site", "day_of_week", "start_time",
            "instructor", "valid_from", "valid_to", "is_active",
        ]
        read_only_fields = ["id"]


class TimetableEventSerializer(serializers.ModelSerializer):
    class_type_name = serializers.CharField(source="class_type.name", read_only=True)
    instructor_name = serializers.CharField(source="instructor.name", read_only=True)
    site_name = serializers.CharField(source="site.name", read_only=True)
    date = serializers.SerializerMethodField()
    start_time = serializers.SerializerMethodField()
    end_time = serializers.SerializerMethodField()

    def get_date(self, obj):
        tz = _tenant_timezone(obj)
        return djtz.localtime(obj.start_datetime, tz).date().isoformat()

    def get_start_time(self, obj):
        tz = _tenant_timezone(obj)
        return djtz.localtime(obj.start_datetime, tz).strftime("%H:%M")

    def get_end_time(self, obj):
        tz = _tenant_timezone(obj)
        return djtz.localtime(obj.end_datetime, tz).strftime("%H:%M")

    attendance_count = serializers.SerializerMethodField()
    viability_color = serializers.SerializerMethodField()
    original_instructor_name = serializers.CharField(source="original_instructor.name", read_only=True)

    def get_attendance_count(self, obj):
        try:
            return obj.attendance_record.count
        except Exception:
            return None

    def get_viability_color(self, obj):
        # Viability is known the moment a count is recorded — don't gate on the
        # stored `status` field, which can lag behind reality (e.g. a count
        # recorded against a still-'unfilled' class).
        count = self.get_attendance_count(obj)
        if count is None:
            return "pending"
        if count >= obj.effective_purple_threshold:
            return "purple"
        if count >= obj.effective_green_threshold:
            return "green"
        if count >= obj.effective_amber_threshold:
            return "amber"
        return "red"

    def _display_status(self, obj):
        """Lifecycle status derived from ground truth (time + attendance), not
        the stored ``status`` field alone.

        The stored field drifts: it depends on hourly sweep tasks running and on
        every write path remembering to transition it. That produced the
        reported bugs — future classes shown as 'Awaiting Attendance', finished
        classes still 'Scheduled', and recorded classes still 'Awaiting'.

        We trust the stored field only for the explicit operational states
        (cancelled, needs_cover) and derive the rest:
          - has an attendance count            -> completed
          - in the past, no count yet          -> awaiting_attendance
          - in the future, no instructor       -> unfilled
          - otherwise                          -> scheduled
        """
        s = TimetableEvent.Status
        if obj.status == s.CANCELLED:
            return s.CANCELLED.value
        if self.get_attendance_count(obj) is not None:
            return s.COMPLETED.value
        if obj.end_datetime and obj.end_datetime < djtz.now():
            # Display-only status — past class still owed an attendance count.
            return "awaiting_attendance"
        if obj.status == s.NEEDS_COVER:
            return s.NEEDS_COVER.value
        if obj.instructor_id is None:
            return s.UNFILLED.value
        return s.SCHEDULED.value

    def to_representation(self, obj):
        data = super().to_representation(obj)
        # Override the stored field with the derived lifecycle status for display.
        # Writes still go through the real `status` model field.
        data["status"] = self._display_status(obj)
        return data

    class Meta:
        model = TimetableEvent
        fields = [
            "id", "class_type", "class_type_name", "site", "site_name",
            "instructor", "instructor_name", "original_instructor", "original_instructor_name",
            "start_datetime", "end_datetime",
            "date", "start_time", "end_time",
            "capacity", "status", "archive_status", "notes", "internal_notes", "cancellation_reason",
            "recurring_rule", "recurring_pattern_id",
            "amber_threshold_override", "green_threshold_override", "purple_threshold_override",
            "attendance_count", "viability_color",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "date", "start_time", "end_time",
            "attendance_count", "viability_color",
            "original_instructor_name", "class_type_name", "site_name", "instructor_name",
            "created_at", "updated_at",
        ]


class AssignInstructorSerializer(serializers.Serializer):
    # Null / omitted unassigns the instructor.
    instructor_id = serializers.IntegerField(required=False, allow_null=True)


class CancelEventSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, default="", allow_blank=True)
