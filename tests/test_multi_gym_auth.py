"""Global login, gym selection, and per-gym role activation."""

import pytest
from rest_framework.test import APIClient

from tests.factories import MembershipFactory, UserFactory

pytestmark = pytest.mark.django_db

TOKEN_URL = "/api/v1/auth/token/"


@pytest.fixture
def client():
    return APIClient()


def test_single_gym_login_issues_scoped_token(client, tenant):
    UserFactory(tenant=tenant, email="solo@test.com", role="gym_manager", password="pw12345678")

    resp = client.post(TOKEN_URL, {"email": "solo@test.com", "password": "pw12345678"})

    assert resp.status_code == 200
    assert "access" in resp.data and "refresh" in resp.data
    assert resp.data["tenant_id"] == tenant.id
    assert resp.data["role"] == "gym_manager"


def test_bad_credentials_rejected(client, tenant):
    UserFactory(tenant=tenant, email="solo@test.com", password="pw12345678")

    resp = client.post(TOKEN_URL, {"email": "solo@test.com", "password": "wrong"})

    assert resp.status_code == 401


def test_multi_gym_login_requires_selection(client, tenant, other_tenant):
    user = UserFactory(tenant=tenant, email="multi@test.com", role="owner", password="pw12345678")
    MembershipFactory(user=user, tenant=other_tenant, role="instructor")

    resp = client.post(TOKEN_URL, {"email": "multi@test.com", "password": "pw12345678"})

    assert resp.status_code == 200
    assert resp.data["requires_gym_selection"] is True
    gym_ids = {g["tenant_id"] for g in resp.data["gyms"]}
    assert gym_ids == {tenant.id, other_tenant.id}
    assert "access" not in resp.data


def test_multi_gym_login_with_chosen_gym(client, tenant, other_tenant):
    user = UserFactory(tenant=tenant, email="multi@test.com", role="owner", password="pw12345678")
    MembershipFactory(user=user, tenant=other_tenant, role="instructor")

    resp = client.post(
        TOKEN_URL,
        {"email": "multi@test.com", "password": "pw12345678", "tenant_id": other_tenant.id},
    )

    assert resp.status_code == 200
    assert resp.data["tenant_id"] == other_tenant.id
    # Role reflects the chosen gym, not the user's default tenant role.
    assert resp.data["role"] == "instructor"


def test_login_rejects_non_member_gym(client, tenant, other_tenant):
    UserFactory(tenant=tenant, email="multi@test.com", role="owner", password="pw12345678")

    resp = client.post(
        TOKEN_URL,
        {"email": "multi@test.com", "password": "pw12345678", "tenant_id": other_tenant.id},
    )

    assert resp.status_code == 400


def test_role_activated_from_membership_on_request(client, tenant, other_tenant):
    """A token for a gym where the user is gym_manager grants manager access there,
    even though their default User.role is instructor."""
    user = UserFactory(tenant=tenant, email="multi@test.com", role="instructor", password="pw12345678")
    MembershipFactory(user=user, tenant=other_tenant, role="gym_manager")

    login = client.post(
        TOKEN_URL,
        {"email": "multi@test.com", "password": "pw12345678", "tenant_id": other_tenant.id},
    )
    access = login.data["access"]

    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    # /staff/ requires IsGymManager and scopes to the token's tenant.
    resp = client.get("/api/v1/staff/")
    assert resp.status_code == 200
