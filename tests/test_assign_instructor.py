"""
Instructor assignment + unassignment on timetable events, and the staff
list role filter that feeds the Assign Instructor dropdown.
"""

import pytest

from apps.staff.views import StaffProfileViewSet
from apps.timetable.models import TimetableEvent
from apps.timetable.services import assign_instructor
from rest_framework.test import APIRequestFactory, force_authenticate
from tests.factories import StaffProfileFactory

pytestmark = pytest.mark.django_db


def test_assign_instructor_marks_scheduled(tenant, admin_user, future_event, instructor_b):
    future_event.instructor = None
    future_event.status = TimetableEvent.Status.UNFILLED
    future_event.save(update_fields=["instructor", "status"])

    updated = assign_instructor(future_event, instructor_b, admin_user)

    assert updated.instructor == instructor_b
    assert updated.status == TimetableEvent.Status.SCHEDULED


def test_unassign_instructor_marks_unfilled(tenant, admin_user, future_event):
    assert future_event.instructor is not None
    assert future_event.status == TimetableEvent.Status.SCHEDULED

    updated = assign_instructor(future_event, None, admin_user)

    updated.refresh_from_db()
    assert updated.instructor is None
    assert updated.status == TimetableEvent.Status.UNFILLED


def _list_staff(tenant, user, params):
    rf = APIRequestFactory()
    request = rf.get("/api/v1/staff/", params)
    request.tenant = tenant
    force_authenticate(request, user=user)
    response = StaffProfileViewSet.as_view({"get": "list"})(request)
    response.render()
    return response


def test_staff_list_filters_by_role(tenant, admin_user):
    StaffProfileFactory(tenant=tenant, name="Ada Teacher", role="instructor", status="active")
    StaffProfileFactory(tenant=tenant, name="Boss Person", role="admin", status="active")

    response = _list_staff(tenant, admin_user, {"status": "active", "role": "instructor"})

    assert response.status_code == 200
    roles = {row["role"] for row in response.data["results"]}
    assert roles == {"instructor"}
    names = {row["name"] for row in response.data["results"]}
    assert "Ada Teacher" in names
    assert "Boss Person" not in names
