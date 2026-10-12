"""
What a form saves must still be there afterwards.

Bug: the staff popup reported "Staff member updated" while the priority tier
and status went nowhere, and an audit of the other forms found the same shape
elsewhere — a success message over a save that was dropped, refused, or stored
somewhere nothing reads:

- a role change updated the profile (or the user) but not the gym membership
  that permissions are checked against, so the person kept their old access;
- My Profile saved through manager-only endpoints, so an instructor's phone,
  availability and payment details were refused;
- the same self-service endpoint accepted a new role from anyone;
- timetable preferences were not fields on the settings at all.
"""

import pytest
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.staff.models import StaffAvailability, StaffQualification
from apps.staff.views import (
    StaffAvailabilityViewSet,
    StaffProfileViewSet,
    StaffQualificationViewSet,
)
from apps.tenants.models import TenantSettings
from apps.tenants.views import CurrentTenantSettingsView
from apps.users.models import Membership
from apps.users.views import UserViewSet

factory = APIRequestFactory()


def _call(view, method, path, user, tenant, data=None, **kwargs):
    request = getattr(factory, method)(path, data or {}, format="json")
    force_authenticate(request, user=user)
    request.tenant = tenant
    return view(request, **kwargs)


def _patch_staff(staff, user, tenant, data):
    view = StaffProfileViewSet.as_view({"patch": "partial_update"})
    return _call(view, "patch", f"/api/v1/staff/{staff.pk}/", user, tenant, data, pk=staff.pk)


def _action_view(name, actions):
    """An @action view as the router builds it, with the action's own settings
    (its permission_classes above all) rather than the viewset's defaults."""
    return StaffProfileViewSet.as_view(actions, **getattr(StaffProfileViewSet, name).kwargs)


def _patch_me(user, tenant, data):
    view = _action_view("me", {"get": "me", "patch": "me"})
    return _call(view, "patch", "/api/v1/staff/me/", user, tenant, data)


def _payment_details(method, staff, user, tenant, data=None):
    view = _action_view("payment_details", {"get": "payment_details", "put": "payment_details"})
    path = f"/api/v1/staff/{staff.pk}/payment-details/"
    return _call(view, method, path, user, tenant, data, pk=staff.pk)


def _add_availability(staff, user, tenant):
    view = StaffAvailabilityViewSet.as_view({"post": "create"})
    data = {"day_of_week": 0, "start_time": "17:00:00", "end_time": "23:59:00"}
    path = f"/api/v1/staff/{staff.pk}/availability/"
    return _call(view, "post", path, user, tenant, data, staff_pk=staff.pk)


# ─── The staff popup ──────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestStaffPopupSave:
    def test_priority_tier_and_status_are_stored(self, tenant, manager_user, instructor):
        resp = _patch_staff(
            instructor, manager_user, tenant, {"priority_tier": 3, "status": "inactive"}
        )

        assert resp.status_code == 200
        instructor.refresh_from_db()
        assert instructor.priority_tier == 3
        assert instructor.status == "inactive"
        # ...and are in the response the popup reloads from.
        assert resp.data["priority_tier"] == 3
        assert resp.data["status"] == "inactive"

    def test_role_change_reaches_the_gym_membership(self, tenant, admin_user, instructor):
        resp = _patch_staff(instructor, admin_user, tenant, {"role": "team_leader"})

        assert resp.status_code == 200
        membership = Membership.objects.get(user=instructor.user, tenant=tenant)
        assert membership.role == "team_leader"
        instructor.user.refresh_from_db()
        assert instructor.user.role == "team_leader"

    def test_a_manager_can_make_someone_an_admin(self, tenant, manager_user, instructor):
        resp = _patch_staff(instructor, manager_user, tenant, {"role": "admin"})

        assert resp.status_code == 200
        instructor.refresh_from_db()
        assert instructor.role == "admin"
        assert Membership.objects.get(user=instructor.user, tenant=tenant).role == "admin"

    def test_a_manager_can_save_the_form_with_the_role_untouched(
        self, tenant, manager_user, instructor
    ):
        resp = _patch_staff(
            instructor, manager_user, tenant, {"role": "instructor", "priority_tier": 2}
        )

        assert resp.status_code == 200
        instructor.refresh_from_db()
        assert instructor.priority_tier == 2

    def test_an_admin_cannot_grant_ownership(self, tenant, admin_user, instructor):
        resp = _patch_staff(instructor, admin_user, tenant, {"role": "owner"})

        assert resp.status_code == 403

    def test_qualification_dates_are_stored(self, tenant, manager_user, instructor):
        view = StaffQualificationViewSet.as_view({"post": "create"})
        data = {"name": "First Aid", "issued_at": "2026-01-15", "expires_at": "2028-01-15"}
        path = f"/api/v1/staff/{instructor.pk}/qualifications/"
        resp = _call(view, "post", path, manager_user, tenant, data, staff_pk=instructor.pk)

        assert resp.status_code == 201
        qualification = StaffQualification.objects.get(staff=instructor)
        assert qualification.issued_at.isoformat() == "2026-01-15"
        assert qualification.expires_at.isoformat() == "2028-01-15"


# ─── My Profile (an instructor editing their own record) ──────────────────────


@pytest.mark.django_db
class TestMyProfileSave:
    def test_phone_is_stored(self, tenant, instructor):
        resp = _patch_me(instructor.user, tenant, {"phone": "+64 21 555 0100"})

        assert resp.status_code == 200
        instructor.refresh_from_db()
        assert instructor.phone == "+64 21 555 0100"

    def test_cannot_promote_yourself(self, tenant, instructor):
        resp = _patch_me(
            instructor.user, tenant, {"role": "admin", "status": "suspended", "priority_tier": 3}
        )

        assert resp.status_code == 200  # unknown-to-this-form fields are ignored
        instructor.refresh_from_db()
        assert instructor.role == "instructor"
        assert instructor.status == "active"
        assert instructor.priority_tier == 1

    def test_own_availability_is_stored(self, tenant, instructor):
        resp = _add_availability(instructor, instructor.user, tenant)

        assert resp.status_code == 201
        assert StaffAvailability.objects.filter(staff=instructor, is_deleted=False).count() == 1

    def test_cannot_set_someone_elses_availability(self, tenant, instructor, instructor_b):
        resp = _add_availability(instructor_b, instructor.user, tenant)

        assert resp.status_code == 403
        assert not StaffAvailability.objects.filter(staff=instructor_b).exists()

    def test_own_payment_details_are_stored(self, tenant, instructor):
        resp = _payment_details(
            "put", instructor, instructor.user, tenant, {"bank_name": "Kiwibank"}
        )

        assert resp.status_code == 200
        assert instructor.payment_details.bank_name == "Kiwibank"

    def test_cannot_read_someone_elses_payment_details(self, tenant, instructor, instructor_b):
        resp = _payment_details("get", instructor_b, instructor.user, tenant)

        assert resp.status_code == 403


# ─── Settings ─────────────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestSettingsSave:
    def test_access_tab_role_change_reaches_membership_and_roster(
        self, tenant, admin_user, instructor
    ):
        view = UserViewSet.as_view({"patch": "partial_update"})
        user = instructor.user
        resp = _call(
            view, "patch", f"/api/v1/users/{user.pk}/", admin_user, tenant,
            {"role": "team_leader"}, pk=user.pk,
        )

        assert resp.status_code == 200
        assert Membership.objects.get(user=user, tenant=tenant).role == "team_leader"
        instructor.refresh_from_db()
        assert instructor.role == "team_leader"

    def test_timetable_preferences_are_stored(self, tenant, admin_user):
        view = CurrentTenantSettingsView.as_view()
        resp = _call(
            view, "patch", "/api/v1/tenants/settings/", admin_user, tenant,
            {"week_start_day": 0, "default_timetable_view": "list"},
        )

        assert resp.status_code == 200
        assert resp.data["week_start_day"] == 0
        assert resp.data["default_timetable_view"] == "list"
        settings_row = TenantSettings.objects.get(tenant=tenant)
        assert settings_row.week_start_day == 0
        assert settings_row.default_timetable_view == "list"
