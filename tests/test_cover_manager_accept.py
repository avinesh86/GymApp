"""A manager accepting a cover offer on the board, on an instructor's behalf."""

import pytest
from rest_framework.test import APIClient

from apps.cover.models import CoverOffer, CoverRequest
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
    tenant = TenantFactory(slug="accept-gym")
    TenantDomainFactory(tenant=tenant, domain="accept.localhost")
    return tenant


def _client(user, tenant):
    Membership.objects.get_or_create(
        user=user, tenant=tenant, defaults={"role": user.role, "is_active": True}
    )
    client = APIClient()
    client.force_authenticate(user=user)
    client.defaults["HTTP_HOST"] = "accept.localhost"
    return client


@pytest.fixture
def manager_api(gym):
    return _client(UserFactory(tenant=gym, role="gym_manager"), gym)


@pytest.fixture
def offer(gym):
    event = TimetableEventFactory(tenant=gym)
    cover_request = CoverRequest.objects.create(
        tenant=gym, timetable_event=event, status=CoverRequest.Status.OFFERED
    )
    return CoverOffer.objects.create(
        cover_request=cover_request,
        tenant=gym,
        staff=StaffProfileFactory(tenant=gym, role="instructor"),
        status=CoverOffer.Status.PENDING,
    )


def test_a_manager_can_accept_an_offer(manager_api, offer):
    """The board's Accept button posted to a route that did not exist."""
    response = manager_api.post(
        f"/api/v1/cover/requests/{offer.cover_request_id}/accept/",
        {"offer_id": offer.pk},
        format="json",
    )

    assert response.status_code == 200, response.data
    offer.refresh_from_db()
    assert offer.status == CoverOffer.Status.ACCEPTED
    assert offer.cover_request.status == CoverRequest.Status.ACCEPTED
    offer.cover_request.timetable_event.refresh_from_db()
    assert offer.cover_request.timetable_event.instructor_id == offer.staff_id


def test_offer_id_is_required(manager_api, offer):
    response = manager_api.post(
        f"/api/v1/cover/requests/{offer.cover_request_id}/accept/", {}, format="json"
    )

    assert response.status_code == 400
    assert "offer_id is required" in response.data["detail"]


def test_an_offer_from_another_request_is_rejected(manager_api, gym, offer):
    """Otherwise any offer id could be accepted against any request."""
    other_event = TimetableEventFactory(tenant=gym)
    other_request = CoverRequest.objects.create(
        tenant=gym, timetable_event=other_event, status=CoverRequest.Status.OFFERED
    )

    response = manager_api.post(
        f"/api/v1/cover/requests/{other_request.pk}/accept/",
        {"offer_id": offer.pk},
        format="json",
    )

    assert response.status_code == 404
    offer.refresh_from_db()
    assert offer.status == CoverOffer.Status.PENDING


def test_accepting_an_already_accepted_offer_conflicts(manager_api, offer):
    """Two managers clicking Accept at once must not both succeed."""
    url = f"/api/v1/cover/requests/{offer.cover_request_id}/accept/"
    assert manager_api.post(url, {"offer_id": offer.pk}, format="json").status_code == 200

    second = manager_api.post(url, {"offer_id": offer.pk}, format="json")

    assert second.status_code == 409


def test_an_instructor_cannot_accept_on_someone_elses_behalf(gym, offer):
    api = _client(UserFactory(tenant=gym, role="instructor"), gym)

    response = api.post(
        f"/api/v1/cover/requests/{offer.cover_request_id}/accept/",
        {"offer_id": offer.pk},
        format="json",
    )

    assert response.status_code == 403
    offer.refresh_from_db()
    assert offer.status == CoverOffer.Status.PENDING
