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
