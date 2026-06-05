"""
Staff -> User provisioning under the membership model: one global login per
person, a membership per gym, invite + set-password for new accounts.
"""

import time

import pytest
from rest_framework.test import APIClient

from apps.imports.parsers import import_staff
from apps.staff.services import provision_user
from apps.users.invites import make_invite_token
from apps.users.models import User
from tests.factories import UserFactory

pytestmark = pytest.mark.django_db


def _email():
    return f"staff.{time.time_ns()}@testgym.com"


# --------------------------------------------------------------------------- #
# Provisioning
# --------------------------------------------------------------------------- #


def test_provision_creates_user_and_membership(tenant, mailoutbox):
    email = _email()

    user, created = provision_user(
        email=email, name="Sarah Mitchell", tenant=tenant, role="instructor", send_invite=True
    )

    assert created is True
    assert not user.has_usable_password()  # login blocked until invite accepted
    assert user.first_name == "Sarah" and user.last_name == "Mitchell"
    assert user.membership_for(tenant).role == "instructor"
    assert len(mailoutbox) == 1  # invite sent for the new account


def test_provision_reuses_existing_user_in_tenant(tenant):
    email = _email()
    existing = UserFactory(tenant=tenant, email=email, role="gym_manager")

    user, created = provision_user(email=email, name="X", tenant=tenant, role="instructor")

    assert created is False
    assert user.id == existing.id


def test_provision_reuses_global_user_across_gyms(tenant, other_tenant, mailoutbox):
    """Same person works at two gyms: one User, a membership in each."""
    email = _email()

    user_a, created_a = provision_user(
        email=email, name="Jo Multi", tenant=tenant, role="instructor", send_invite=True
    )
    user_b, created_b = provision_user(
        email=email, name="Jo Multi", tenant=other_tenant, role="gym_manager", send_invite=True
    )

    assert created_a is True and created_b is False
    assert user_a.id == user_b.id
    assert User.objects.filter(email=email).count() == 1
    # One membership per gym, role per gym.
    assert user_a.membership_for(tenant).role == "instructor"
    assert user_a.membership_for(other_tenant).role == "gym_manager"
    # Invite only for the first (new) account.
    assert len(mailoutbox) == 1


def test_role_mapping_falls_back_to_instructor(tenant):
    user, _ = provision_user(email=_email(), name="Q", tenant=tenant, role="some-bogus-role")
    assert user.membership_for(tenant).role == "instructor"


# --------------------------------------------------------------------------- #
# CSV import wiring
# --------------------------------------------------------------------------- #


def test_import_staff_provisions_users(tenant, admin_user, mailoutbox):
    token = time.time_ns()
    csv = (
        "name,email,phone,role\n"
        f"Alice Adams,alice.{token}@testgym.com,+64210001,instructor\n"
        f"Bob Boss,bob.{token}@testgym.com,+64210002,admin\n"
    ).encode("utf-8")

    ok, failed, errors = import_staff(csv, tenant, admin_user)

    assert (ok, failed, errors) == (2, 0, [])
    for prefix, role in [("alice", "instructor"), ("bob", "admin")]:
        user = User.objects.get(email=f"{prefix}.{token}@testgym.com")
        assert user.membership_for(tenant).role == role
        assert user.staff_profiles.get(tenant=tenant)
    assert len(mailoutbox) == 2  # both new -> both invited


# --------------------------------------------------------------------------- #
# Set-password (invite acceptance)
# --------------------------------------------------------------------------- #


def test_set_password_with_valid_token(tenant):
    user, _ = provision_user(email=_email(), name="A B", tenant=tenant, role="instructor")
    uid, tok = make_invite_token(user)

    client = APIClient()
    resp = client.post(
        "/api/v1/public/set-password/",
        {"uid": uid, "token": tok, "password": "Str0ngPass!23"},
    )

    assert resp.status_code == 200
    user.refresh_from_db()
    assert user.has_usable_password()
    assert user.check_password("Str0ngPass!23")


def test_set_password_rejects_bad_token(tenant):
    user, _ = provision_user(email=_email(), name="A B", tenant=tenant, role="instructor")
    uid, _tok = make_invite_token(user)

    client = APIClient()
    resp = client.post(
        "/api/v1/public/set-password/",
        {"uid": uid, "token": "bogus-token", "password": "Str0ngPass!23"},
    )
    assert resp.status_code == 400


def test_set_password_token_single_use(tenant):
    user, _ = provision_user(email=_email(), name="A B", tenant=tenant, role="instructor")
    uid, tok = make_invite_token(user)
    client = APIClient()

    first = client.post(
        "/api/v1/public/set-password/",
        {"uid": uid, "token": tok, "password": "Str0ngPass!23"},
    )
    assert first.status_code == 200

    # Token is bound to the old (unusable) password hash; now spent.
    second = client.post(
        "/api/v1/public/set-password/",
        {"uid": uid, "token": tok, "password": "An0therPass!45"},
    )
    assert second.status_code == 400


def test_validate_invite_endpoint(tenant):
    user, _ = provision_user(email=_email(), name="Val Idate", tenant=tenant, role="instructor")
    uid, tok = make_invite_token(user)

    client = APIClient()
    resp = client.get(f"/api/v1/public/set-password/validate/?uid={uid}&token={tok}")
    assert resp.status_code == 200
    assert resp.data["valid"] is True
    assert resp.data["email"] == user.email
