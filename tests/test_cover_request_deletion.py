"""Clearing resolved cover requests off the board."""

import pytest
from rest_framework.test import APIClient

from apps.cover.models import CoverRequest
from apps.users.models import Membership
from tests.factories import (
    StaffProfileFactory,
    TenantDomainFactory,
    TenantFactory,
    TimetableEventFactory,
    UserFactory,
)


@pytest.fixture
def gym(db):
    tenant = TenantFactory(slug="deletion-gym")
    TenantDomainFactory(tenant=tenant, domain="deletion.localhost")
    return tenant


def _client(user, tenant):
    Membership.objects.get_or_create(
        user=user, tenant=tenant, defaults={"role": user.role, "is_active": True}
    )
    client = APIClient()
    client.force_authenticate(user=user)
    client.defaults["HTTP_HOST"] = "deletion.localhost"
    return client


@pytest.fixture
def manager_api(gym):
    return _client(UserFactory(tenant=gym, role="gym_manager"), gym)


def make_request(gym, status):
    return CoverRequest.objects.create(
        tenant=gym, timetable_event=TimetableEventFactory(tenant=gym), status=status
    )


@pytest.mark.parametrize("status", ["cancelled", "accepted", "expired"])
def test_a_manager_can_remove_a_resolved_request(manager_api, gym, status):
    cover_request = make_request(gym, status)

    assert manager_api.delete(f"/api/v1/cover/requests/{cover_request.pk}/").status_code == 204

    cover_request.refresh_from_db()
    assert cover_request.is_deleted is True, "soft delete keeps the history"
    listed = manager_api.get("/api/v1/cover/requests/").data
    rows = listed["results"] if "results" in listed else listed
    assert cover_request.pk not in {r["id"] for r in rows}


@pytest.mark.parametrize("status", ["open", "offered", "critical", "pending_approval"])
def test_a_live_request_cannot_be_removed(manager_api, gym, status):
    """Deleting a live request would strand the class with no cover and no
    record that anyone was looking for one."""
    cover_request = make_request(gym, status)

    response = manager_api.delete(f"/api/v1/cover/requests/{cover_request.pk}/")

    assert response.status_code == 400
    assert "Cancel it first" in response.data["detail"]
    cover_request.refresh_from_db()
    assert cover_request.is_deleted is False


def test_an_instructor_cannot_remove_a_request(gym):
    """Raising a request is open to instructors; clearing one is not."""
    api = _client(UserFactory(tenant=gym, role="instructor"), gym)
    cover_request = make_request(gym, "cancelled")

    assert api.delete(f"/api/v1/cover/requests/{cover_request.pk}/").status_code == 403

    cover_request.refresh_from_db()
    assert cover_request.is_deleted is False


def test_an_instructor_can_still_raise_one_for_their_own_class(gym):
    """The narrower destroy permission must not restrict the other actions."""
    user = UserFactory(tenant=gym, role="instructor")
    api = _client(user, gym)
    staff = StaffProfileFactory(tenant=gym, user=user, role="instructor")
    event = TimetableEventFactory(tenant=gym, instructor=staff)

    response = api.post(
        "/api/v1/cover/requests/",
        {"timetable_event": event.pk, "urgency": "high"},
        format="json",
    )

    assert response.status_code == 201, response.data
