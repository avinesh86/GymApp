"""
Timetable week endpoint: returns ALL events in the week (no pagination cap)
and honours the calendar filters. Guards the bug where the week view showed
only the first 50 of >50 events, dropping later days.
"""

from datetime import date, datetime, time, timedelta, timezone

import pytest
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.timetable.views import TimetableEventViewSet
from tests.factories import ClassTypeFactory, TimetableEventFactory

pytestmark = pytest.mark.django_db

MONDAY = date(2026, 6, 8)  # a known Monday


def _week(tenant, user, **params):
    rf = APIRequestFactory()
    request = rf.get("/api/v1/timetable/events/week/", {"from": MONDAY.isoformat(), **params})
    request.tenant = tenant
    force_authenticate(request, user=user)
    response = TimetableEventViewSet.as_view({"get": "week"})(request)
    response.render()
    return response


def _make_events(tenant, count, status="scheduled", start_day=MONDAY):
    ct = ClassTypeFactory(tenant=tenant)
    for i in range(count):
        day = start_day + timedelta(days=i % 7)  # spread across all 7 days
        start = datetime.combine(day, time(6, 0), tzinfo=timezone.utc)
        TimetableEventFactory(
            tenant=tenant,
            class_type=ct,
            start_datetime=start,
            end_datetime=start + timedelta(hours=1),
            status=status,
        )


def test_week_returns_all_events_beyond_page_size(tenant, admin_user):
    # 60 > the 50 page size — the paginated list view would have dropped 10.
    _make_events(tenant, 60)

    resp = _week(tenant, admin_user)

    assert resp.status_code == 200
    assert len(resp.data) == 60
    # Every weekday is represented (Thu–Sun not dropped).
    days = {row["date"] for row in resp.data}
    assert len(days) == 7


def test_week_respects_status_filter(tenant, admin_user):
    _make_events(tenant, 8, status="scheduled")
    _make_events(tenant, 5, status="unfilled")

    # Sanity: without a filter the whole week (13 events) comes back.
    assert len(_week(tenant, admin_user).data) == 13

    resp = _week(tenant, admin_user, status="unfilled")

    assert resp.status_code == 200
    # `?status=` filters on the stored field, so only the 5 unfilled rows
    # return. The serialized `status` is a *derived* display value (these are
    # past, unrecorded events, so they render as 'awaiting_attendance') — it is
    # intentionally decoupled from the stored field, so don't assert on it here.
    assert len(resp.data) == 5


def test_week_excludes_other_weeks(tenant, admin_user):
    _make_events(tenant, 3, start_day=MONDAY)
    _make_events(tenant, 4, start_day=MONDAY + timedelta(days=14))  # two weeks later

    resp = _week(tenant, admin_user)

    assert resp.status_code == 200
    assert len(resp.data) == 3
