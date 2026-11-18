"""
Facilities, part 3: licences and subscriptions.

- Every Facilities role sees them, costs included; owner, admin and gym
  manager add and change them. Instructors and PTs see nothing.
- Each record chooses its own reminder days (editable). A reminder goes once
  per threshold, to the responsible person and the gym's key people, only in
  alert hours, in the app (email if on), never by WhatsApp.
- Subscriptions remind before the last day to give notice; auto-renewing ones
  roll on to their next date by themselves.
"""

from datetime import date, datetime, time
from decimal import Decimal
from unittest import mock
from zoneinfo import ZoneInfo

import pytest
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.facilities.models import Licence, Subscription
from apps.facilities.renewals import add_months, send_renewal_reminders
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


def _at(day: date, hour=10):
    local = datetime.combine(day, time(hour), tzinfo=NZ)
    return mock.patch("django.utils.timezone.now", return_value=local.astimezone(ZoneInfo("UTC")))


@pytest.fixture(autouse=True)
def nz(tenant):
    _settings(tenant)


def _facilities_notes(user=None):
    qs = Notification.objects.filter(notification_type="facilities")
    return qs.filter(recipient=user) if user else qs


# ─── Who sees and changes them ───────────────────────────────────────────────


@pytest.mark.parametrize("role", ["owner", "admin", "gym_manager"])
def test_managers_add_licences_and_subscriptions(tenant, role):
    client = _client(UserFactory(tenant=tenant, role=role))
    lic = client.post(
        "/api/v1/facilities/licences/",
        {"name": "OneMusic licence", "kind": "music", "expires_on": "2027-06-30", "cost": "450.00"},
        format="json",
    )
    assert lic.status_code == 201, lic.data
    assert lic.data["reminder_days"] == [60, 30, 7, 0]
    sub = client.post(
        "/api/v1/facilities/subscriptions/",
        {"name": "Mindbody", "cost": "300.00", "billing_cycle": "monthly", "next_renewal": "2026-12-01"},
        format="json",
    )
    assert sub.status_code == 201, sub.data


@pytest.mark.parametrize("role", ["team_leader", "payroll"])
def test_other_facilities_roles_see_costs_but_cannot_change(tenant, role):
    Licence.objects.create(tenant=tenant, name="Building WOF", cost=Decimal("800"))
    client = _client(UserFactory(tenant=tenant, role=role))
    listed = client.get("/api/v1/facilities/licences/")
    assert listed.status_code == 200
    assert listed.data["results"][0]["cost"] == "800.00"
    assert client.post("/api/v1/facilities/licences/", {"name": "X"}, format="json").status_code == 403


@pytest.mark.parametrize("role", ["instructor", "class_count_admin"])
def test_instructors_see_nothing(tenant, role):
    client = _client(UserFactory(tenant=tenant, role=role))
    assert client.get("/api/v1/facilities/licences/").status_code == 403
    assert client.get("/api/v1/facilities/subscriptions/").status_code == 403


def test_scoped_to_the_gym(tenant, other_tenant, owner_user):
    Licence.objects.create(tenant=other_tenant, name="Someone else's")
    assert _client(owner_user).get("/api/v1/facilities/licences/").data["results"] == []


def test_switches_turn_them_off(tenant, owner_user):
    _settings(tenant, facilities_licences_enabled=False, facilities_subscriptions_enabled=False)
    client = _client(owner_user)
    assert client.get("/api/v1/facilities/licences/").status_code == 403
    assert client.get("/api/v1/facilities/subscriptions/").status_code == 403
    config = client.get("/api/v1/facilities/config/").data
    assert config["licences_enabled"] is False and config["subscriptions_enabled"] is False


# ─── Fields and rules ────────────────────────────────────────────────────────


def test_reminder_days_are_chosen_per_licence_and_cleaned(tenant, owner_user):
    client = _client(owner_user)
    lic = client.post(
        "/api/v1/facilities/licences/",
        {"name": "Pool certificate", "expires_on": "2027-01-31", "reminder_days": [7, 90, 7, 14]},
        format="json",
    ).data
    assert lic["reminder_days"] == [90, 14, 7]
    bad = client.patch(f"/api/v1/facilities/licences/{lic['id']}/", {"reminder_days": [400]}, format="json")
    assert bad.status_code == 400
    none = client.patch(f"/api/v1/facilities/licences/{lic['id']}/", {"reminder_days": []}, format="json")
    assert none.status_code == 200 and none.data["reminder_days"] == []


@pytest.mark.parametrize("kind", ["group_fitness", "operations"])
def test_group_fitness_and_operations_licence_types(tenant, owner_user, kind):
    response = _client(owner_user).post(
        "/api/v1/facilities/licences/", {"name": "Les Mills licence", "kind": kind}, format="json"
    )
    assert response.status_code == 201, response.data
    assert response.data["kind"] == kind


def test_unknown_licence_type_is_refused(tenant, owner_user):
    response = _client(owner_user).post(
        "/api/v1/facilities/licences/", {"name": "X", "kind": "made_up"}, format="json"
    )
    assert response.status_code == 400


def test_expiry_cannot_be_before_issue(tenant, owner_user):
    response = _client(owner_user).post(
        "/api/v1/facilities/licences/",
        {"name": "Fire", "issued_on": "2026-05-01", "expires_on": "2026-04-01"},
        format="json",
    )
    assert response.status_code == 400


def test_responsible_person_must_have_facilities_access(tenant, owner_user, instructor_user, team_leader_user):
    client = _client(owner_user)
    bad = client.post(
        "/api/v1/facilities/licences/", {"name": "Fire", "responsible": instructor_user.id}, format="json"
    )
    assert bad.status_code == 400
    ok = client.post(
        "/api/v1/facilities/licences/", {"name": "Fire", "responsible": team_leader_user.id}, format="json"
    )
    assert ok.status_code == 201
    assert ok.data["responsible_name"] == team_leader_user.full_name
    people = {p["id"] for p in client.get("/api/v1/facilities/people/").data}
    assert team_leader_user.id in people and instructor_user.id not in people


def test_licence_status(tenant, owner_user):
    for name, expires in [("Expired", "2026-10-01"), ("Soon", "2026-12-01"), ("Fine", "2027-12-01"), ("Undated", None)]:
        Licence.objects.create(tenant=tenant, name=name, expires_on=expires)
    with _at(date(2026, 11, 6)):
        rows = _client(owner_user).get("/api/v1/facilities/licences/").data["results"]
    status = {r["name"]: r["status"] for r in rows}
    assert status == {"Expired": "expired", "Soon": "expiring", "Fine": "valid", "Undated": "no_expiry"}
    assert [r["name"] for r in rows][-1] == "Undated"  # undated ones last


def test_subscription_act_by_status_and_totals(tenant, owner_user):
    Subscription.objects.create(
        tenant=tenant, name="Cleaning", cost=Decimal("1200"), billing_cycle="quarterly",
        next_renewal=date(2027, 1, 31), notice_days=60, auto_renew=True,
    )
    Subscription.objects.create(tenant=tenant, name="Software", cost=Decimal("99"), billing_cycle="monthly")
    Subscription.objects.create(tenant=tenant, name="Old", cost=Decimal("500"), is_active=False)
    client = _client(owner_user)
    with _at(date(2026, 11, 6)):
        rows = {r["name"]: r for r in client.get("/api/v1/facilities/subscriptions/").data["results"]}
        totals = client.get("/api/v1/facilities/subscriptions/totals/").data
    assert rows["Cleaning"]["act_by"] == "2026-12-02"
    assert rows["Cleaning"]["status"] == "renewing"  # act-by within 30 days
    assert rows["Cleaning"]["monthly_cost"] == "400.00"
    assert rows["Old"]["status"] == "cancelled"
    assert totals == {"count": 2, "per_month": "499.00", "per_year": "5988.00"}


def _pdf():
    return SimpleUploadedFile("licence.pdf", b"%PDF-1.4 test", content_type="application/pdf")


def test_attach_and_remove_a_document(tenant, owner_user, team_leader_user, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    lic = Licence.objects.create(tenant=tenant, name="OneMusic")
    url = f"/api/v1/facilities/licences/{lic.id}/document/"
    assert _client(team_leader_user).post(url, {"document": _pdf()}, format="multipart").status_code == 403
    text = SimpleUploadedFile("x.exe", b"MZ", content_type="application/octet-stream")
    assert _client(owner_user).post(url, {"document": text}, format="multipart").status_code == 400

    added = _client(owner_user).post(url, {"document": _pdf()}, format="multipart")
    assert added.status_code == 200
    assert added.data["document_name"].startswith("licence") and added.data["document_url"]
    removed = _client(owner_user).delete(url)
    assert removed.status_code == 200 and removed.data["document_url"] is None


# ─── Reminders ───────────────────────────────────────────────────────────────


def test_licence_reminders_go_once_per_threshold(tenant, owner_user, team_leader_user):
    lic = Licence.objects.create(
        tenant=tenant, name="OneMusic", expires_on=date(2026, 12, 31), reminder_days=[60, 30, 7], responsible=team_leader_user
    )
    with _at(date(2026, 10, 1)):  # 91 days out
        assert send_renewal_reminders(tenant) == 0
    with _at(date(2026, 11, 1)):  # 60 days out: owner + responsible team leader
        assert send_renewal_reminders(tenant) == 2
        assert send_renewal_reminders(tenant) == 0
    assert _facilities_notes(team_leader_user).get().title == "OneMusic expires in 60 days"
    with _at(date(2026, 12, 1)):
        assert send_renewal_reminders(tenant) == 2
    lic.refresh_from_db()
    assert lic.reminders_sent == [60, 30]


def test_crossing_several_thresholds_sends_one(tenant, owner_user):
    Licence.objects.create(tenant=tenant, name="Fire", expires_on=date(2026, 11, 10), reminder_days=[60, 30, 7])
    with _at(date(2026, 11, 6)):
        assert send_renewal_reminders(tenant) == 1
        assert send_renewal_reminders(tenant) == 0
    assert _facilities_notes(owner_user).get().title == "Fire expires in 4 days"


def test_on_the_day_reminder(tenant, owner_user):
    Licence.objects.create(tenant=tenant, name="WOF", expires_on=date(2026, 11, 6), reminder_days=[0])
    with _at(date(2026, 11, 6)):
        assert send_renewal_reminders(tenant) == 1
    assert _facilities_notes(owner_user).get().title == "WOF expires today"


def test_new_expiry_date_starts_reminders_again(tenant, owner_user):
    lic = Licence.objects.create(
        tenant=tenant, name="OneMusic", expires_on=date(2026, 11, 20), reminder_days=[30], reminders_sent=[30]
    )
    _client(owner_user).patch(f"/api/v1/facilities/licences/{lic.id}/", {"expires_on": "2027-11-20"}, format="json")
    lic.refresh_from_db()
    assert lic.reminders_sent == []


def test_reminders_wait_for_alert_hours(tenant, owner_user):
    Licence.objects.create(tenant=tenant, name="Fire", expires_on=date(2026, 11, 10), reminder_days=[7])
    with _at(date(2026, 11, 6), hour=7):
        assert send_renewal_reminders(tenant) == 0
    with _at(date(2026, 11, 6), hour=9):
        assert send_renewal_reminders(tenant) == 1


def test_no_reminder_days_means_no_reminders(tenant, owner_user):
    Licence.objects.create(tenant=tenant, name="Fire", expires_on=date(2026, 11, 7), reminder_days=[])
    with _at(date(2026, 11, 6)):
        assert send_renewal_reminders(tenant) == 0


def test_subscription_reminds_before_notice_deadline(tenant, owner_user):
    Subscription.objects.create(
        tenant=tenant, name="Cleaning contract", provider="SparkleCo", cost=Decimal("1200"),
        billing_cycle="yearly", next_renewal=date(2027, 1, 31), notice_days=60, reminder_days=[30],
    )
    with _at(date(2026, 11, 2)):  # act-by is 2 Dec, 30 days away
        assert send_renewal_reminders(tenant) == 1
    note = _facilities_notes(owner_user).get()
    assert note.title == "Cleaning contract: notice to cancel due in 30 days"
    assert "Notice to cancel is due by" in note.body and "$1200" in note.body


def test_auto_renewing_subscription_rolls_on(tenant, owner_user):
    sub = Subscription.objects.create(
        tenant=tenant, name="Software", billing_cycle="monthly", next_renewal=date(2026, 10, 31),
        auto_renew=True, reminder_days=[3], reminders_sent=[3],
    )
    with _at(date(2026, 11, 6)):
        send_renewal_reminders(tenant)
    sub.refresh_from_db()
    assert sub.next_renewal == date(2026, 11, 30)
    assert sub.reminders_sent == []


def test_reminder_defaults_suit_the_billing_cycle(tenant, owner_user):
    client = _client(owner_user)
    made = {
        cycle: client.post(
            "/api/v1/facilities/subscriptions/", {"name": cycle, "billing_cycle": cycle}, format="json"
        ).data["reminder_days"]
        for cycle in ("monthly", "quarterly", "yearly")
    }
    assert made == {"monthly": [], "quarterly": [14], "yearly": [30, 7]}
    chosen = client.post(
        "/api/v1/facilities/subscriptions/",
        {"name": "x", "billing_cycle": "monthly", "reminder_days": [5]},
        format="json",
    )
    assert chosen.data["reminder_days"] == [5]


def test_lapsed_subscription_without_auto_renew_stays_lapsed(tenant, owner_user):
    sub = Subscription.objects.create(
        tenant=tenant, name="Lease", billing_cycle="yearly", next_renewal=date(2026, 10, 31), auto_renew=False
    )
    with _at(date(2026, 11, 6)):
        send_renewal_reminders(tenant)
        data = _client(owner_user).get(f"/api/v1/facilities/subscriptions/{sub.id}/").data
    assert data["status"] == "lapsed"


def test_cancelled_subscriptions_send_nothing(tenant, owner_user):
    Subscription.objects.create(
        tenant=tenant, name="Old", next_renewal=date(2026, 11, 8), reminder_days=[7], is_active=False
    )
    with _at(date(2026, 11, 6)):
        assert send_renewal_reminders(tenant) == 0


def test_email_only_when_on_and_never_whatsapp(tenant, owner_user):
    from apps.notifications.tasks import _dispatch_notification

    _settings(tenant, facilities_alert_roles=["owner"], facilities_alert_email=True)
    Licence.objects.create(tenant=tenant, name="Fire", expires_on=date(2026, 11, 10), reminder_days=[7])
    mail.outbox.clear()
    with _at(date(2026, 11, 6)):
        send_renewal_reminders(tenant)
    assert [m.to for m in mail.outbox] == [[owner_user.email]]
    with mock.patch("apps.notifications.tasks._send_whatsapp_notification") as whatsapp:
        _dispatch_notification(_facilities_notes().get())
    whatsapp.assert_not_called()


def test_switched_off_licences_send_nothing(tenant, owner_user):
    _settings(tenant, facilities_licences_enabled=False)
    Licence.objects.create(tenant=tenant, name="Fire", expires_on=date(2026, 11, 10), reminder_days=[7])
    with _at(date(2026, 11, 6)):
        assert send_renewal_reminders(tenant) == 0


def test_add_months_keeps_month_ends():
    assert add_months(date(2026, 1, 31), 1) == date(2026, 2, 28)
    assert add_months(date(2026, 11, 30), 3) == date(2027, 2, 28)
    assert add_months(date(2026, 12, 15), 12) == date(2027, 12, 15)


def test_scheduled_task(tenant, owner_user):
    from apps.facilities.tasks import send_renewal_reminders as task

    Licence.objects.create(tenant=tenant, name="Fire", expires_on=date(2026, 11, 10), reminder_days=[7])
    with _at(date(2026, 11, 6)):
        assert task() == {"sent": 1}
