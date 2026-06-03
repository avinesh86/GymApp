import secrets

from django.db import models

from apps.core.models import TenantAwareModel


def _generate_accept_code():
    return secrets.token_hex(4).upper()


class Absence(TenantAwareModel):
    staff = models.ForeignKey(
        "staff.StaffProfile",
        on_delete=models.CASCADE,
        related_name="absences",
    )
    reported_at = models.DateTimeField(auto_now_add=True)
    reason = models.CharField(max_length=200, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = "cover_absence"

    def __str__(self):
        return f"Absence: {self.staff.name} reported {self.reported_at:%Y-%m-%d}"


class CoverRequest(TenantAwareModel):
    class Status(models.TextChoices):
        OPEN = "open", "Open"
        OFFERED = "offered", "Offered"
        ACCEPTED = "accepted", "Accepted"
        CANCELLED = "cancelled", "Cancelled"
        EXPIRED = "expired", "Expired"

    class Urgency(models.TextChoices):
        LOW = "low", "Low"
        HIGH = "high", "High"
        CRITICAL = "critical", "Critical"

    timetable_event = models.ForeignKey(
        "timetable.TimetableEvent",
        on_delete=models.CASCADE,
        related_name="cover_requests",
    )
    absence = models.ForeignKey(
        Absence,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cover_requests",
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.OPEN,
        db_index=True,
    )
    urgency = models.CharField(max_length=20, choices=Urgency.choices, default=Urgency.HIGH)
    bonus_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # Cancellation audit trail
    cancellation_reason = models.TextField(blank=True, default="")
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancelled_by = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cancelled_cover_requests",
    )

    class Meta:
        db_table = "cover_request"
        indexes = [
            models.Index(fields=["tenant", "status"]),
        ]

    def __str__(self):
        return f"Cover for {self.timetable_event} — {self.status}"


class CoverOffer(TenantAwareModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        DECLINED = "declined", "Declined"
        EXPIRED = "expired", "Expired"

    cover_request = models.ForeignKey(CoverRequest, on_delete=models.CASCADE, related_name="offers")
    staff = models.ForeignKey(
        "staff.StaffProfile",
        on_delete=models.CASCADE,
        related_name="cover_offers",
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    offered_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)
    accept_code = models.CharField(max_length=16, default=_generate_accept_code, db_index=True)

    class Meta:
        db_table = "cover_offer"
        unique_together = ("cover_request", "staff")

    def __str__(self):
        return f"Offer to {self.staff.name} — {self.status}"


class CoverResponse(models.Model):
    """
    Immutable log of every reply to a cover offer (WhatsApp, in-app, etc.).
    """

    cover_offer = models.ForeignKey(CoverOffer, on_delete=models.CASCADE, related_name="responses")
    action = models.CharField(max_length=20)  # accept / decline
    responded_at = models.DateTimeField(auto_now_add=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        db_table = "cover_response"

    def __str__(self):
        return f"Response {self.action} for offer {self.cover_offer_id}"
