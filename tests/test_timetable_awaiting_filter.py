"""
F3 — timetable "awaiting attendance" filter.

A past, non-cancelled event with no AttendanceRecord is "awaiting attendance".
Guards the awaiting=true filter on both the list and week endpoints.
"""

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.timetable.views import TimetableEventViewSet
from tests.factories import AttendanceRecordFactory, ClassTypeFactory, TimetableEventFactory

pytestmark = pytest.mark.django_db


def _event(tenant, ct, *, hours_ago=None, hours_ahead=None, status="scheduled"):
    if hours_ago is not None:
        start = timezone.now() - timedelta(hours=hours_ago)
    else:
        start = timezone.now() + timedelta(hours=hours_ahead)
    return TimetableEventFactory(
        tenant=tenant,
        class_type=ct,
        start_datetime=start,
        end_datetime=start + timedelta(hours=1),
        status=status,
    )


def _list(tenant, user, **params):
    request = APIRequestFactory().get("/api/v1/timetable/events/", params)
    request.tenant = tenant
    force_authenticate(request, user=user)
    response = TimetableEventViewSet.as_view({"get": "list"})(request)
    response.render()
    return response


def _ids(resp):
    rows = resp.data["results"] if isinstance(resp.data, dict) else resp.data
    return {row["id"] for row in rows}


def test_awaiting_includes_past_unrecorded(tenant, admin_user):
    ct = ClassTypeFactory(tenant=tenant)
    past_unrecorded = _event(tenant, ct, hours_ago=3)

    resp = _list(tenant, admin_user, awaiting="true")

    assert resp.status_code == 200
    assert past_unrecorded.id in _ids(resp)


def test_awaiting_excludes_recorded(tenant, admin_user):
    ct = ClassTypeFactory(tenant=tenant)
    recorded = _event(tenant, ct, hours_ago=3)
    AttendanceRecordFactory(tenant=tenant, timetable_event=recorded, count=10)

    resp = _list(tenant, admin_user, awaiting="true")

    assert recorded.id not in _ids(resp)


def test_awaiting_excludes_future_and_cancelled(tenant, admin_user):
    ct = ClassTypeFactory(tenant=tenant)
    future = _event(tenant, ct, hours_ahead=24)
    cancelled = _event(tenant, ct, hours_ago=3, status="cancelled")
    awaiting = _event(tenant, ct, hours_ago=3)

    resp = _list(tenant, admin_user, awaiting="true")

    ids = _ids(resp)
    assert awaiting.id in ids
    assert future.id not in ids
    assert cancelled.id not in ids


def test_without_awaiting_returns_everything(tenant, admin_user):
    ct = ClassTypeFactory(tenant=tenant)
    future = _event(tenant, ct, hours_ahead=24)
    recorded = _event(tenant, ct, hours_ago=3)
    AttendanceRecordFactory(tenant=tenant, timetable_event=recorded, count=10)

    resp = _list(tenant, admin_user)

    ids = _ids(resp)
    assert future.id in ids
    assert recorded.id in ids


def test_week_action_supports_awaiting(tenant, admin_user):
    """The calendar (week) endpoint honours awaiting=true too."""
    ct = ClassTypeFactory(tenant=tenant)
    # Anchor the week on the Monday of the current week so both events fall in range.
    today = timezone.now().date()
    monday = today - timedelta(days=today.weekday())
    awaiting = _event(tenant, ct, hours_ago=2)
    recorded = _event(tenant, ct, hours_ago=2)
    AttendanceRecordFactory(tenant=tenant, timetable_event=recorded, count=5)

    request = APIRequestFactory().get(
        "/api/v1/timetable/events/week/", {"from": monday.isoformat(), "awaiting": "true"}
    )
    request.tenant = tenant
    force_authenticate(request, user=admin_user)
    response = TimetableEventViewSet.as_view({"get": "week"})(request)
    response.render()

    ids = {row["id"] for row in response.data}
    assert awaiting.id in ids
    assert recorded.id not in ids
