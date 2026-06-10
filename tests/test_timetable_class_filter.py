"""
F2 — filter the timetable by class type.

The list endpoint already filters via django-filter (filterset_fields), but the
week action mirrored only status/site/instructor/search. This guards both the
list and week endpoints filtering by class_type.
"""

from datetime import date, datetime, time, timedelta, timezone

import pytest
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.timetable.views import TimetableEventViewSet
from tests.factories import ClassTypeFactory, TimetableEventFactory

pytestmark = pytest.mark.django_db

MONDAY = date(2026, 6, 8)  # a known Monday


def _event(tenant, class_type, day=MONDAY):
    start = datetime.combine(day, time(6, 0), tzinfo=timezone.utc)
    return TimetableEventFactory(
        tenant=tenant,
        class_type=class_type,
        start_datetime=start,
        end_datetime=start + timedelta(hours=1),
        status="scheduled",
    )


def _week(tenant, user, **params):
    request = APIRequestFactory().get(
        "/api/v1/timetable/events/week/", {"from": MONDAY.isoformat(), **params}
    )
    request.tenant = tenant
    force_authenticate(request, user=user)
    response = TimetableEventViewSet.as_view({"get": "week"})(request)
    response.render()
    return response


def _list(tenant, user, **params):
    request = APIRequestFactory().get("/api/v1/timetable/events/", params)
    request.tenant = tenant
    force_authenticate(request, user=user)
    response = TimetableEventViewSet.as_view({"get": "list"})(request)
    response.render()
    return response


def test_week_filters_by_class_type(tenant, admin_user):
    yoga = ClassTypeFactory(tenant=tenant, name="Yoga")
    spin = ClassTypeFactory(tenant=tenant, name="Spin")
    _event(tenant, yoga)
    _event(tenant, yoga, day=MONDAY + timedelta(days=1))
    _event(tenant, spin)

    resp = _week(tenant, admin_user, class_type=yoga.id)

    assert resp.status_code == 200
    assert len(resp.data) == 2
    assert all(row["class_type"] == yoga.id for row in resp.data)


def test_week_without_class_type_returns_all(tenant, admin_user):
    yoga = ClassTypeFactory(tenant=tenant, name="Yoga")
    spin = ClassTypeFactory(tenant=tenant, name="Spin")
    _event(tenant, yoga)
    _event(tenant, spin)

    resp = _week(tenant, admin_user)

    assert len(resp.data) == 2


def test_list_filters_by_class_type(tenant, admin_user):
    yoga = ClassTypeFactory(tenant=tenant, name="Yoga")
    spin = ClassTypeFactory(tenant=tenant, name="Spin")
    _event(tenant, yoga)
    _event(tenant, spin)

    resp = _list(tenant, admin_user, class_type=yoga.id)

    assert resp.status_code == 200
    results = resp.data["results"] if isinstance(resp.data, dict) else resp.data
    assert len(results) == 1
    assert results[0]["class_type"] == yoga.id
