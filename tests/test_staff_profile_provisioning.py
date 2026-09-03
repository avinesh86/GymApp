"""Adding an instructor from Settings -> Access must also make them staff."""

import pytest
from rest_framework.test import APIClient

from apps.staff.models import StaffProfile
from apps.staff.services import provision_staff_for_user
from apps.users.models import Membership
from tests.factories import TenantDomainFactory, TenantFactory, UserFactory


@pytest.fixture
def gym(db):
    tenant = TenantFactory(slug="provisioning-gym")
    TenantDomainFactory(tenant=tenant, domain="provisioning.localhost")
    return tenant


@pytest.fixture
def api(gym):
    admin = UserFactory(tenant=gym, role="admin")
    Membership.objects.get_or_create(
        user=admin, tenant=gym, defaults={"role": "admin", "is_active": True}
    )
    client = APIClient()
    client.force_authenticate(user=admin)
    client.defaults["HTTP_HOST"] = "provisioning.localhost"
    return client


@pytest.mark.parametrize("role", ["instructor", "team_leader"])
def test_creating_an_instructor_user_also_creates_their_staff_profile(api, gym, role):
    """A login alone left them off the roster and unable to receive cover."""
    response = api.post(
        "/api/v1/users/",
        {
            "email": f"{role}@example.com",
            "first_name": "Casey",
            "last_name": "Jordan",
            "role": role,
        },
        format="json",
    )
    assert response.status_code == 201, response.data

    profile = StaffProfile.objects.get(tenant=gym, email=f"{role}@example.com")
    assert profile.name == "Casey Jordan"
    assert profile.role == role
    assert profile.status == StaffProfile.Status.ACTIVE
    assert profile.user.email == f"{role}@example.com"


@pytest.mark.parametrize("role", ["admin", "owner", "payroll", "gym_manager"])
def test_non_instructor_roles_get_no_staff_profile(api, gym, role):
    """An owner or payroll user is not someone you put on the timetable."""
    api.post(
        "/api/v1/users/",
        {"email": f"{role}@example.com", "first_name": "Sam", "role": role},
        format="json",
    )

    assert not StaffProfile.objects.filter(tenant=gym, email=f"{role}@example.com").exists()


def test_provisioning_is_idempotent(gym):
    user = UserFactory(tenant=gym, role="instructor")

    first, created_first = provision_staff_for_user(user, gym)
    second, created_second = provision_staff_for_user(user, gym)

    assert created_first is True
    assert created_second is False
    assert first.pk == second.pk
    assert StaffProfile.objects.filter(tenant=gym, user=user).count() == 1


def test_falls_back_to_the_email_when_the_user_has_no_name(gym):
    user = UserFactory(tenant=gym, role="instructor", first_name="", last_name="", email="noname@example.com")

    profile, _ = provision_staff_for_user(user, gym)

    assert profile.name == "noname@example.com"


def test_the_new_profile_is_a_cover_candidate(gym):
    """The point of the fix: they must be visible to the cover system."""
    from apps.cover.services import _all_active_staff

    user = UserFactory(tenant=gym, role="instructor", email="candidate@example.com")
    provision_staff_for_user(user, gym)

    assert "candidate@example.com" in {s.email for s in _all_active_staff(gym)}
