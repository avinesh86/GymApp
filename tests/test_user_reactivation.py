"""Deactivated users must stay visible so an admin can reactivate them."""

import pytest
from rest_framework.test import APIClient

from apps.users.models import Membership
from tests.factories import TenantDomainFactory, TenantFactory, UserFactory


@pytest.fixture
def gym(db):
    tenant = TenantFactory(slug="reactivation-gym")
    TenantDomainFactory(tenant=tenant, domain="reactivation.localhost")
    return tenant


@pytest.fixture
def admin(gym):
    user = UserFactory(tenant=gym, role="admin")
    Membership.objects.get_or_create(
        user=user, tenant=gym, defaults={"role": "admin", "is_active": True}
    )
    return user


@pytest.fixture
def api(admin):
    client = APIClient()
    client.force_authenticate(user=admin)
    client.defaults["HTTP_HOST"] = "reactivation.localhost"
    return client


@pytest.fixture
def staff_member(gym):
    user = UserFactory(tenant=gym, role="instructor", email="instructor@example.com")
    Membership.objects.get_or_create(
        user=user, tenant=gym, defaults={"role": "instructor", "is_active": True}
    )
    return user


def _listed_ids(api):
    response = api.get("/api/v1/users/")
    assert response.status_code == 200, response.data
    rows = response.data["results"] if "results" in response.data else response.data
    return {row["id"] for row in rows}


def test_a_deactivated_user_is_still_listed(api, staff_member):
    """Filtering them out left no way to reactivate anyone from the UI."""
    assert api.patch(
        f"/api/v1/users/{staff_member.pk}/", {"is_active": False}, format="json"
    ).status_code == 200

    staff_member.refresh_from_db()
    assert staff_member.is_active is False
    assert staff_member.pk in _listed_ids(api)


def test_a_deactivated_user_can_be_reactivated(api, staff_member):
    api.patch(f"/api/v1/users/{staff_member.pk}/", {"is_active": False}, format="json")

    response = api.patch(
        f"/api/v1/users/{staff_member.pk}/", {"is_active": True}, format="json"
    )

    assert response.status_code == 200
    staff_member.refresh_from_db()
    assert staff_member.is_active is True


def test_removing_a_user_from_the_gym_drops_them_from_the_list(api, staff_member):
    """DELETE is per-gym removal — distinct from deactivating the login."""
    assert api.delete(f"/api/v1/users/{staff_member.pk}/").status_code == 204

    assert staff_member.pk not in _listed_ids(api)
    assert not Membership.objects.filter(
        user=staff_member, tenant=staff_member.tenant, is_active=True
    ).exists()
