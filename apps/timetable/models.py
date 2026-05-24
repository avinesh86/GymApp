from django.db import models

from apps.core.models import TenantAwareModel


class ClassType(TenantAwareModel):
    name = models.CharField(max_length=200)
    color = models.CharField(max_length=7, default="#6b7280")
    description = models.TextField(blank=True)
    duration_minutes = models.PositiveIntegerField(default=60)
    default_location = models.CharField(max_length=200, blank=True)
    required_qualifications = models.TextField(
        blank=True,
        help_text="Comma-separated list of required qualification names.",
    )
    # Attendance viability thresholds
    red_threshold = models.PositiveIntegerField(default=3)
    amber_threshold = models.PositiveIntegerField(default=6)
    green_threshold = models.PositiveIntegerField(default=10)
    purple_threshold = models.PositiveIntegerField(default=20)
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "timetable_class_type"
        unique_together = ("tenant", "name")

    def __str__(self):
        return f"{self.name} ({self.tenant.slug})"


class ClassBonus(TenantAwareModel):
    class BonusType(models.TextChoices):
        FLAT_BONUS = "flat_bonus", "Flat Bonus (always)"
        ATTENDANCE_THRESHOLD = "attendance_threshold", "Attendance Threshold (if attendance ≥ N)"
        PER_HEAD_ABOVE = "per_head_above", "Per Head Above Threshold"

    class_type = models.ForeignKey(ClassType, on_delete=models.CASCADE, related_name="bonuses")
    name = models.CharField(max_length=200, blank=True, help_text="Label shown on invoice line item.")
    bonus_type = models.CharField(max_length=30, choices=BonusType.choices, default=BonusType.FLAT_BONUS)
    threshold = models.PositiveIntegerField(
        default=0,
        help_text="Minimum attendance for attendance_threshold; base count for per_head_above.",
    )
    bonus_amount = models.DecimalField(max_digits=10, decimal_places=2)
    description = models.CharField(max_length=200, blank=True)

    # Legacy field kept for backward compat during migration
    threshold_type = models.CharField(max_length=10, blank=True)

    class Meta:
        db_table = "timetable_class_bonus"

    def __str__(self):
        return f"{self.class_type.name} — {self.get_bonus_type_display()} ${self.bonus_amount}"


class RecurringTimetableRule(TenantAwareModel):
    class DayOfWeek(models.IntegerChoices):
        MONDAY = 0, "Monday"
        TUESDAY = 1, "Tuesday"
        WEDNESDAY = 2, "Wednesday"
        THURSDAY = 3, "Thursday"
        FRIDAY = 4, "Friday"
        SATURDAY = 5, "Saturday"
        SUNDAY = 6, "Sunday"

    class_type = models.ForeignKey(ClassType, on_delete=models.CASCADE, related_name="recurring_rules")
    site = models.ForeignKey(
        "tenants.Site",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recurring_rules",
    )
    day_of_week = models.IntegerField(choices=DayOfWeek.choices, db_index=True)
    start_time = models.TimeField()
    instructor = models.ForeignKey(
        "staff.StaffProfile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recurring_rules",
    )
    valid_from = models.DateField()
    valid_to = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "timetable_recurring_rule"

    def __str__(self):
        return (
            f"{self.class_type.name} — {self.get_day_of_week_display()} {self.start_time}"
        )


class TimetableEvent(TenantAwareModel):
    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "Scheduled"
        UNFILLED = "unfilled", "Unfilled"
        NEEDS_COVER = "needs_cover", "Needs Cover"
        CANCELLED = "cancelled", "Cancelled"
        COMPLETED = "completed", "Completed"

    class ArchiveStatus(models.TextChoices):
        ACTIVE = "active", "Active"
        CLOSED = "closed", "Closed"       # 4-12 weeks past
        ARCHIVED = "archived", "Archived" # 12+ weeks past

    class_type = models.ForeignKey(ClassType, on_delete=models.CASCADE, related_name="events")
    site = models.ForeignKey(
        "tenants.Site",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="events",
    )
    instructor = models.ForeignKey(
        "staff.StaffProfile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="events",
    )
    original_instructor = models.ForeignKey(
        "staff.StaffProfile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="original_events",
        help_text="Instructor before cover was applied.",
    )
    start_datetime = models.DateTimeField(db_index=True)
    end_datetime = models.DateTimeField()
    capacity = models.PositiveIntegerField(default=0)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.SCHEDULED,
        db_index=True,
    )
    archive_status = models.CharField(
        max_length=10,
        choices=ArchiveStatus.choices,
        default=ArchiveStatus.ACTIVE,
        db_index=True,
    )
    notes = models.TextField(blank=True)
    internal_notes = models.TextField(blank=True, help_text="Admin-only notes, not visible to instructors.")
    cancellation_reason = models.CharField(max_length=300, blank=True)
    recurring_rule = models.ForeignKey(
        RecurringTimetableRule,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="events",
    )
    recurring_pattern_id = models.UUIDField(
        null=True,
        blank=True,
        db_index=True,
        help_text="Groups all instances of a recurring series.",
    )
    # Per-event viability overrides (null = use ClassType thresholds)
    amber_threshold_override = models.PositiveIntegerField(null=True, blank=True)
    green_threshold_override = models.PositiveIntegerField(null=True, blank=True)
    purple_threshold_override = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        db_table = "timetable_event"
        indexes = [
            models.Index(fields=["tenant", "start_datetime"]),
            models.Index(fields=["tenant", "status"]),
            models.Index(fields=["tenant", "archive_status"]),
        ]

    def __str__(self):
        return f"{self.class_type.name} {self.start_datetime:%Y-%m-%d %H:%M}"

    @property
    def effective_amber_threshold(self):
        return self.amber_threshold_override if self.amber_threshold_override is not None else self.class_type.amber_threshold

    @property
    def effective_green_threshold(self):
        return self.green_threshold_override if self.green_threshold_override is not None else self.class_type.green_threshold

    @property
    def effective_purple_threshold(self):
        return self.purple_threshold_override if self.purple_threshold_override is not None else self.class_type.purple_threshold
