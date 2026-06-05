"""
Admin user-management + staff creation under the membership model:
- /users/ lists by membership in the active gym, not User.tenant
- removing a user is per-gym (deactivate membership; disable login only if last gym)
- StaffProfile.user is provisioned server-side, never taken from the client
"""

import pytest
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.staff.models import StaffProfile
from apps.staff.views import StaffProfileViewSet
from apps.users.models import Membership, User
from apps.users.views import UserViewSet
from tests.factories import MembershipFactory, UserFactory

pytestmark = pytest.mark.django_db


def _req(method, path, user, tenant, data=None):
    rf = APIRequestFactory()
    request = getattr(rf, method)(path, data, format="json") if data else getattr(rf, method)(path)
    request.tenant = tenant
    force_authenticate(request, user=user)
    return request


# --- #1: Users list scoped by membership ----------------------------------- #


def test_users_list_includes_members_from_other_default_tenant(tenant, other_tenant, admin_user):
    # Member of `tenant` whose default User.tenant is another gym.
    cross = UserFactory(tenant=other_tenant, email="cross@test.com")
    MembershipFactory(user=cross, tenant=tenant, role="instructor")
    # Member of only the other gym — must NOT appear.
    outsider = UserFactory(tenant=other_tenant, email="outsider@test.com")

    request = _req("get", "/api/v1/users/", admin_user, tenant)
    resp = UserViewSet.as_view({"get": "list"})(request)
    resp.render()

    emails = {row["email"] for row in resp.data["results"]}
    assert "cross@test.com" in emails
    assert "outsider@test.com" not in emails


# --- #4: per-gym removal ---------------------------------------------------- #


def test_destroy_only_removes_membership_for_multi_gym_user(tenant, other_tenant, admin_user):
    user = UserFactory(tenant=tenant, email="multi@test.com")
    MembershipFactory(user=user, tenant=other_tenant, role="instructor")

    request = _req("delete", f"/api/v1/users/{user.id}/", admin_user, tenant)
    UserViewSet.as_view({"delete": "destroy"})(request, pk=user.id)

    user.refresh_from_db()
    assert user.is_active is True  # still has the other gym
    assert user.membership_for(tenant) is None
    assert user.membership_for(other_tenant) is not None


def test_destroy_disables_login_when_last_gym(tenant, admin_user):
    user = UserFactory(tenant=tenant, email="solo@test.com")

    request = _req("delete", f"/api/v1/users/{user.id}/", admin_user, tenant)
    UserViewSet.as_view({"delete": "destroy"})(request, pk=user.id)

    user.refresh_from_db()
    assert user.is_active is False
    assert user.membership_for(tenant) is None


# --- #2: StaffProfile.user is provisioned, not client-supplied -------------- #


def test_staff_create_provisions_user_and_ignores_client_user(tenant, admin_user):
    intruder = UserFactory(tenant=tenant, email="intruder@test.com")

    request = _req(
        "post",
        "/api/v1/staff/",
        admin_user,
        tenant,
        data={
            "name": "New Coach",
            "email": "new.coach@test.com",
            "role": "instructor",
            "user": intruder.id,  # must be ignored (read-only)
        },
    )
    resp = StaffProfileViewSet.as_view({"post": "create"})(request)
    resp.render()
    assert resp.status_code == 201

    staff = StaffProfile.objects.get(tenant=tenant, email="new.coach@test.com")
    # Linked to the provisioned user for the new email, NOT the client's user id.
    assert staff.user.email == "new.coach@test.com"
    assert staff.user_id != intruder.id
    assert staff.user.membership_for(tenant).role == "instructor"
