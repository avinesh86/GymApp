"""Choosing who to offer a cover request to — the endpoints behind the panel."""

import pytest
from rest_framework.test import APIClient

from apps.cover.models import CoverOffer, CoverRequest
from apps.staff.models import StaffClassTypeCapability
from apps.users.models import Membership
from tests.factories import (
    ClassTypeFactory,
    StaffProfileFactory,
    TenantDomainFactory,
    TenantFactory,
    TimetableEventFactory,
    UserFactory,
)

HOST = "dispatch.localhost"


@pytest.fixture
def gym(db):
    tenant = TenantFactory(slug="dispatch-gym")
    TenantDomainFactory(tenant=tenant, domain=HOST)
    return tenant


def _client(user, tenant):
    Membership.objects.get_or_create(
        user=user, tenant=tenant, defaults={"role": user.role, "is_active": True}
    )
    client = APIClient()
    client.force_authenticate(user=user)
    client.defaults["HTTP_HOST"] = HOST
    return client


@pytest.fixture
def manager_api(gym):
    return _client(UserFactory(tenant=gym, role="gym_manager"), gym)


@pytest.fixture
def class_type(gym):
    return ClassTypeFactory(tenant=gym, name="Aqua Fit")


def qualified_instructor(gym, class_type, name, tier=1):
    """An instructor who can actually be offered this class."""
    staff = StaffProfileFactory(
        tenant=gym, role="instructor", name=name, status="active", priority_tier=tier
    )
    StaffClassTypeCapability.objects.create(
        tenant=gym, staff=staff, class_type=class_type, is_active=True
    )
    return staff


@pytest.fixture
def cover_request(gym, class_type):
    event = TimetableEventFactory(tenant=gym, class_type=class_type)
    return CoverRequest.objects.create(
        tenant=gym, timetable_event=event, status=CoverRequest.Status.OPEN
    )


def test_candidates_are_grouped_by_tier(manager_api, gym, class_type, cover_request):
    first = qualified_instructor(gym, class_type, "First Choice", tier=1)
    second = qualified_instructor(gym, class_type, "Second Choice", tier=2)

    response = manager_api.get(f"/api/v1/cover/requests/{cover_request.pk}/candidates/")

    assert response.status_code == 200, response.data
    assert {c["staff_id"] for c in response.data["1"]} == {first.pk}
    assert {c["staff_id"] for c in response.data["2"]} == {second.pk}
    assert response.data["1"][0]["already_offered"] is False


def test_an_unqualified_instructor_is_not_a_candidate(manager_api, gym, class_type, cover_request):
    """Eligibility needs a capability for this class type — the panel must not
    offer someone who cannot teach it."""
    qualified_instructor(gym, class_type, "Can Teach It")
    StaffProfileFactory(tenant=gym, role="instructor", name="Cannot Teach It")

    response = manager_api.get(f"/api/v1/cover/requests/{cover_request.pk}/candidates/")

    names = {c["name"] for group in response.data.values() for c in group}
    assert names == {"Can Teach It"}


def test_dispatching_to_chosen_staff_creates_offers(manager_api, gym, class_type, cover_request):
    chosen = qualified_instructor(gym, class_type, "Chosen One")
    not_chosen = qualified_instructor(gym, class_type, "Not This Time")

    response = manager_api.post(
        f"/api/v1/cover/requests/{cover_request.pk}/send-offers/",
        {"staff_ids": [chosen.pk]},
        format="json",
    )

    assert response.status_code == 200, response.data
    assert response.data["offers_sent"] == 1
    offered = set(
        CoverOffer.objects.filter(cover_request=cover_request).values_list("staff_id", flat=True)
    )
    assert offered == {chosen.pk}
    assert not_chosen.pk not in offered


def test_someone_already_offered_is_flagged_and_not_duplicated(
    manager_api, gym, class_type, cover_request
):
    """The panel disables them; the backend must not create a second offer
    even if the request is replayed."""
    staff = qualified_instructor(gym, class_type, "Already Asked")
    url = f"/api/v1/cover/requests/{cover_request.pk}/send-offers/"
    manager_api.post(url, {"staff_ids": [staff.pk]}, format="json")

    candidates = manager_api.get(f"/api/v1/cover/requests/{cover_request.pk}/candidates/")
    flagged = [
        c for group in candidates.data.values() for c in group if c["staff_id"] == staff.pk
    ]
    assert flagged and flagged[0]["already_offered"] is True

    manager_api.post(url, {"staff_ids": [staff.pk]}, format="json")
    assert CoverOffer.objects.filter(cover_request=cover_request, staff=staff).count() == 1


def test_an_instructor_cannot_open_the_candidate_list(gym, class_type, cover_request):
    """It names every colleague eligible for the shift."""
    api = _client(UserFactory(tenant=gym, role="instructor"), gym)

    assert api.get(
        f"/api/v1/cover/requests/{cover_request.pk}/candidates/"
    ).status_code == 403
