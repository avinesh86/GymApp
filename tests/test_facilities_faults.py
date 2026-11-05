"""
Facilities, part 1: equipment inventory, maintenance (fault) tracking and the
staff fault board.

- Only owner, admin, gym manager, team leader and payroll open Facilities.
- Every staff member (instructors and PTs too) can report a fault and see
  what's already reported, so the same fault isn't logged twice.
- Each part can be switched off in Settings; fault reporting goes with
  maintenance tracking.
- New faults alert the gym's chosen roles in the app, by email only when
  turned on, and never by WhatsApp.
"""

from unittest import mock

import pytest
from django.core import mail
from rest_framework.test import APIClient

from apps.facilities.models import Equipment, FaultReport
from apps.notifications.models import Notification
from apps.tenants.models import TenantSettings
from tests.factories import SiteFactory, UserFactory

pytestmark = pytest.mark.django_db(transaction=True)


def _client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    client.defaults["HTTP_HOST"] = "test.localhost"
    return client


def _settings(tenant, **fields):
    s, _ = TenantSettings.objects.get_or_create(tenant=tenant)
    for k, v in fields.items():
        setattr(s, k, v)
    s.save()
    return s


@pytest.fixture
def treadmill(tenant):
    return Equipment.objects.create(tenant=tenant, name="Treadmill 3", location="Cardio floor")


# ─── Who can open Facilities ─────────────────────────────────────────────────


@pytest.mark.parametrize("role", ["owner", "admin", "gym_manager", "team_leader", "payroll"])
def test_facilities_roles_can_list_equipment_and_faults(tenant, role):
    user = UserFactory(tenant=tenant, role=role)
    client = _client(user)
    assert client.get("/api/v1/facilities/equipment/").status_code == 200
    assert client.get("/api/v1/facilities/faults/").status_code == 200


@pytest.mark.parametrize("role", ["instructor", "class_count_admin"])
def test_other_roles_cannot_open_facilities(tenant, role):
    client = _client(UserFactory(tenant=tenant, role=role))
    assert client.get("/api/v1/facilities/equipment/").status_code == 403
    assert client.get("/api/v1/facilities/faults/").status_code == 403
    assert client.get("/api/v1/facilities/summary/").status_code == 403


def test_equipment_is_scoped_to_the_gym(tenant, other_tenant, admin_user, treadmill):
    Equipment.objects.create(tenant=other_tenant, name="Someone else's rower")
    names = [e["name"] for e in _client(admin_user).get("/api/v1/facilities/equipment/").data["results"]]
    assert names == ["Treadmill 3"]


def test_cannot_attach_another_gyms_site(tenant, other_tenant, admin_user):
    foreign_site = SiteFactory(tenant=other_tenant)
    response = _client(admin_user).post(
        "/api/v1/facilities/equipment/", {"name": "Bike", "site": foreign_site.id}, format="json"
    )
    assert response.status_code == 400


def test_site_filter_includes_gym_wide_items(tenant, admin_user):
    north, south = SiteFactory(tenant=tenant, name="North"), SiteFactory(tenant=tenant, name="South")
    Equipment.objects.create(tenant=tenant, name="North bike", site=north)
    Equipment.objects.create(tenant=tenant, name="South bike", site=south)
    Equipment.objects.create(tenant=tenant, name="Shared sled")
    data = _client(admin_user).get(f"/api/v1/facilities/equipment/?site={north.id}").data["results"]
    assert sorted(e["name"] for e in data) == ["North bike", "Shared sled"]


# ─── Instructors report faults and see their status ──────────────────────────


def test_instructor_reports_a_fault_and_sees_it_on_the_board(tenant, instructor_user, treadmill):
    client = _client(instructor_user)
    response = client.post(
        "/api/v1/facilities/fault-board/",
        {"equipment": treadmill.id, "title": "Belt slipping", "severity": "medium"},
        format="json",
    )
    assert response.status_code == 201, response.data
    board = client.get("/api/v1/facilities/fault-board/").data
    assert [f["title"] for f in board] == ["Belt slipping"]
    assert board[0]["equipment_name"] == "Treadmill 3"
    # Tagged with whoever was signed in when it was logged.
    assert board[0]["reported_by_name"] == instructor_user.full_name
    # Staff never see costs or internal notes.
    for hidden in ("repair_cost", "internal_notes", "assigned_to"):
        assert hidden not in board[0]


def test_reporter_is_the_signed_in_user_not_the_request_body(tenant, instructor_user, owner_user):
    response = _client(instructor_user).post(
        "/api/v1/facilities/fault-board/",
        {"title": "Leaking shower", "location": "Changing room", "reported_by": owner_user.id},
        format="json",
    )
    assert response.status_code == 201
    assert FaultReport.objects.get(pk=response.data["id"]).reported_by == instructor_user


def test_fault_without_equipment_needs_a_location(tenant, instructor_user):
    response = _client(instructor_user).post(
        "/api/v1/facilities/fault-board/", {"title": "Leaking shower"}, format="json"
    )
    assert response.status_code == 400
    assert "location" in response.data["detail"]


def test_there_is_no_me_too_endpoint(tenant, instructor_user):
    fault = FaultReport.objects.create(tenant=tenant, title="Belt slipping", location="Gym")
    response = _client(instructor_user).post(f"/api/v1/facilities/fault-board/{fault.id}/me-too/")
    assert response.status_code in (404, 405)


def test_board_shows_open_and_recently_fixed_only(tenant, instructor_user):
    from datetime import timedelta

    from django.utils import timezone

    FaultReport.objects.create(tenant=tenant, title="Open", location="Gym")
    FaultReport.objects.create(
        tenant=tenant, title="Fixed yesterday", location="Gym", status="resolved",
        resolved_at=timezone.now() - timedelta(days=1),
    )
    FaultReport.objects.create(
        tenant=tenant, title="Fixed long ago", location="Gym", status="resolved",
        resolved_at=timezone.now() - timedelta(days=60),
    )
    titles = {f["title"] for f in _client(instructor_user).get("/api/v1/facilities/fault-board/").data}
    assert titles == {"Open", "Fixed yesterday"}


# ─── Equipment status follows its faults ─────────────────────────────────────


def test_out_of_use_fault_takes_machine_out_and_fixing_returns_it(tenant, instructor_user, admin_user, treadmill):
    response = _client(instructor_user).post(
        "/api/v1/facilities/fault-board/",
        {"equipment": treadmill.id, "title": "Sparking", "severity": "out_of_use"},
        format="json",
    )
    treadmill.refresh_from_db()
    assert treadmill.status == "out_of_order"

    fault_id = response.data["id"]
    fixed = _client(admin_user).patch(
        f"/api/v1/facilities/faults/{fault_id}/",
        {"status": "resolved", "status_note": "Motor replaced"},
        format="json",
    )
    assert fixed.status_code == 200
    assert fixed.data["resolved_at"] is not None
    assert fixed.data["resolved_by_name"]
    treadmill.refresh_from_db()
    assert treadmill.status == "in_service"


# ─── Settings switches ───────────────────────────────────────────────────────


def test_switches_turn_parts_off(tenant, admin_user, instructor_user):
    _settings(tenant, facilities_equipment_enabled=False)
    assert _client(admin_user).get("/api/v1/facilities/equipment/").status_code == 403

    _settings(tenant, fault_reporting_enabled=False)
    assert _client(instructor_user).get("/api/v1/facilities/fault-board/").status_code == 403
    assert _client(admin_user).get("/api/v1/facilities/faults/").status_code == 200


def test_maintenance_off_also_turns_off_fault_reporting(tenant, admin_user, instructor_user):
    _settings(tenant, facilities_maintenance_enabled=False, fault_reporting_enabled=True)
    assert _client(admin_user).get("/api/v1/facilities/faults/").status_code == 403
    assert _client(instructor_user).get("/api/v1/facilities/fault-board/").status_code == 403
    config = _client(instructor_user).get("/api/v1/facilities/config/").data
    assert config["fault_reporting_enabled"] is False
    assert config["can_manage"] is False


def test_alert_roles_only_accept_facilities_roles(tenant, owner_user):
    client = _client(owner_user)
    bad = client.patch("/api/v1/tenants/settings/", {"facilities_alert_roles": ["instructor"]}, format="json")
    assert bad.status_code == 400
    ok = client.patch(
        "/api/v1/tenants/settings/", {"facilities_alert_roles": ["owner", "team_leader"]}, format="json"
    )
    assert ok.status_code == 200
    assert ok.data["facilities_alert_roles"] == ["owner", "team_leader"]


# ─── Alerts: chosen roles, app always, email if on, never WhatsApp ───────────


def _report(user, **extra):
    return _client(user).post(
        "/api/v1/facilities/fault-board/",
        {"title": "Leaking shower", "location": "Women's changing", **extra},
        format="json",
    )


def test_new_fault_alerts_the_default_key_people_in_app_only(
    tenant, owner_user, admin_user, manager_user, team_leader_user, payroll_user, instructor_user
):
    mail.outbox.clear()
    assert _report(instructor_user).status_code == 201
    recipients = set(
        Notification.objects.filter(tenant=tenant, notification_type="facilities").values_list(
            "recipient__role", flat=True
        )
    )
    assert recipients == {"owner", "admin", "gym_manager"}
    assert mail.outbox == []  # email is off until the gym turns it on


def test_email_goes_only_when_turned_on(tenant, owner_user, instructor_user):
    _settings(tenant, facilities_alert_email=True, facilities_alert_roles=["owner"])
    mail.outbox.clear()
    _report(instructor_user)
    assert [m.to for m in mail.outbox] == [[owner_user.email]]


def test_facilities_alerts_never_go_to_whatsapp(tenant, owner_user, instructor_user):
    from apps.notifications.tasks import _dispatch_notification

    _report(instructor_user)
    notification = Notification.objects.get(tenant=tenant, notification_type="facilities")
    with mock.patch("apps.notifications.tasks._send_whatsapp_notification") as whatsapp, \
         mock.patch("apps.notifications.tasks._send_email_notification") as email:
        _dispatch_notification(notification)
    whatsapp.assert_not_called()
    email.assert_not_called()


def test_summary_counts_open_faults(tenant, admin_user, treadmill):
    FaultReport.objects.create(tenant=tenant, title="A", equipment=treadmill, severity="out_of_use")
    FaultReport.objects.create(tenant=tenant, title="B", location="Studio")
    FaultReport.objects.create(tenant=tenant, title="C", location="Studio", status="resolved")
    data = _client(admin_user).get("/api/v1/facilities/summary/").data
    assert data["open_faults"] == 2
    assert data["out_of_use"] == 1
