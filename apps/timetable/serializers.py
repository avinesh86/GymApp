from rest_framework import serializers

from .models import ClassBonus, ClassType, RecurringTimetableRule, TimetableEvent


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
        return obj.start_datetime.date().isoformat()

    def get_start_time(self, obj):
        return obj.start_datetime.strftime("%H:%M")

    def get_end_time(self, obj):
        return obj.end_datetime.strftime("%H:%M")

    attendance_count = serializers.SerializerMethodField()
    viability_color = serializers.SerializerMethodField()
    original_instructor_name = serializers.CharField(source="original_instructor.name", read_only=True)

    def get_attendance_count(self, obj):
        try:
            return obj.attendance_record.count
        except Exception:
            return None

    def get_viability_color(self, obj):
        count = self.get_attendance_count(obj)
        if count is None or obj.status != TimetableEvent.Status.COMPLETED:
            return "pending"
        if count >= obj.effective_purple_threshold:
            return "purple"
        if count >= obj.effective_green_threshold:
            return "green"
        if count >= obj.effective_amber_threshold:
            return "amber"
        return "red"

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
