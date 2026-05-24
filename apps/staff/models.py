from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.core.models import TenantAwareModel


class StaffProfile(TenantAwareModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        INACTIVE = "inactive", "Inactive"
        SUSPENDED = "suspended", "Suspended"

    user = models.OneToOneField(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="staff_profile",
    )
    name = models.CharField(max_length=200)
    email = models.EmailField(db_index=True)
    phone = models.CharField(max_length=30, blank=True)
    role = models.CharField(max_length=30, blank=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ACTIVE,
        db_index=True,
    )
    bio = models.TextField(blank=True)
    avatar = models.ImageField(upload_to="staff/avatars/", null=True, blank=True)
    reliability_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=100.00,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    priority_tier = models.PositiveSmallIntegerField(
        default=1,
        validators=[MinValueValidator(1), MaxValueValidator(3)],
        help_text="Cover dispatch priority: 1 = first offered, 3 = last offered.",
    )
    cover_reliability_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=100.00,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="Separate score tracking cover-specific reliability.",
    )

    class Meta:
        db_table = "staff_profile"
        unique_together = ("tenant", "email")
        indexes = [
            models.Index(fields=["tenant", "status"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.tenant.slug})"


class StaffQualification(TenantAwareModel):
    staff = models.ForeignKey(StaffProfile, on_delete=models.CASCADE, related_name="qualifications")
    name = models.CharField(max_length=200)
    issued_at = models.DateField(null=True, blank=True)
    expires_at = models.DateField(null=True, blank=True)
    document = models.FileField(upload_to="staff/qualifications/", null=True, blank=True)

    class Meta:
        db_table = "staff_qualification"

    def __str__(self):
        return f"{self.name} — {self.staff.name}"

    @property
    def is_expired(self):
        from django.utils import timezone
        if self.expires_at is None:
            return False
        return self.expires_at < timezone.now().date()


class StaffClassTypeCapability(TenantAwareModel):
    staff = models.ForeignKey(StaffProfile, on_delete=models.CASCADE, related_name="capabilities")
    class_type = models.ForeignKey(
        "timetable.ClassType",
        on_delete=models.CASCADE,
        related_name="capable_staff",
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "staff_class_type_capability"
        unique_together = ("staff", "class_type")

    def __str__(self):
        return f"{self.staff.name} can teach {self.class_type.name}"


class StaffAvailability(TenantAwareModel):
    class DayOfWeek(models.IntegerChoices):
        MONDAY = 0, "Monday"
        TUESDAY = 1, "Tuesday"
        WEDNESDAY = 2, "Wednesday"
        THURSDAY = 3, "Thursday"
        FRIDAY = 4, "Friday"
        SATURDAY = 5, "Saturday"
        SUNDAY = 6, "Sunday"

    staff = models.ForeignKey(StaffProfile, on_delete=models.CASCADE, related_name="availability")
    day_of_week = models.IntegerField(choices=DayOfWeek.choices)
    start_time = models.TimeField()
    end_time = models.TimeField()
    site = models.ForeignKey(
        "tenants.Site",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="staff_availability",
    )
    is_available = models.BooleanField(default=True)

    class Meta:
        db_table = "staff_availability"
        unique_together = ("staff", "day_of_week", "site")

    def __str__(self):
        return f"{self.staff.name} — {self.get_day_of_week_display()}"


class StaffPayRate(TenantAwareModel):
    class RateType(models.TextChoices):
        PER_CLASS = "per_class", "Per Class"
        PER_HEAD = "per_head", "Per Head"
        BLENDED = "blended", "Blended (Base + Per Head)"
        HOURLY = "hourly", "Hourly"
        FLAT = "flat", "Flat"

    staff = models.ForeignKey(StaffProfile, on_delete=models.CASCADE, related_name="pay_rates")
    rate_type = models.CharField(max_length=20, choices=RateType.choices, default=RateType.PER_CLASS)
    amount = models.DecimalField(max_digits=10, decimal_places=2, help_text="Base rate (per_class, base for blended, or flat hourly)")
    per_head_rate = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text="Per-attendee rate used for per_head and blended rate types.",
    )
    effective_from = models.DateField()
    effective_to = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "staff_pay_rate"
        indexes = [
            models.Index(fields=["staff", "effective_from"]),
        ]

    def __str__(self):
        return f"{self.staff.name} — {self.rate_type} ${self.amount}"


class StaffPayRateOverride(TenantAwareModel):
    staff = models.ForeignKey(StaffProfile, on_delete=models.CASCADE, related_name="pay_rate_overrides")
    class_type = models.ForeignKey(
        "timetable.ClassType",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    site = models.ForeignKey(
        "tenants.Site",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    effective_from = models.DateField()
    effective_to = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "staff_pay_rate_override"

    def __str__(self):
        return f"Override for {self.staff.name}"


class PaymentDetails(TenantAwareModel):
    staff = models.OneToOneField(StaffProfile, on_delete=models.CASCADE, related_name="payment_details")
    business_name = models.CharField(max_length=200, blank=True)
    business_logo = models.ImageField(upload_to="staff/business_logos/", null=True, blank=True)
    bank_name = models.CharField(max_length=200, blank=True)
    account_number = models.CharField(max_length=50, blank=True)
    account_name = models.CharField(max_length=200, blank=True)
    sort_code = models.CharField(max_length=20, blank=True)
    payment_reference = models.CharField(max_length=100, blank=True)
    additional_notes = models.TextField(blank=True)

    class Meta:
        db_table = "staff_payment_details"

    def __str__(self):
        return f"Payment details for {self.staff.name}"
