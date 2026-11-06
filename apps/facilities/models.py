"""Facilities: the gym's equipment and the faults reported against it.

Every record may belong to one site; a blank site means it applies to the
whole gym (or the gym only has one site).
"""
from django.conf import settings
from django.db import models

from apps.core.models import TenantAwareModel


class Equipment(TenantAwareModel):
    class Category(models.TextChoices):
        CARDIO = "cardio", "Cardio"
        STRENGTH = "strength", "Strength machine"
        FREE_WEIGHTS = "free_weights", "Free weights"
        FUNCTIONAL = "functional", "Functional / rig"
        STUDIO = "studio", "Studio / class"
        POOL = "pool", "Pool / spa"
        BUILDING = "building", "Building / plant"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        IN_SERVICE = "in_service", "In service"
        OUT_OF_ORDER = "out_of_order", "Out of order"
        RETIRED = "retired", "Retired"

    site = models.ForeignKey(
        "tenants.Site", null=True, blank=True, on_delete=models.SET_NULL, related_name="equipment"
    )
    name = models.CharField(max_length=200)
    category = models.CharField(max_length=20, choices=Category.choices, default=Category.OTHER)
    # Where in the building, e.g. "Cardio floor", "Studio 2".
    location = models.CharField(max_length=200, blank=True)
    manufacturer = models.CharField(max_length=120, blank=True)
    model_number = models.CharField(max_length=120, blank=True)
    serial_number = models.CharField(max_length=120, blank=True)
    asset_tag = models.CharField(max_length=60, blank=True)
    supplier = models.CharField(max_length=200, blank=True)
    purchase_date = models.DateField(null=True, blank=True)
    purchase_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    warranty_expires = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.IN_SERVICE, db_index=True)
    notes = models.TextField(blank=True)
    photo = models.ImageField(upload_to="facilities/equipment/", null=True, blank=True)

    class Meta:
        db_table = "facilities_equipment"
        ordering = ["name"]
        indexes = [models.Index(fields=["tenant", "site", "status"])]

    def __str__(self):
        return self.name


class FaultReport(TenantAwareModel):
    class Severity(models.TextChoices):
        LOW = "low", "Minor"
        MEDIUM = "medium", "Needs attention"
        OUT_OF_USE = "out_of_use", "Out of use / unsafe"

    class Status(models.TextChoices):
        REPORTED = "reported", "Reported"
        IN_PROGRESS = "in_progress", "Being fixed"
        WAITING_PARTS = "waiting_parts", "Waiting on parts"
        RESOLVED = "resolved", "Fixed"

    OPEN_STATUSES = (Status.REPORTED, Status.IN_PROGRESS, Status.WAITING_PARTS)

    site = models.ForeignKey(
        "tenants.Site", null=True, blank=True, on_delete=models.SET_NULL, related_name="faults"
    )
    # Blank for faults that aren't a piece of equipment ("leaking shower").
    equipment = models.ForeignKey(
        Equipment, null=True, blank=True, on_delete=models.SET_NULL, related_name="faults"
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    location = models.CharField(max_length=200, blank=True)
    severity = models.CharField(max_length=20, choices=Severity.choices, default=Severity.MEDIUM)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.REPORTED, db_index=True)
    # The latest update in plain words — the one thing staff see besides the
    # status, e.g. "Technician booked for Thursday".
    status_note = models.CharField(max_length=300, blank=True)
    # Internal notes for the facilities team; never shown to instructors.
    internal_notes = models.TextField(blank=True)
    assigned_to = models.CharField(max_length=200, blank=True)
    repair_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        db_table = "facilities_fault_report"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["tenant", "status", "site"])]

    def __str__(self):
        return self.title

    @property
    def is_open(self) -> bool:
        return self.status in self.OPEN_STATUSES


# ─── Checklists ──────────────────────────────────────────────────────────────


class ChecklistTemplate(TenantAwareModel):
    """A repeating check, e.g. "Opening check, daily by 6am"."""

    class Category(models.TextChoices):
        OPENING = "opening", "Opening"
        CLOSING = "closing", "Closing"
        CLEANING = "cleaning", "Cleaning"
        SAFETY = "safety", "Safety"
        POOL = "pool", "Pool / spa"
        EQUIPMENT = "equipment", "Equipment check"
        OTHER = "other", "Other"

    class Frequency(models.TextChoices):
        DAILY = "daily", "Daily"
        WEEKLY = "weekly", "Weekly"
        MONTHLY = "monthly", "Monthly"
        QUARTERLY = "quarterly", "Quarterly"
        YEARLY = "yearly", "Yearly"
        EVERY_N_DAYS = "every_n_days", "Every few days"

    site = models.ForeignKey(
        "tenants.Site", null=True, blank=True, on_delete=models.SET_NULL, related_name="checklists"
    )
    name = models.CharField(max_length=200)
    category = models.CharField(max_length=20, choices=Category.choices, default=Category.OTHER)
    description = models.TextField(blank=True)
    # A check on one machine — its results appear in that machine's history.
    equipment = models.ForeignKey(
        Equipment, null=True, blank=True, on_delete=models.SET_NULL, related_name="checklists"
    )
    frequency = models.CharField(max_length=20, choices=Frequency.choices, default=Frequency.DAILY)
    # Weekly: which days, 0 = Monday … 6 = Sunday.
    weekdays = models.JSONField(default=list, blank=True)
    # Every few days: how many.
    interval_days = models.PositiveSmallIntegerField(default=2)
    # The first due day. Monthly, quarterly and yearly checks fall on this
    # day of the month (or the month's last day when it is shorter).
    start_date = models.DateField()
    # Gym-local time it should be done by.
    due_time = models.TimeField()
    # Roles (from the gym's checklist roles) that do it; empty = all of them.
    assigned_roles = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)
    # When the current schedule began: set when the checklist is switched
    # back on or its schedule changes (null = since it was created). Checks
    # before it aren't created, and ones already late at that moment aren't
    # alerted as overdue.
    schedule_from = models.DateTimeField(null=True, blank=True)

    # Changing any of these starts a new schedule.
    SCHEDULE_FIELDS = ("is_active", "frequency", "weekdays", "interval_days", "start_date", "due_time")

    @property
    def schedule_start(self):
        return self.schedule_from or self.created_at

    class Meta:
        db_table = "facilities_checklist_template"
        ordering = ["name"]

    def __str__(self):
        return self.name


class ChecklistItem(models.Model):
    template = models.ForeignKey(ChecklistTemplate, on_delete=models.CASCADE, related_name="items")
    order = models.PositiveSmallIntegerField(default=0)
    text = models.CharField(max_length=300)
    # The machine this line is about, so a fail raises a fault against it.
    equipment = models.ForeignKey(
        Equipment, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        db_table = "facilities_checklist_item"
        ordering = ["order", "id"]

    def __str__(self):
        return self.text


class ChecklistRun(TenantAwareModel):
    """One due occurrence of a checklist, and how it was done."""

    template = models.ForeignKey(ChecklistTemplate, on_delete=models.CASCADE, related_name="runs")
    site = models.ForeignKey(
        "tenants.Site", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    due_date = models.DateField(db_index=True)  # gym-local day
    due_at = models.DateTimeField(db_index=True)  # UTC
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    notes = models.TextField(blank=True)
    # Set once the overdue alert has gone, so it goes once.
    overdue_alerted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "facilities_checklist_run"
        ordering = ["-due_at"]
        constraints = [
            models.UniqueConstraint(fields=["template", "due_date"], name="one_run_per_checklist_per_day")
        ]

    def __str__(self):
        return f"{self.template} — {self.due_date}"


class ChecklistAnswer(models.Model):
    run = models.ForeignKey(ChecklistRun, on_delete=models.CASCADE, related_name="answers")
    item = models.ForeignKey(ChecklistItem, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    # Kept as it was asked, in case the template changes later.
    item_text = models.CharField(max_length=300)
    equipment = models.ForeignKey(
        Equipment, null=True, blank=True, on_delete=models.SET_NULL, related_name="checklist_answers"
    )
    passed = models.BooleanField()
    note = models.CharField(max_length=500, blank=True)
    photo = models.ImageField(upload_to="facilities/checklists/", null=True, blank=True)
    # The fault raised when this item failed.
    fault = models.ForeignKey(FaultReport, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        db_table = "facilities_checklist_answer"
        ordering = ["id"]
