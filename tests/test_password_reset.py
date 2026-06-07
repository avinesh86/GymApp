"""
Password management:
- public forgot-password (emails a link, no user enumeration)
- owner/admin sends a reset link to a user in their gym (tenant-scoped, audited)
- self-service change password
"""

import pytest
from rest_framework.test import APIClient, APIRequestFactory, force_authenticate

from apps.users.views import UserViewSet
from tests.factories import UserFactory

pytestmark = pytest.mark.django_db

RESET_URL = "/api/v1/public/password-reset/"


# --------------------------------------------------------------------------- #
# Public forgot-password
# --------------------------------------------------------------------------- #


def test_forgot_password_emails_link_for_existing_user(tenant, mailoutbox):
    UserFactory(tenant=tenant, email="member@test.com", is_active=True)

    resp = APIClient().post(RESET_URL, {"email": "member@test.com"}, format="json")

    assert resp.status_code == 200
    assert len(mailoutbox) == 1
    assert "/set-password?" in mailoutbox[0].body


def test_forgot_password_no_enumeration_for_unknown_email(mailoutbox, db):
    resp = APIClient().post(RESET_URL, {"email": "nobody@test.com"}, format="json")

    assert resp.status_code == 200  # same response as a real account
    assert len(mailoutbox) == 0


def test_forgot_password_skips_inactive_user(tenant, mailoutbox):
    UserFactory(tenant=tenant, email="gone@test.com", is_active=False)

    resp = APIClient().post(RESET_URL, {"email": "gone@test.com"}, format="json")

    assert resp.status_code == 200
    assert len(mailoutbox) == 0


# --------------------------------------------------------------------------- #
# Admin sends a reset link
# --------------------------------------------------------------------------- #


def _send_reset(actor, tenant, target_id):
    request = APIRequestFactory().post(f"/api/v1/users/{target_id}/send-password-reset/")
    request.tenant = tenant
    force_authenticate(request, user=actor)
    return UserViewSet.as_view({"post": "send_password_reset"})(request, pk=target_id)


def test_admin_sends_reset_link_to_member(tenant, admin_user, mailoutbox):
    target = UserFactory(tenant=tenant, email="staff@test.com", role="instructor")

    resp = _send_reset(admin_user, tenant, target.id)

    assert resp.status_code == 200
    assert len(mailoutbox) == 1
    assert mailoutbox[0].to == ["staff@test.com"]


def test_non_admin_cannot_send_reset(tenant, instructor_user, mailoutbox):
    target = UserFactory(tenant=tenant, email="staff@test.com", role="instructor")

    resp = _send_reset(instructor_user, tenant, target.id)

    assert resp.status_code == 403
    assert len(mailoutbox) == 0


def test_admin_cannot_reset_user_from_another_gym(tenant, other_tenant, admin_user, mailoutbox):
    outsider = UserFactory(tenant=other_tenant, email="outsider@test.com")

    resp = _send_reset(admin_user, tenant, outsider.id)

    assert resp.status_code == 404  # not in the admin's gym
    assert len(mailoutbox) == 0


# --------------------------------------------------------------------------- #
# Self-service change password
# --------------------------------------------------------------------------- #


def test_user_changes_own_password(tenant):
    user = UserFactory(tenant=tenant, email="me@test.com", password="oldpass123!")
    client = APIClient()
    client.force_authenticate(user=user)

    resp = client.post(
        "/api/v1/users/change-password/",
        {"old_password": "oldpass123!", "new_password": "Newpass456!"},
        format="json",
    )

    assert resp.status_code == 200
    user.refresh_from_db()
    assert user.check_password("Newpass456!")


def test_change_password_rejects_wrong_old_password(tenant):
    user = UserFactory(tenant=tenant, email="me@test.com", password="oldpass123!")
    client = APIClient()
    client.force_authenticate(user=user)

    resp = client.post(
        "/api/v1/users/change-password/",
        {"old_password": "WRONG", "new_password": "Newpass456!"},
        format="json",
    )

    assert resp.status_code == 400
    user.refresh_from_db()
    assert user.check_password("oldpass123!")  # unchanged
