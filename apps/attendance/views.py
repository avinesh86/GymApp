from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.core.mixins import TenantScopedMixin
from apps.core.permissions import IsClassCountAdmin
from apps.timetable.models import TimetableEvent
from apps.timetable.serializers import TimetableEventSerializer

from .models import AttendanceRecord
from .serializers import AttendanceRecordSerializer

# Statuses that an attendance count closes out into COMPLETED. Recording a count
# is the signal a class actually ran, so it completes the class regardless of
# whether it was still scheduled, flagged unfilled (no instructor), or in
# needs_cover — previously only SCHEDULED transitioned, leaving recorded classes
# stuck showing 'Awaiting Attendance'.
_OPEN_STATUSES = {
    TimetableEvent.Status.SCHEDULED,
    TimetableEvent.Status.UNFILLED,
    TimetableEvent.Status.NEEDS_COVER,
}


def _complete_on_attendance(event):
    if event.status in _OPEN_STATUSES:
        event.status = TimetableEvent.Status.COMPLETED
        event.save(update_fields=["status", "updated_at"])


class AttendanceRecordViewSet(TenantScopedMixin, ModelViewSet):
    serializer_class = AttendanceRecordSerializer
    permission_classes = [IsClassCountAdmin]
    filterset_fields = ["is_verified"]

    def get_queryset(self):
        return (
            AttendanceRecord.objects.filter(tenant=self.request.tenant, is_deleted=False)
            .select_related(
                "timetable_event__class_type",
                "timetable_event__site",
                "timetable_event__instructor",
                "recorded_by",
            )
            .order_by("-recorded_at")
        )

    def list(self, request, *args, **kwargs):
        if request.query_params.get("awaiting") == "true":
            return self._list_awaiting(request)
        return super().list(request, *args, **kwargs)

    def _list_awaiting(self, request):
        recorded_event_ids = AttendanceRecord.objects.filter(
            tenant=request.tenant,
        ).values_list("timetable_event_id", flat=True)

        base_qs = (
            TimetableEvent.objects.filter(
                tenant=request.tenant,
                is_deleted=False,
                end_datetime__lt=timezone.now(),
            )
            .exclude(status=TimetableEvent.Status.CANCELLED)
            .exclude(id__in=recorded_event_ids)
            .select_related("class_type", "site", "instructor")
        )

        # Frontend sends ISO datetime strings in local (browser) time so that
        # UTC-stored datetimes are compared correctly regardless of tenant timezone.
        from_datetime = request.query_params.get("from_datetime")
        to_datetime = request.query_params.get("to_datetime")
        count_only = request.query_params.get("count_only") == "true"

        if from_datetime:
            base_qs = base_qs.filter(start_datetime__gte=from_datetime)
        if to_datetime:
            base_qs = base_qs.filter(start_datetime__lte=to_datetime)

        if count_only:
            return Response({"count": base_qs.count()})

        events = base_qs.order_by("-start_datetime")[:100]

        data = [
            {
                "id": event.id,
                "event": event.id,
                "event_detail": TimetableEventSerializer(event).data,
                "count": None,
                "recorded_by": None,
                "recorded_at": None,
                "notes": "",
                "is_verified": False,
            }
            for event in events
        ]
        return Response(data)

    def perform_create(self, serializer):
        serializer.save(
            tenant=self.request.tenant,
            recorded_by=self.request.user,
            created_by=self.request.user,
            updated_by=self.request.user,
        )

    @action(detail=False, methods=["post"], url_path="submit-for-event")
    def submit_for_event(self, request):
        event_id = request.data.get("event")
        count = request.data.get("count")
        if count is None:
            return Response({"count": "This field is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            event = TimetableEvent.objects.get(pk=event_id, tenant=request.tenant, is_deleted=False)
        except TimetableEvent.DoesNotExist:
            return Response({"detail": "Event not found."}, status=status.HTTP_404_NOT_FOUND)

        record, created = AttendanceRecord.objects.update_or_create(
            timetable_event=event,
            defaults={
                "tenant": request.tenant,
                "count": count,
                "recorded_by": request.user,
                "recorded_at": timezone.now(),
                "created_by": request.user,
                "updated_by": request.user,
            },
        )
        _complete_on_attendance(event)

        return Response(
            AttendanceRecordSerializer(record).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

