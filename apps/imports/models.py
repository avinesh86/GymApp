from django.db import models

from apps.core.models import TenantAwareModel


class ImportJob(TenantAwareModel):
    class ImportType(models.TextChoices):
        STAFF = "staff", "Staff"
        TIMETABLE = "timetable", "Timetable"
        ATTENDANCE = "attendance", "Attendance"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PROCESSING = "processing", "Processing"
        COMPLETE = "complete", "Complete"
        FAILED = "failed", "Failed"

    import_type = models.CharField(max_length=30, choices=ImportType.choices)
    file = models.FileField(upload_to="imports/")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    rows_total = models.PositiveIntegerField(default=0)
    rows_success = models.PositiveIntegerField(default=0)
    rows_failed = models.PositiveIntegerField(default=0)
    error_log = models.JSONField(default=list)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "import_job"

    def __str__(self):
        return f"ImportJob {self.import_type} ({self.status})"
