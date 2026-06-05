"""
Two guards against login lockout:
- createsuperuser yields an account with a membership (can sign in)
- login self-heals a tenant-bound user that somehow has no membership
"""

import pytest
from rest_framework.test import APIClient

from apps.users.models import Membership, User
from tests.factories import TenantFactory, UserFactory

pytestmark = pytest.mark.django_db

TOKEN_URL = "/api/v1/auth/token/"


def test_create_superuser_gets_active_membership():
    tenant = TenantFactory(slug="su-test")

    user = User.objects.create_superuser(
        email="root@su-test.com", password="StrongPass1!", tenant_id=tenant.id
    )

    assert user.is_superuser
    membership = user.membership_for(tenant)
    assert membership is not None, "superuser must get a membership or it can't log in"
    assert membership.role == "owner"
    assert membership.is_active


def test_login_self_heals_user_without_membership(tenant):
    user = UserFactory(tenant=tenant, email="orphan@test.com", role="owner", password="pw12345678")
    # Simulate a user created by a path that didn't make a membership.
    Membership.objects.filter(user=user).delete()
    assert not user.memberships.exists()

    resp = APIClient().post(TOKEN_URL, {"email": "orphan@test.com", "password": "pw12345678"})

    assert resp.status_code == 200
    assert "access" in resp.data
    assert resp.data["tenant_id"] == tenant.id
    assert resp.data["role"] == "owner"
    # The membership now exists for next time.
    assert user.membership_for(tenant) is not None
