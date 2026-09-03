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
        """A code works until the class has actually been counted.

        It used to expire two hours after it was *generated*, which meant
        printing codes in the morning for an evening class produced a sheet of
        dead QR codes. What should close a code is the thing it exists to
        collect: once attendance is recorded — by this code, by another, or by
        hand in Bulk Attendance — it stops working.

        expires_at remains as a long backstop so a code that never gets used
        does not stay live forever.
        """
        if self.is_used or self.expires_at <= timezone.now():
            return False
        return not self.attendance_already_recorded()

    def attendance_already_recorded(self) -> bool:
        """Whether this class has a count against it by any route."""
        from .models import AttendanceRecord  # noqa: PLC0415 — self-import for clarity

        return AttendanceRecord.objects.filter(
            timetable_event_id=self.timetable_event_id, is_deleted=False
        ).exists()
