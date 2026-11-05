"""Report export: download a PDF now, or manage the schedules that email one."""

import logging

from django.http import HttpResponse
from rest_framework import serializers, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from apps.core.mixins import TenantScopedMixin
from apps.core.permissions import IsGymManager
from apps.core.timezones import local_today

from .emails import send_report
from .export import (
    FREQUENCIES,
    SECTION_KEYS,
    build_report,
    last_full_period,
    render_report_pdf,
    report_filename,
)
from .models import ReportSchedule

logger = logging.getLogger(__name__)


class SectionsField(serializers.MultipleChoiceField):
    """A non-empty list of section keys, kept in report order."""

    def __init__(self, **kwargs):
        super().__init__(choices=SECTION_KEYS, allow_empty=False, **kwargs)

    def to_internal_value(self, data):
        chosen = super().to_internal_value(data)
        return [key for key in SECTION_KEYS if key in chosen]

    def to_representation(self, value):
        return list(value)


class ExportSerializer(serializers.Serializer):
    frequency = serializers.ChoiceField(choices=FREQUENCIES)
    # Any day in the period: the day itself, a day in the week, or the month.
    date = serializers.DateField()
    sections = SectionsField()


class ReportExportView(APIView):
    """POST /api/v1/reports/export/ → the report as a PDF download."""

    permission_classes = [IsGymManager]

    def post(self, request):
        serializer = ExportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        report = build_report(
            request.tenant,
            request.user,
            data["frequency"],
            data["date"],
            data["sections"],
        )
        response = HttpResponse(
            render_report_pdf(report), content_type="application/pdf"
        )
        response["Content-Disposition"] = (
            f'attachment; filename="{report_filename(report)}"'
        )
        return response


class ReportScheduleSerializer(serializers.ModelSerializer):
    sections = SectionsField()
    recipients = serializers.ListField(
        child=serializers.EmailField(), allow_empty=False, max_length=20
    )
    # Gym-local time, "HH:MM".
    send_time = serializers.TimeField(format="%H:%M", required=False)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ReportSchedule
        fields = [
            "id",
            "name",
            "frequency",
            "sections",
            "recipients",
            "is_active",
            "send_time",
            "last_period_start",
            "last_sent_at",
            "created_by_name",
        ]
        read_only_fields = [
            "id",
            "last_period_start",
            "last_sent_at",
            "created_by_name",
        ]

    def get_created_by_name(self, obj):
        user = obj.created_by
        return (user.full_name or user.email) if user else ""

    def validate_recipients(self, value):
        # De-duplicate, keeping the order they were typed.
        return list(dict.fromkeys(email.strip().lower() for email in value))


class ReportScheduleViewSet(TenantScopedMixin, ModelViewSet):
    """CRUD for /api/v1/reports/schedules/. A schedule runs as whoever
    created it, so their access decides what the emailed report shows."""

    serializer_class = ReportScheduleSerializer
    permission_classes = [IsGymManager]
    queryset = ReportSchedule.objects.select_related("created_by")

    @action(detail=True, methods=["post"], url_path="send-now")
    def send_now(self, request, pk=None):
        """Email the most recent full period's report straight away, e.g. to
        check it looks right. Doesn't change when the next one goes out."""
        schedule = self.get_object()
        start, _ = last_full_period(schedule.frequency, local_today(request.tenant))
        try:
            send_report(schedule, start)
        except Exception:
            logger.exception("Send-now for report schedule %s failed", schedule.pk)
            return Response(
                {
                    "detail": "The report couldn't be emailed. Check the gym's email settings and try again."
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response({"detail": f"Sent to {len(schedule.recipients)} recipient(s)."})
