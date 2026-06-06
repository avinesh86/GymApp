from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.core.mixins import TenantScopedMixin
from apps.core.permissions import IsClassCountAdmin, IsGymManager
from apps.timetable.models import TimetableEvent
from apps.timetable.serializers import TimetableEventSerializer

from .models import AttendanceRecord, QRAttendanceToken
from .serializers import (
    AttendanceRecordSerializer,
    QRAttendanceTokenSerializer,
    SubmitQRAttendanceSerializer,
)


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
        if event.status == TimetableEvent.Status.SCHEDULED:
            event.status = TimetableEvent.Status.COMPLETED
            event.save(update_fields=["status", "updated_at"])

        return Response(
            AttendanceRecordSerializer(record).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class QRAttendanceTokenViewSet(TenantScopedMixin, ModelViewSet):
    serializer_class = QRAttendanceTokenSerializer
    permission_classes = [IsGymManager]

    def get_permissions(self):
        # 'submit' and 'info' are public — anyone with a valid QR token can use them
        if getattr(self, 'action', None) in ('submit', 'info'):
            return []
        return super().get_permissions()

    def get_queryset(self):
        return QRAttendanceToken.objects.filter(
            timetable_event__tenant=self.request.tenant
        )

    def perform_create(self, serializer):
        event_id = self.request.data.get("timetable_event")
        event = TimetableEvent.objects.get(pk=event_id, tenant=self.request.tenant)
        expires_at = timezone.now() + timedelta(hours=2)
        serializer.save(timetable_event=event, expires_at=expires_at)

    @action(detail=False, methods=["get"], url_path="info", permission_classes=[])
    def info(self, request):
        """Public: session details for a QR token, so the submit page can show
        what's being recorded before the instructor enters a count."""
        token_str = request.query_params.get("token", "")
        try:
            qr = QRAttendanceToken.objects.select_related(
                "timetable_event__class_type",
                "timetable_event__site",
                "timetable_event__instructor",
            ).get(token=token_str)
        except QRAttendanceToken.DoesNotExist:
            return Response({"detail": "Invalid token."}, status=status.HTTP_404_NOT_FOUND)

        event = qr.timetable_event
        return Response(
            {
                "valid": qr.is_valid(),
                "is_used": qr.is_used,
                "class_type_name": event.class_type.name,
                "date": event.start_datetime.date().isoformat(),
                "start_time": event.start_datetime.strftime("%H:%M"),
                "site_name": event.site.name if event.site else None,
                "instructor_name": event.instructor.name if event.instructor else None,
            }
        )

    @action(detail=False, methods=["post"], url_path="submit", permission_classes=[])
    def submit(self, request):
        serializer = SubmitQRAttendanceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        token_str = serializer.validated_data["token"]
        count = serializer.validated_data["count"]
        notes = serializer.validated_data.get("notes", "")

        try:
            qr_token = QRAttendanceToken.objects.select_related(
                "timetable_event__tenant"
            ).get(token=token_str)
        except QRAttendanceToken.DoesNotExist:
            return Response({"detail": "Invalid token."}, status=status.HTTP_404_NOT_FOUND)

        if not qr_token.is_valid():
            return Response(
                {"detail": "Token is expired or already used."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        record, created = AttendanceRecord.objects.update_or_create(
            timetable_event=qr_token.timetable_event,
            defaults={
                "tenant": qr_token.timetable_event.tenant,
                "count": count,
                "notes": notes,
                "recorded_at": timezone.now(),
            },
        )

        qr_token.is_used = True
        qr_token.save(update_fields=["is_used"])

        event = qr_token.timetable_event
        if event.status == TimetableEvent.Status.SCHEDULED:
            event.status = TimetableEvent.Status.COMPLETED
            event.save(update_fields=["status", "updated_at"])

        return Response(
            AttendanceRecordSerializer(record).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
