import secrets

from django.db import models
from django.utils import timezone

from apps.core.models import TenantAwareModel


class AttendanceRecord(TenantAwareModel):
    timetable_event = models.OneToOneField(
        "timetable.TimetableEvent",
        on_delete=models.CASCADE,
        related_name="attendance_record",
    )
    count = models.PositiveIntegerField(default=0)
    recorded_by = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="recorded_attendances",
    )
    recorded_at = models.DateTimeField(default=timezone.now)
    notes = models.TextField(blank=True)
    is_verified = models.BooleanField(default=False, db_index=True)

    class Meta:
        db_table = "attendance_record"

    def __str__(self):
        return f"Attendance {self.timetable_event} — {self.count}"


def _generate_qr_token():
    # QR attendance was removed (migration 0003), but migration 0001 still
    # names this function as a field default, so it has to stay importable.
    return secrets.token_urlsafe(32)
