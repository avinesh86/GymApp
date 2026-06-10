from rest_framework import serializers

from apps.timetable.serializers import TimetableEventSerializer
from .models import Absence, CoverOffer, CoverRequest, CoverResponse


class AbsenceSerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source="staff.name", read_only=True)

    class Meta:
        model = Absence
        fields = ["id", "staff", "staff_name", "reported_at", "reason", "notes", "created_at"]
        read_only_fields = ["id", "reported_at", "created_at"]


class CoverOfferSerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source="staff.name", read_only=True)
    instructor = serializers.IntegerField(source="staff_id", read_only=True)
    instructor_name = serializers.CharField(source="staff.name", read_only=True)

    class Meta:
        model = CoverOffer
        fields = [
            "id", "staff", "staff_name", "instructor", "instructor_name",
            "status", "offered_at", "responded_at", "accept_code",
        ]
        read_only_fields = ["id", "offered_at", "accept_code"]


class CoverRequestSerializer(serializers.ModelSerializer):
    offers = CoverOfferSerializer(many=True, read_only=True)
    event = serializers.IntegerField(source="timetable_event_id", read_only=True)
    event_detail = TimetableEventSerializer(source="timetable_event", read_only=True)
    original_instructor_name = serializers.SerializerMethodField()
    notes = serializers.SerializerMethodField()

    def get_original_instructor_name(self, obj):
        instructor = obj.timetable_event.instructor if obj.timetable_event else None
        return instructor.name if instructor else None

    def get_notes(self, obj):
        if obj.absence:
            return obj.absence.notes or obj.absence.reason
        return ""

    cancelled_by_name = serializers.SerializerMethodField()
    accepted_by_name = serializers.CharField(source="accepted_by.name", read_only=True)

    def get_cancelled_by_name(self, obj):
        if obj.cancelled_by:
            return obj.cancelled_by.get_full_name() or obj.cancelled_by.username
        return None

    class Meta:
        model = CoverRequest
        fields = [
            "id", "timetable_event", "event", "event_detail",
            "absence", "status", "urgency", "bonus_amount",
            "original_instructor_name", "notes",
            "requested_by", "approved_by", "approved_at",
            "accepted_by", "accepted_by_name", "accepted_at",
            "cancellation_reason", "cancelled_at", "cancelled_by_name",
            "offers", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "event", "event_detail", "original_instructor_name",
            "notes", "status",
            "requested_by", "approved_by", "approved_at",
            "accepted_by", "accepted_by_name", "accepted_at",
            "cancellation_reason", "cancelled_at", "cancelled_by_name",
            "created_at", "updated_at",
        ]


class CoverResponseSerializer(serializers.ModelSerializer):
    class Meta:
        model = CoverResponse
        fields = ["id", "cover_offer", "action", "responded_at", "ip_address"]
        read_only_fields = fields


class SendCoverOffersSerializer(serializers.Serializer):
    pass


class AcceptCodeSerializer(serializers.Serializer):
    accept_code = serializers.CharField()
