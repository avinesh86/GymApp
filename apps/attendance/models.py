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
    return secrets.token_urlsafe(32)


class QRAttendanceToken(models.Model):
    """
    Short-lived token used for QR-code-based attendance submission.
    Not tenant-aware at model level since it's resolved via the event.
    """

    timetable_event = models.ForeignKey(
        "timetable.TimetableEvent",
        on_delete=models.CASCADE,
        related_name="qr_tokens",
    )
    token = models.CharField(max_length=64, unique=True, default=_generate_qr_token, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)

    class Meta:
        db_table = "attendance_qr_token"

    def __str__(self):
        return f"QR token for event {self.timetable_event_id}"

    def is_valid(self):
        return not self.is_used and self.expires_at > timezone.now()
