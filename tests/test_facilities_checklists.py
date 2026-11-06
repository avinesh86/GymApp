"""
Facilities, part 2: checklists, check frequencies, and equipment history.

- Owner, admin and gym manager set checklists up; the gym's checklist roles
  (team leader and above by default, changeable in Settings) do them.
  Instructors and PTs never see checklists.
- Checks fall due daily, weekly, monthly, quarterly, yearly or every few days,
  in the gym's own timezone.
- A failed item raises a fault in maintenance (when that is on), tagged with
  the person who did the check, against the machine it was about.
- Overdue checks alert the gym's key people, but only during alert hours
  (9am–5pm by default), once per check, never by WhatsApp.
- A machine's QR code opens its status for anyone, and its full history for
  Facilities roles.
"""

from datetime import date, datetime, time, timedelta
from io import BytesIO
from unittest import mock
from zoneinfo import ZoneInfo

import pytest
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.facilities.checklists import alert_overdue_runs, create_due_runs, is_due_on
from apps.facilities.models import (
    ChecklistAnswer,
    ChecklistItem,
    ChecklistRun,
    ChecklistTemplate,
    Equipment,
    FaultReport,
)
from apps.notifications.models import Notification
from apps.tenants.models import TenantSettings
from tests.factories import UserFactory

pytestmark = pytest.mark.django_db(transaction=True)

NZ = ZoneInfo("Pacific/Auckland")


def _client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    client.defaults["HTTP_HOST"] = "test.localhost"
    return client


def _settings(tenant, **fields):
    s, _ = TenantSettings.objects.get_or_create(tenant=tenant)
    s.timezone = "Pacific/Auckland"
    for k, v in fields.items():
        setattr(s, k, v)
    s.save()
    return s


def _at(local_dt):
    """Pretend it is this gym-local wall-clock time."""
    return mock.patch("django.utils.timezone.now", return_value=local_dt.astimezone(ZoneInfo("UTC")))


def _template(tenant, *, items=("Fire exits clear",), equipment=None, **fields):
    defaults = {
        "name": "Opening check",
        "frequency": "daily",
        "start_date": date(2026, 11, 1),
        "due_time": time(6, 0),
    }
    defaults.update(fields)
    t = ChecklistTemplate.objects.create(tenant=tenant, equipment=equipment, **defaults)
    # Pretend it was made before the start date so catch-up isn't clipped.
    ChecklistTemplate.objects.filter(pk=t.pk).update(created_at=datetime(2026, 10, 1, tzinfo=NZ))
    t.refresh_from_db()
    for i, text in enumerate(items):
        ChecklistItem.objects.create(template=t, order=i, text=text)
    return t


@pytest.fixture(autouse=True)
def nz(tenant):
    _settings(tenant)


@pytest.fixture
def treadmill(tenant):
    return Equipment.objects.create(tenant=tenant, name="Treadmill 3", location="Cardio floor")


# ─── When checks fall due ────────────────────────────────────────────────────


def _t(**fields):
    defaults = {"frequency": "daily", "start_date": date(2026, 1, 31), "weekdays": [], "interval_days": 2}
    defaults.update(fields)
    return ChecklistTemplate(**defaults)


def test_daily_from_the_start_date():
    t = _t()
    assert not is_due_on(t, date(2026, 1, 30))
    assert is_due_on(t, date(2026, 1, 31)) and is_due_on(t, date(2026, 2, 1))


def test_weekly_on_chosen_days():
    t = _t(frequency="weekly", weekdays=[0, 3])  # Monday, Thursday
    due = [d for d in range(2, 9) if is_due_on(t, date(2026, 2, d))]
    assert due == [2, 5]  # Mon 2 Feb, Thu 5 Feb


def test_every_few_days():
    t = _t(frequency="every_n_days", interval_days=3)
    assert [is_due_on(t, date(2026, 1, 31) + timedelta(days=n)) for n in range(7)] == [
        True, False, False, True, False, False, True,
    ]


def test_monthly_on_the_31st_falls_on_the_last_day_of_short_months():
    t = _t(frequency="monthly")
    assert is_due_on(t, date(2026, 2, 28))
    assert not is_due_on(t, date(2026, 3, 30)) and is_due_on(t, date(2026, 3, 31))
    assert is_due_on(t, date(2026, 4, 30))


def test_quarterly_and_yearly():
    q = _t(frequency="quarterly", start_date=date(2026, 1, 15))
    assert [m for m in range(1, 13) if is_due_on(q, date(2026, m, 15))] == [1, 4, 7, 10]
    y = _t(frequency="yearly", start_date=date(2026, 3, 1))
    assert is_due_on(y, date(2027, 3, 1)) and not is_due_on(y, date(2026, 9, 1))


def test_due_checks_are_created_once_in_gym_time(tenant):
    t = _template(tenant)
    with _at(datetime(2026, 11, 3, 5, 0, tzinfo=NZ)):
        assert create_due_runs(tenant) == 3  # 1st, 2nd and 3rd
        assert create_due_runs(tenant) == 0
    run = ChecklistRun.objects.get(template=t, due_date=date(2026, 11, 3))
    assert run.due_at == datetime(2026, 11, 3, 6, 0, tzinfo=NZ)


def test_no_checks_before_the_checklist_existed(tenant):
    t = _template(tenant)
    ChecklistTemplate.objects.filter(pk=t.pk).update(created_at=datetime(2026, 11, 3, 9, 0, tzinfo=NZ))
    with _at(datetime(2026, 11, 3, 10, 0, tzinfo=NZ)):
        create_due_runs(tenant)
    assert list(ChecklistRun.objects.values_list("due_date", flat=True)) == [date(2026, 11, 3)]


# ─── Who sets them up, who does them ─────────────────────────────────────────


def _new_checklist(client, **extra):
    body = {
        "name": "Cardio wipe-down",
        "category": "cleaning",
        "frequency": "weekly",
        "weekdays": [0],
        "start_date": "2026-11-02",
        "due_time": "10:00",
        "items": [{"text": "Wipe screens"}, {"text": "Check belts"}],
        **extra,
    }
    return client.post("/api/v1/facilities/checklists/", body, format="json")


@pytest.mark.parametrize("role", ["owner", "admin", "gym_manager"])
def test_managers_set_up_checklists(tenant, role):
    response = _new_checklist(_client(UserFactory(tenant=tenant, role=role)))
    assert response.status_code == 201, response.data
    assert [i["text"] for i in response.data["items"]] == ["Wipe screens", "Check belts"]


@pytest.mark.parametrize("role", ["team_leader", "payroll"])
def test_other_facilities_roles_can_read_but_not_set_up(tenant, role):
    client = _client(UserFactory(tenant=tenant, role=role))
    assert _new_checklist(client).status_code == 403
    assert client.get("/api/v1/facilities/checklists/").status_code == 200


@pytest.mark.parametrize("role", ["instructor", "class_count_admin"])
def test_instructors_and_pts_never_see_checklists(tenant, role):
    client = _client(UserFactory(tenant=tenant, role=role))
    assert client.get("/api/v1/facilities/checklists/").status_code == 403
    assert client.get("/api/v1/facilities/checklist-runs/mine/").status_code == 403
    assert client.get("/api/v1/facilities/config/").data["can_do_checklists"] is False


def test_checklist_needs_items_and_weekly_days(tenant, owner_user):
    client = _client(owner_user)
    assert _new_checklist(client, items=[]).status_code == 400
    assert _new_checklist(client, weekdays=[]).status_code == 400


def test_assigned_roles_must_be_checklist_roles(tenant, owner_user):
    client = _client(owner_user)
    assert _new_checklist(client, assigned_roles=["payroll"]).status_code == 400
    assert _new_checklist(client, assigned_roles=["team_leader"]).status_code == 201


def test_editing_items_keeps_ids_and_drops_removed(tenant, owner_user):
    client = _client(owner_user)
    created = _new_checklist(client).data
    first = created["items"][0]
    response = client.patch(
        f"/api/v1/facilities/checklists/{created['id']}/",
        {"items": [{"id": first["id"], "text": "Wipe screens and handles"}, {"text": "Mop floor"}]},
        format="json",
    )
    assert response.status_code == 200, response.data
    assert response.data["items"][0]["id"] == first["id"]
    assert [i["text"] for i in response.data["items"]] == ["Wipe screens and handles", "Mop floor"]


def test_team_leader_sees_and_does_their_checks(tenant, team_leader_user):
    _template(tenant)
    client = _client(team_leader_user)
    with _at(datetime(2026, 11, 3, 7, 0, tzinfo=NZ)):
        mine = client.get("/api/v1/facilities/checklist-runs/mine/").data
    assert [r["due_date"] for r in mine] == ["2026-11-01", "2026-11-02", "2026-11-03"]
    assert {r["status"] for r in mine} == {"overdue"}
    assert all(r["can_complete"] for r in mine)


def test_payroll_does_checks_only_when_settings_say_so(tenant, payroll_user):
    t = _template(tenant)
    client = _client(payroll_user)
    with _at(datetime(2026, 11, 1, 5, 0, tzinfo=NZ)):
        assert client.get("/api/v1/facilities/checklist-runs/mine/").data == []
        run = ChecklistRun.objects.get(template=t)
        item = t.items.get()
        answer = [{"item": item.id, "passed": True}]
        url = f"/api/v1/facilities/checklist-runs/{run.id}/complete/"
        assert client.post(url, {"answers": answer}, format="json").status_code == 403

        _settings(tenant, checklist_roles=["owner", "team_leader", "payroll"])
        assert client.post(url, {"answers": answer}, format="json").status_code == 200


def test_checklist_roles_setting_only_takes_facilities_roles(tenant, owner_user):
    client = _client(owner_user)
    bad = client.patch("/api/v1/tenants/settings/", {"checklist_roles": ["instructor"]}, format="json")
    assert bad.status_code == 400
    ok = client.patch("/api/v1/tenants/settings/", {"checklist_roles": ["owner", "payroll"]}, format="json")
    assert ok.status_code == 200


def test_template_assigned_to_one_role(tenant, team_leader_user, manager_user):
    _template(tenant, assigned_roles=["team_leader"])
    with _at(datetime(2026, 11, 1, 5, 0, tzinfo=NZ)):
        assert len(_client(team_leader_user).get("/api/v1/facilities/checklist-runs/mine/").data) == 1
        assert _client(manager_user).get("/api/v1/facilities/checklist-runs/mine/").data == []


# ─── Doing a check ───────────────────────────────────────────────────────────


def _complete(client, run, answers, notes=""):
    return client.post(
        f"/api/v1/facilities/checklist-runs/{run.id}/complete/",
        {"answers": answers, "notes": notes},
        format="json",
    )


def test_every_item_must_be_answered(tenant, team_leader_user):
    t = _template(tenant, items=("A", "B"))
    with _at(datetime(2026, 11, 1, 5, 0, tzinfo=NZ)):
        create_due_runs(tenant)
    run = ChecklistRun.objects.get(template=t)
    a = t.items.first()
    response = _complete(_client(team_leader_user), run, [{"item": a.id, "passed": True}])
    assert response.status_code == 400


def test_failed_item_raises_a_fault_tagged_with_who_did_the_check(
    tenant, team_leader_user, owner_user, treadmill
):
    t = _template(tenant, items=("Belt OK", "Screen OK"))
    belt, screen = t.items.all()
    belt.equipment = treadmill
    belt.save()
    with _at(datetime(2026, 11, 1, 5, 30, tzinfo=NZ)):
        create_due_runs(tenant)
        run = ChecklistRun.objects.get(template=t)
        response = _complete(
            _client(team_leader_user),
            run,
            [{"item": belt.id, "passed": False, "note": "Slipping"}, {"item": screen.id, "passed": True}],
        )
    assert response.status_code == 200, response.data
    assert response.data["status"] == "done"
    assert response.data["completed_by_name"] == team_leader_user.full_name
    assert response.data["failed_count"] == 1

    fault = FaultReport.objects.get(tenant=tenant)
    assert fault.title == "Belt OK"
    assert fault.equipment == treadmill
    assert fault.reported_by == team_leader_user
    assert "Slipping" in fault.description
    # The owner hears about it like any other fault.
    assert Notification.objects.filter(recipient=owner_user, related_object_type="fault_report").exists()


def test_failed_item_without_maintenance_tracking_raises_no_fault(tenant, team_leader_user):
    _settings(tenant, facilities_maintenance_enabled=False)
    t = _template(tenant)
    with _at(datetime(2026, 11, 1, 5, 0, tzinfo=NZ)):
        create_due_runs(tenant)
    run = ChecklistRun.objects.get(template=t)
    response = _complete(_client(team_leader_user), run, [{"item": t.items.get().id, "passed": False}])
    assert response.status_code == 200
    assert response.data["failed_count"] == 1
    assert not FaultReport.objects.exists()


def test_a_check_is_done_once(tenant, team_leader_user):
    t = _template(tenant)
    with _at(datetime(2026, 11, 1, 5, 0, tzinfo=NZ)):
        create_due_runs(tenant)
    run = ChecklistRun.objects.get(template=t)
    answers = [{"item": t.items.get().id, "passed": True}]
    client = _client(team_leader_user)
    assert _complete(client, run, answers).status_code == 200
    assert _complete(client, run, answers).status_code == 400


def test_done_late_is_marked_late(tenant, team_leader_user):
    t = _template(tenant)
    with _at(datetime(2026, 11, 1, 7, 0, tzinfo=NZ)):
        create_due_runs(tenant)
        run = ChecklistRun.objects.get(template=t, due_date=date(2026, 11, 1))
        response = _complete(_client(team_leader_user), run, [{"item": t.items.get().id, "passed": True}])
    assert response.data["status"] == "late"


def _png():
    from PIL import Image

    buf = BytesIO()
    Image.new("RGB", (2, 2), "red").save(buf, format="PNG")
    return SimpleUploadedFile("crack.png", buf.getvalue(), content_type="image/png")


def test_photo_on_a_failed_item_by_whoever_did_the_check(tenant, team_leader_user, manager_user, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    t = _template(tenant)
    with _at(datetime(2026, 11, 1, 5, 0, tzinfo=NZ)):
        create_due_runs(tenant)
    run = ChecklistRun.objects.get(template=t)
    done = _complete(_client(team_leader_user), run, [{"item": t.items.get().id, "passed": False}]).data
    answer_id = done["answers"][0]["id"]
    url = f"/api/v1/facilities/checklist-answers/{answer_id}/photo/"

    assert _client(manager_user).post(url, {"photo": _png()}, format="multipart").status_code == 403
    not_image = SimpleUploadedFile("x.txt", b"hello", content_type="text/plain")
    assert _client(team_leader_user).post(url, {"photo": not_image}, format="multipart").status_code == 400
    response = _client(team_leader_user).post(url, {"photo": _png()}, format="multipart")
    assert response.status_code == 200
    assert response.data["photo"]


def test_runs_are_scoped_to_the_gym(tenant, other_tenant, team_leader_user):
    _settings(other_tenant)
    _template(other_tenant)
    with _at(datetime(2026, 11, 1, 5, 0, tzinfo=NZ)):
        create_due_runs(other_tenant)
        assert _client(team_leader_user).get("/api/v1/facilities/checklist-runs/mine/").data == []
        assert _client(team_leader_user).get("/api/v1/facilities/checklist-runs/").data["results"] == []


def test_switching_checklists_off(tenant, owner_user):
    _settings(tenant, facilities_checklists_enabled=False)
    client = _client(owner_user)
    assert client.get("/api/v1/facilities/checklists/").status_code == 403
    assert client.get("/api/v1/facilities/config/").data["can_do_checklists"] is False


# ─── Overdue alerts: business hours only, once, never WhatsApp ───────────────


def test_overdue_alerts_wait_for_business_hours(tenant, owner_user, admin_user, manager_user):
    _template(tenant, name="Opening check")
    _template(tenant, name="Pool test")
    with _at(datetime(2026, 11, 1, 7, 0, tzinfo=NZ)):  # overdue since 6am, but 7am
        create_due_runs(tenant)
        assert alert_overdue_runs(tenant) == 0
    assert not Notification.objects.filter(notification_type="facilities").exists()

    with _at(datetime(2026, 11, 1, 9, 0, tzinfo=NZ)):
        assert alert_overdue_runs(tenant) == 3  # owner, admin, gym manager
        assert alert_overdue_runs(tenant) == 0  # each check is alerted once
    note = Notification.objects.get(recipient=owner_user, notification_type="facilities")
    assert note.title == "2 checks overdue"
    assert "Opening check" in note.body and "Pool test" in note.body


def test_no_alerts_after_hours(tenant, owner_user):
    _template(tenant)
    with _at(datetime(2026, 11, 1, 17, 0, tzinfo=NZ)):
        create_due_runs(tenant)
        assert alert_overdue_runs(tenant) == 0


def test_alert_hours_are_a_setting(tenant, owner_user):
    _settings(tenant, facilities_alert_start_hour=6, facilities_alert_end_hour=20)
    _template(tenant)
    with _at(datetime(2026, 11, 1, 19, 30, tzinfo=NZ)):
        create_due_runs(tenant)
        assert alert_overdue_runs(tenant) == 1


def test_alert_hours_must_make_sense(tenant, owner_user):
    response = _client(owner_user).patch(
        "/api/v1/tenants/settings/",
        {"facilities_alert_start_hour": 17, "facilities_alert_end_hour": 9},
        format="json",
    )
    assert response.status_code == 400


def test_overdue_email_only_when_on_and_never_whatsapp(tenant, owner_user):
    from apps.notifications.tasks import _dispatch_notification

    _settings(tenant, facilities_alert_roles=["owner"], facilities_alert_email=True)
    _template(tenant)
    mail.outbox.clear()
    with _at(datetime(2026, 11, 1, 10, 0, tzinfo=NZ)):
        create_due_runs(tenant)
        alert_overdue_runs(tenant)
    assert [m.to for m in mail.outbox] == [[owner_user.email]]
    note = Notification.objects.get(notification_type="facilities")
    with mock.patch("apps.notifications.tasks._send_whatsapp_notification") as whatsapp:
        _dispatch_notification(note)
    whatsapp.assert_not_called()


def test_done_checks_are_not_alerted(tenant, owner_user, team_leader_user):
    t = _template(tenant)
    with _at(datetime(2026, 11, 1, 5, 0, tzinfo=NZ)):
        create_due_runs(tenant)
        run = ChecklistRun.objects.get(template=t)
        _complete(_client(team_leader_user), run, [{"item": t.items.get().id, "passed": True}])
    with _at(datetime(2026, 11, 1, 10, 0, tzinfo=NZ)):
        assert alert_overdue_runs(tenant) == 0


def test_scheduled_task_runs_both_steps(tenant, owner_user):
    from apps.facilities.tasks import run_checklists

    _template(tenant)
    with _at(datetime(2026, 11, 1, 10, 0, tzinfo=NZ)):
        result = run_checklists()
    assert result["created"] == 1
    assert result["alerted"] == 1  # the owner, the only key person here


# ─── Equipment QR: status for everyone, history for Facilities roles ─────────


def test_instructor_scan_shows_status_and_open_faults_only(tenant, instructor_user, treadmill):
    FaultReport.objects.create(
        tenant=tenant, equipment=treadmill, title="Belt slipping", repair_cost=120, internal_notes="Secret"
    )
    client = _client(instructor_user)
    scan = client.get(f"/api/v1/facilities/equipment/{treadmill.id}/scan/")
    assert scan.status_code == 200
    assert scan.data["name"] == "Treadmill 3"
    assert [f["title"] for f in scan.data["open_faults"]] == ["Belt slipping"]
    assert "repair_cost" not in scan.data["open_faults"][0]
    assert scan.data["can_see_history"] is False
    assert client.get(f"/api/v1/facilities/equipment/{treadmill.id}/history/").status_code == 403


def test_scan_of_another_gyms_machine_is_not_found(tenant, other_tenant, instructor_user):
    other = Equipment.objects.create(tenant=other_tenant, name="Rower")
    assert _client(instructor_user).get(f"/api/v1/facilities/equipment/{other.id}/scan/").status_code == 404


def test_history_has_faults_and_checks(tenant, team_leader_user, manager_user, treadmill):
    FaultReport.objects.create(tenant=tenant, equipment=treadmill, title="Belt slipping", status="resolved")
    t = _template(tenant, name="Treadmill monthly", equipment=treadmill, items=("Belt tension",))
    with _at(datetime(2026, 11, 1, 5, 0, tzinfo=NZ)):
        create_due_runs(tenant)
        run = ChecklistRun.objects.get(template=t)
        _complete(_client(team_leader_user), run, [{"item": t.items.get().id, "passed": True}])

    history = _client(manager_user).get(f"/api/v1/facilities/equipment/{treadmill.id}/history/")
    assert history.status_code == 200
    kinds = {(e["kind"], e["title"]) for e in history.data["events"]}
    assert ("fault", "Belt slipping") in kinds
    assert ("check", "Treadmill monthly") in kinds
    check = next(e for e in history.data["events"] if e["kind"] == "check")
    assert check["by"] == team_leader_user.full_name
    assert check["lines"] == [{"text": "Belt tension", "passed": True, "note": "", "photo": None}]


# ─── Review fixes ────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "name,content,content_type",
    [
        ("x.html", b"<script>alert(document.cookie)</script>", "image/png"),
        (
            "x.svg",
            b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
            "image/svg+xml",
        ),
        ("x.png", b"not really a png", "image/png"),
    ],
)
def test_photo_must_really_be_a_jpeg_png_or_webp(
    tenant, team_leader_user, settings, tmp_path, name, content, content_type
):
    settings.MEDIA_ROOT = tmp_path
    t = _template(tenant)
    with _at(datetime(2026, 11, 1, 5, 0, tzinfo=NZ)):
        create_due_runs(tenant)
    run = ChecklistRun.objects.get(template=t)
    done = _complete(_client(team_leader_user), run, [{"item": t.items.get().id, "passed": False}]).data
    url = f"/api/v1/facilities/checklist-answers/{done['answers'][0]['id']}/photo/"

    upload = SimpleUploadedFile(name, content, content_type=content_type)
    response = _client(team_leader_user).post(url, {"photo": upload}, format="multipart")

    assert response.status_code == 400
    assert not ChecklistAnswer.objects.get(pk=done["answers"][0]["id"]).photo
    assert not any(tmp_path.rglob("x.*"))


def test_photo_is_saved_under_a_server_made_name(tenant, team_leader_user, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    t = _template(tenant)
    with _at(datetime(2026, 11, 1, 5, 0, tzinfo=NZ)):
        create_due_runs(tenant)
    run = ChecklistRun.objects.get(template=t)
    done = _complete(_client(team_leader_user), run, [{"item": t.items.get().id, "passed": False}]).data
    url = f"/api/v1/facilities/checklist-answers/{done['answers'][0]['id']}/photo/"

    png = _png()
    png.name = "page.html"  # a real PNG under a misleading name
    assert _client(team_leader_user).post(url, {"photo": png}, format="multipart").status_code == 200

    stored = ChecklistAnswer.objects.get(pk=done["answers"][0]["id"]).photo.name
    assert stored.startswith("facilities/checklists/")
    assert stored.endswith(".png")
    assert "page" not in stored


def test_overlapping_alert_jobs_alert_each_check_once(tenant, owner_user):
    """A second job that starts while the first is still sending finds the
    checks already claimed."""
    _template(tenant)
    from apps.facilities import checklists

    real_create = Notification.objects.create
    second_job = {}

    def create_and_start_second_job(**kwargs):
        note = real_create(**kwargs)
        if "ran" not in second_job:
            second_job["ran"] = True
            second_job["sent"] = checklists.alert_overdue_runs(tenant)
        return note

    with _at(datetime(2026, 11, 1, 9, 0, tzinfo=NZ)):
        create_due_runs(tenant)
        with mock.patch.object(Notification.objects, "create", side_effect=create_and_start_second_job):
            checklists.alert_overdue_runs(tenant)

    assert second_job["sent"] == 0
    assert Notification.objects.filter(recipient=owner_user, notification_type="facilities").count() == 1


def test_switched_off_checklist_leaves_no_overdue_checks_to_do(tenant, owner_user, team_leader_user):
    t = _template(tenant)
    with _at(datetime(2026, 11, 3, 7, 0, tzinfo=NZ)):
        create_due_runs(tenant)
        response = _client(owner_user).patch(
            f"/api/v1/facilities/checklists/{t.id}/", {"is_active": False}, format="json"
        )
        assert response.status_code == 200, response.data
        mine = _client(team_leader_user).get("/api/v1/facilities/checklist-runs/mine/").data
    assert mine == []


def test_checklist_set_up_after_todays_due_time_is_not_alerted_as_overdue(tenant, owner_user):
    t = _template(tenant, start_date=date(2026, 11, 3))  # due by 06:00
    ChecklistTemplate.objects.filter(pk=t.pk).update(created_at=datetime(2026, 11, 3, 14, 0, tzinfo=NZ))
    with _at(datetime(2026, 11, 3, 14, 5, tzinfo=NZ)):
        assert create_due_runs(tenant) == 1  # today's check can still be done
        assert alert_overdue_runs(tenant) == 0
    # Tomorrow's check is a normal one and is alerted when it goes overdue.
    with _at(datetime(2026, 11, 4, 9, 0, tzinfo=NZ)):
        create_due_runs(tenant)
        assert alert_overdue_runs(tenant) == 1
    note = Notification.objects.get(recipient=owner_user, notification_type="facilities")
    assert note.title == "1 check overdue"


def test_checks_to_do_stays_cheap_with_many_checklists(tenant, team_leader_user, django_assert_max_num_queries):
    for i in range(10):
        _template(tenant, name=f"Check {i}")
    client = _client(team_leader_user)
    with _at(datetime(2026, 11, 8, 7, 0, tzinfo=NZ)):
        client.get("/api/v1/facilities/checklist-runs/mine/")  # creates the week's checks
        with django_assert_max_num_queries(25):
            client.get("/api/v1/facilities/checklist-runs/mine/")


@pytest.mark.parametrize("param", ["from", "to"])
def test_bad_date_filter_is_a_400_not_a_500(tenant, owner_user, param):
    response = _client(owner_user).get(f"/api/v1/facilities/checklist-runs/?{param}=notadate")
    assert response.status_code == 400
    assert param in response.data["detail"]


def test_switching_a_checklist_back_on_doesnt_catch_up_or_alert_the_days_it_was_off(
    tenant, owner_user, team_leader_user
):
    t = _template(tenant)
    owner = _client(owner_user)
    url = f"/api/v1/facilities/checklists/{t.id}/"
    with _at(datetime(2026, 11, 1, 5, 0, tzinfo=NZ)):
        assert owner.patch(url, {"is_active": False}, format="json").status_code == 200
    with _at(datetime(2026, 11, 6, 10, 0, tzinfo=NZ)):
        assert owner.patch(url, {"is_active": True}, format="json").status_code == 200
        mine = _client(team_leader_user).get("/api/v1/facilities/checklist-runs/mine/").data
        assert [r["due_date"] for r in mine] == ["2026-11-06"]  # not 1st-5th
        assert alert_overdue_runs(tenant) == 0  # today's 6am was before it came back on
    with _at(datetime(2026, 11, 7, 9, 0, tzinfo=NZ)):
        create_due_runs(tenant)
        assert alert_overdue_runs(tenant) == 1  # the 7th is a normal check


def test_rescheduling_doesnt_flood_alerts_but_keeps_real_overdue_checks(tenant, owner_user):
    # Weekly on Mondays; Monday the 2nd's check was missed.
    t = _template(tenant, frequency="weekly", weekdays=[0], start_date=date(2026, 11, 2))
    with _at(datetime(2026, 11, 2, 5, 0, tzinfo=NZ)):
        create_due_runs(tenant)
    with _at(datetime(2026, 11, 6, 10, 0, tzinfo=NZ)):  # Friday: switch to daily
        response = _client(owner_user).patch(
            f"/api/v1/facilities/checklists/{t.id}/", {"frequency": "daily"}, format="json"
        )
        assert response.status_code == 200, response.data
        runs = sorted(ChecklistRun.objects.values_list("due_date", flat=True))
        assert runs == [date(2026, 11, 2), date(2026, 11, 6)]  # no daily runs for the 3rd-5th
        assert alert_overdue_runs(tenant) == 1  # Monday's missed check, not today's
    note = Notification.objects.get(recipient=owner_user, notification_type="facilities")
    assert "Mon 2 Nov 2026" in note.body


def test_editing_a_checklist_name_doesnt_restart_its_schedule(tenant, owner_user):
    t = _template(tenant)
    with _at(datetime(2026, 11, 6, 10, 0, tzinfo=NZ)):
        response = _client(owner_user).patch(
            f"/api/v1/facilities/checklists/{t.id}/", {"name": "Morning check"}, format="json"
        )
        assert response.status_code == 200
    t.refresh_from_db()
    assert t.schedule_from is None


def _mpo_jpeg():
    """A JPEG with an extra image, as many phone cameras save; Pillow calls it MPO."""
    from PIL import Image

    buf = BytesIO()
    Image.new("RGB", (4, 4), "red").save(
        buf, format="MPO", save_all=True, append_images=[Image.new("RGB", (4, 4), "blue")]
    )
    return SimpleUploadedFile("IMG_1.jpg", buf.getvalue(), content_type="image/jpeg")


def test_phone_camera_jpeg_with_extra_images_is_accepted(tenant, team_leader_user, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    t = _template(tenant)
    with _at(datetime(2026, 11, 1, 5, 0, tzinfo=NZ)):
        create_due_runs(tenant)
    run = ChecklistRun.objects.get(template=t)
    done = _complete(_client(team_leader_user), run, [{"item": t.items.get().id, "passed": False}]).data
    url = f"/api/v1/facilities/checklist-answers/{done['answers'][0]['id']}/photo/"

    response = _client(team_leader_user).post(url, {"photo": _mpo_jpeg()}, format="multipart")

    assert response.status_code == 200, response.data
    assert ChecklistAnswer.objects.get(pk=done["answers"][0]["id"]).photo.name.endswith(".jpg")


def test_non_ascii_digit_template_filter_is_ignored_not_a_500(tenant, owner_user):
    response = _client(owner_user).get("/api/v1/facilities/checklist-runs/?template=\u00b2")
    assert response.status_code == 200
