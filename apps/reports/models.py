"""Reports are mostly read-only aggregations over other apps' models; the one
model here is the schedule for emailing them."""

from datetime import time

from django.db import models

from apps.core.models import TenantAwareModel

from .export import FREQUENCIES


class ReportSchedule(TenantAwareModel):
    """A report emailed automatically after each day, week or month ends.

    The report runs as ``created_by``, so it shows what that person can see
    (their class filter and permissions) and stops if they lose access.
    """

    name = models.CharField(max_length=120)
    frequency = models.CharField(
        max_length=10, choices=[(f, f.title()) for f in FREQUENCIES]
    )
    # Which parts of the report to include, from export.SECTION_KEYS.
    sections = models.JSONField(default=list)
    recipients = models.JSONField(default=list)
    is_active = models.BooleanField(default=True)
    # Gym-local time of day it goes out, once the period has ended.
    send_time = models.TimeField(default=time(7, 0))
    # Start of the last period sent, so each period goes out once.
    last_period_start = models.DateField(null=True, blank=True)
    last_sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.frequency})"
