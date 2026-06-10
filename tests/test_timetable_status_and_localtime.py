"""
Tests for the timetable "past class still Scheduled" bug fix:

  1. mark_past_events_completed task transitions finished, still-open events
     to COMPLETED (and leaves cancelled / completed / future events alone).
  2. Completed-but-unrecorded events still surface in awaiting-attendance,
     so the attendance prompt is not lost.
  3. TimetableEventSerializer renders date / start_time / end_time in the
     tenant's local timezone, not UTC (the "9:00pm – 10:00am" bug).
"""

from datetime import datetime, timedelta, timezone as dt_timezone

import pytest
from django.utils import timezone

from apps.attendance.views import AttendanceRecordViewSet
from apps.timetable.models import TimetableEvent
from apps.timetable.serializers import TimetableEventSerializer
from apps.timetable.tasks import mark_past_events_completed
from rest_framework.test import APIRequestFactory, force_authenticate
from tests.factories import TenantSettingsFactory, TimetableEventFactory


def _event(tenant, class_type, *, start, hours=1, status="scheduled"):
    return TimetableEventFactory(
        tenant=tenant,
        class_type=class_type,
        start_datetime=start,
        end_datetime=start + timedelta(hours=hours),
        status=status,
    )


@pytest.mark.django_db
class TestMarkPastEventsCompleted:
    def test_completes_past_scheduled_unfilled_needs_cover(self, tenant, class_type):
        past = timezone.now() - timedelta(hours=3)
        scheduled = _event(tenant, class_type, start=past, status="scheduled")
        unfilled = _event(tenant, class_type, start=past, status="unfilled")
        needs_cover = _event(tenant, class_type, start=past, status="needs_cover")

        completed_count = mark_past_events_completed()

        assert completed_count == 3
        for event in (scheduled, unfilled, needs_cover):
            event.refresh_from_db()
            assert event.status == TimetableEvent.Status.COMPLETED

    def test_leaves_cancelled_and_completed_untouched(self, tenant, class_type):
        past = timezone.now() - timedelta(hours=3)
        cancelled = _event(tenant, class_type, start=past, status="cancelled")
        completed = _event(tenant, class_type, start=past, status="completed")

        mark_past_events_completed()

        cancelled.refresh_from_db()
        completed.refresh_from_db()
        assert cancelled.status == TimetableEvent.Status.CANCELLED
        assert completed.status == TimetableEvent.Status.COMPLETED

    def test_leaves_future_events_scheduled(self, tenant, class_type):
        future = timezone.now() + timedelta(hours=3)
        upcoming = _event(tenant, class_type, start=future, status="scheduled")

        mark_past_events_completed()

        upcoming.refresh_from_db()
        assert upcoming.status == TimetableEvent.Status.SCHEDULED

    def test_completed_event_still_awaits_attendance(self, tenant, class_count_admin_user, class_type):
        """Regression: auto-completing must not drop the attendance prompt."""
        past = timezone.now() - timedelta(hours=3)
        event = _event(tenant, class_type, start=past, status="scheduled")
        mark_past_events_completed()
        event.refresh_from_db()
        assert event.status == TimetableEvent.Status.COMPLETED

        request = APIRequestFactory().get("/api/v1/attendance/records/?awaiting=true")
        force_authenticate(request, user=class_count_admin_user)
        request.tenant = tenant
        response = AttendanceRecordViewSet.as_view({"get": "list"})(request)

        event_ids = [item["event"] for item in response.data]
        assert event.pk in event_ids


@pytest.mark.django_db
class TestSerializerLocalTime:
    def test_renders_times_in_tenant_timezone(self, tenant, class_type):
        TenantSettingsFactory(tenant=tenant, timezone="Pacific/Auckland")
        # 2026-06-08 21:00 UTC == 2026-06-09 09:00 NZST (UTC+12, winter).
        start_utc = datetime(2026, 6, 8, 21, 0, tzinfo=dt_timezone.utc)
        event = _event(tenant, class_type, start=start_utc, hours=1)

        data = TimetableEventSerializer(event).data

        assert data["start_time"] == "09:00"
        assert data["end_time"] == "10:00"
        assert data["date"] == "2026-06-09"

    def test_no_overnight_inversion(self, tenant, class_type):
        """The reported bug: a 9am class showing as "9:00pm – 10:00am"."""
        TenantSettingsFactory(tenant=tenant, timezone="Pacific/Auckland")
        start_utc = datetime(2026, 6, 8, 21, 0, tzinfo=dt_timezone.utc)
        event = _event(tenant, class_type, start=start_utc, hours=1)

        data = TimetableEventSerializer(event).data

        assert data["start_time"] < data["end_time"]

    def test_falls_back_when_no_settings(self, tenant, class_type):
        """No TenantSettings row → uses project default tz, never crashes."""
        start_utc = datetime(2026, 6, 8, 21, 0, tzinfo=dt_timezone.utc)
        event = _event(tenant, class_type, start=start_utc, hours=1)

        data = TimetableEventSerializer(event).data

        # UTC project default → unchanged wall-clock time.
        assert data["start_time"] == "21:00"
        assert data["end_time"] == "22:00"
