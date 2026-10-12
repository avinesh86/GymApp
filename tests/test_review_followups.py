"""
Follow-ups from the "does every form keep what it saves" review.

- an instructor ticks their own class types on My Profile;
- inactive staff get no cover notices, including for offers already out;
- the reason typed on a cover request is kept;
- a recurring class keeps the capacity it was created with;
- gym managers have the owner's access, and with admins can add classes and
  staff (an admin cannot make an owner);
- every date a person reads is in the timezone chosen in Settings, written the
  same way, on any operating system.
"""

import datetime as dt

import pytest
from rest_framework.test import APIClient

from apps.core.timezones import (
    format_date,
    format_date_range,
    format_datetime,
    format_time,
    local_date,
)
from apps.cover.models import CoverOffer, CoverRequest
from apps.cover.services import score_instructor_for_cover
from apps.cover.tasks import notify_cover_offers, send_cover_reminders
from apps.notifications.models import Notification
from apps.staff.models import StaffAvailability, StaffClassTypeCapability, StaffProfile
from apps.timetable.models import RecurringTimetableRule, TimetableEvent
from apps.timetable.services import generate_recurring_events
from apps.users.models import Membership
from tests.factories import (
    ClassTypeFactory,
    SiteFactory,
    StaffProfileFactory,
    TenantDomainFactory,
    TenantFactory,
    TenantSettingsFactory,
    TimetableEventFactory,
    UserFactory,
)

HOST = "followups.localhost"

# 09:00 on Monday 7 Sep 2026 in Auckland is 21:00 on Sunday the 6th in UTC.
MONDAY_9AM_NZ = dt.datetime(2026, 9, 6, 21, 0, tzinfo=dt.timezone.utc)


@pytest.fixture
def gym(db):
    tenant = TenantFactory(slug="followups-gym", name="Northern Arena")
    TenantSettingsFactory(tenant=tenant, timezone="Pacific/Auckland")
    TenantDomainFactory(tenant=tenant, domain=HOST)
    return tenant


def _client(user, tenant):
    Membership.objects.get_or_create(
        user=user, tenant=tenant, defaults={"role": user.role, "is_active": True}
    )
    client = APIClient()
    client.force_authenticate(user=user)
    client.defaults["HTTP_HOST"] = HOST
    return client


def _api(gym, role):
    return _client(UserFactory(tenant=gym, role=role), gym)


@pytest.fixture
def class_type(gym):
    return ClassTypeFactory(tenant=gym, name="Aqua Fit")


def _qualified(gym, class_type, name="Cover Person", **extra):
    staff = StaffProfileFactory(tenant=gym, role="instructor", name=name, status="active", **extra)
    StaffClassTypeCapability.objects.create(
        tenant=gym, staff=staff, class_type=class_type, is_active=True
    )
    return staff


def _open_request(gym, class_type, start=None):
    start = start or (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=2))
    event = TimetableEventFactory(
        tenant=gym,
        class_type=class_type,
        start_datetime=start,
        end_datetime=start + dt.timedelta(hours=1),
    )
    return CoverRequest.objects.create(
        tenant=gym, timetable_event=event, status=CoverRequest.Status.OFFERED
    )


def _offer(cover_request, staff):
    return CoverOffer.objects.create(
        cover_request=cover_request, tenant=cover_request.tenant, staff=staff
    )


# ─── Instructors tick their own classes ───────────────────────────────────────


def test_an_instructor_can_tick_and_untick_their_own_class_type(gym, class_type):
    me = StaffProfileFactory(tenant=gym, role="instructor")
    api = _client(me.user, gym)
    url = f"/api/v1/staff/{me.pk}/capabilities/"

    created = api.post(url, {"class_type": class_type.id}, format="json")
    assert created.status_code == 201, created.data
    assert StaffClassTypeCapability.objects.filter(staff=me, is_deleted=False).count() == 1

    removed = api.delete(f"{url}{created.data['id']}/")
    assert removed.status_code == 204
    assert StaffClassTypeCapability.objects.filter(staff=me, is_deleted=False).count() == 0


def test_an_instructor_cannot_tick_class_types_for_someone_else(gym, class_type):
    me = StaffProfileFactory(tenant=gym, role="instructor")
    someone_else = StaffProfileFactory(tenant=gym, role="instructor")

    response = _client(me.user, gym).post(
        f"/api/v1/staff/{someone_else.pk}/capabilities/",
        {"class_type": class_type.id},
        format="json",
    )

    assert response.status_code == 403
    assert not StaffClassTypeCapability.objects.filter(staff=someone_else).exists()


# ─── Inactive staff and cover ─────────────────────────────────────────────────


def test_inactive_staff_are_not_offered_cover(gym, class_type):
    active = _qualified(gym, class_type, "Still Here")
    inactive = _qualified(gym, class_type, "Gone Quiet")
    inactive.status = StaffProfile.Status.INACTIVE
    inactive.save()
    cover_request = _open_request(gym, class_type)
    cover_request.status = CoverRequest.Status.OPEN
    cover_request.save()
    api = _api(gym, "gym_manager")

    candidates = api.get(f"/api/v1/cover/requests/{cover_request.pk}/candidates/")
    names = {c["name"] for group in candidates.data.values() for c in group}
    assert names == {"Still Here"}

    # Naming them outright still must not reach them.
    api.post(
        f"/api/v1/cover/requests/{cover_request.pk}/send-offers/",
        {"staff_ids": [active.pk, inactive.pk]},
        format="json",
    )
    offered = set(cover_request.offers.values_list("staff_id", flat=True))
    assert offered == {active.pk}


def test_making_someone_inactive_withdraws_their_open_offers(gym, class_type):
    staff = _qualified(gym, class_type)
    offer = _offer(_open_request(gym, class_type), staff)

    response = _api(gym, "gym_manager").patch(
        f"/api/v1/staff/{staff.pk}/", {"status": "inactive"}, format="json"
    )

    assert response.status_code == 200, response.data
    offer.refresh_from_db()
    assert offer.status == CoverOffer.Status.EXPIRED


def test_reminders_skip_inactive_staff(gym, class_type):
    cover_request = _open_request(gym, class_type)
    active = _qualified(gym, class_type, "Still Here")
    inactive = _qualified(gym, class_type, "Gone Quiet")
    _offer(cover_request, active)
    _offer(cover_request, inactive)
    # Made inactive without going through the staff form, so the offer is
    # still pending — the reminder job has to check for itself.
    StaffProfile.objects.filter(pk=inactive.pk).update(status="inactive")

    send_cover_reminders()

    reminded = set(Notification.objects.values_list("recipient_id", flat=True))
    assert reminded == {active.user_id}


def test_a_queued_offer_notice_is_dropped_for_inactive_staff(gym, class_type):
    staff = _qualified(gym, class_type)
    offer = _offer(_open_request(gym, class_type), staff)
    StaffProfile.objects.filter(pk=staff.pk).update(status="inactive")

    notify_cover_offers(offer.pk)

    assert not Notification.objects.filter(recipient=staff.user).exists()


# ─── The reason on a cover request ────────────────────────────────────────────


def test_the_reason_typed_on_a_cover_request_is_kept(gym, class_type):
    start = dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=3)
    event = TimetableEventFactory(
        tenant=gym, class_type=class_type,
        start_datetime=start, end_datetime=start + dt.timedelta(hours=1),
    )
    api = _api(gym, "gym_manager")

    created = api.post(
        "/api/v1/cover/requests/",
        {"timetable_event": event.pk, "notes": "Annual leave"},
        format="json",
    )

    assert created.status_code == 201, created.data
    assert CoverRequest.objects.get(timetable_event=event).notes == "Annual leave"
    fetched = api.get(f"/api/v1/cover/requests/{created.data['id']}/")
    assert fetched.data["notes"] == "Annual leave"


# ─── Recurring classes keep their capacity ────────────────────────────────────


def test_a_recurring_class_keeps_its_capacity(gym, class_type):
    site = SiteFactory(tenant=gym)
    api = _api(gym, "gym_manager")
    monday = dt.date(2030, 3, 4)

    created = api.post(
        "/api/v1/timetable/recurring-rules/",
        {
            "class_type": class_type.id, "site": site.id, "instructor": None,
            "day_of_week": 0, "start_time": "09:00:00", "end_time": "10:00:00",
            "capacity": 25, "valid_from": monday.isoformat(),
        },
        format="json",
    )
    assert created.status_code == 201, created.data

    rule = RecurringTimetableRule.objects.get(pk=created.data["id"])
    assert rule.capacity == 25
    events = generate_recurring_events(rule, monday, monday + dt.timedelta(weeks=2))
    assert len(events) == 3
    assert {e.capacity for e in events} == {25}


# ─── Who can add classes and staff ────────────────────────────────────────────


@pytest.mark.parametrize("role", ["gym_manager", "admin"])
def test_managers_and_admins_can_add_a_class(gym, class_type, role):
    site = SiteFactory(tenant=gym)

    response = _api(gym, role).post(
        "/api/v1/timetable/events/",
        {
            "class_type": class_type.id, "site": site.id, "instructor": None,
            "start_datetime": "2030-03-04T09:00:00", "end_datetime": "2030-03-04T10:00:00",
            "capacity": 20, "notes": "Bring a towel",
        },
        format="json",
    )

    assert response.status_code == 201, response.data
    event = TimetableEvent.objects.get(pk=response.data["id"])
    assert event.capacity == 20
    assert event.notes == "Bring a towel"


@pytest.mark.parametrize("role", ["gym_manager", "admin"])
def test_managers_and_admins_can_add_a_staff_member(gym, role):
    response = _api(gym, role).post(
        "/api/v1/staff/",
        {"name": "New Starter", "email": f"new-{role}@example.com", "role": "instructor"},
        format="json",
    )

    assert response.status_code == 201, response.data
    assert StaffProfile.objects.filter(tenant=gym, name="New Starter").exists()


def test_a_manager_can_add_an_admin(gym):
    response = _api(gym, "gym_manager").post(
        "/api/v1/staff/",
        {"name": "New Admin", "email": "new-admin@example.com", "role": "admin"},
        format="json",
    )

    assert response.status_code == 201, response.data
    assert Membership.objects.get(user__email="new-admin@example.com", tenant=gym).role == "admin"


@pytest.mark.parametrize(
    "url",
    [
        "/api/v1/tenants/settings/",  # Settings — was owner/admin only
        "/api/v1/users/",  # Settings > Access
        "/api/v1/invoices/",
    ],
)
def test_a_manager_reaches_everything_the_owner_does(gym, url):
    owner = _api(gym, "owner").get(url)
    manager = _api(gym, "gym_manager").get(url)

    assert owner.status_code == 200, (url, owner.status_code)
    assert manager.status_code == 200, (url, manager.status_code)


def test_an_admin_can_add_an_admin_but_not_an_owner(gym):
    api = _api(gym, "admin")

    admin = api.post(
        "/api/v1/staff/",
        {"name": "Second Admin", "email": "admin2@example.com", "role": "admin"},
        format="json",
    )
    owner = api.post(
        "/api/v1/staff/",
        {"name": "New Owner", "email": "owner2@example.com", "role": "owner"},
        format="json",
    )

    assert admin.status_code == 201, admin.data
    assert owner.status_code == 403


def test_a_staff_member_can_be_renamed(gym):
    """What the edit-staff form sends: one `name`. first_name / last_name are
    read-only pieces of it and are ignored if sent on their own."""
    staff = StaffProfileFactory(tenant=gym, name="Old Name")

    response = _api(gym, "gym_manager").patch(
        f"/api/v1/staff/{staff.pk}/", {"name": "New Name"}, format="json"
    )

    assert response.status_code == 200
    assert response.data["first_name"] == "New"
    assert response.data["last_name"] == "Name"


# ─── Dates: the gym's timezone, written one way ───────────────────────────────


def test_dates_are_written_one_way_in_the_gyms_timezone(gym):
    assert format_date(MONDAY_9AM_NZ, gym) == "Mon 7 Sep 2026"
    assert format_time(MONDAY_9AM_NZ, gym) == "09:00"
    assert format_datetime(MONDAY_9AM_NZ, gym) == "Mon 7 Sep 2026 at 09:00"
    assert local_date(MONDAY_9AM_NZ, gym) == dt.date(2026, 9, 7)


def test_plain_dates_have_no_timezone_to_shift(gym):
    assert format_date(dt.date(2026, 10, 1)) == "Thu 1 Oct 2026"
    assert format_date_range(dt.date(2026, 10, 1), dt.date(2026, 10, 31)) == (
        "Thu 1 Oct 2026 – Sat 31 Oct 2026"
    )


def test_a_cover_reminder_gives_the_local_day_and_time(gym, class_type):
    staff = _qualified(gym, class_type)
    _offer(_open_request(gym, class_type, start=MONDAY_9AM_NZ), staff)

    send_cover_reminders()

    body = Notification.objects.get(recipient=staff.user).body
    assert "Mon 7 Sep 2026 at 09:00" in body


def test_an_invoice_line_is_dated_on_the_gyms_day(gym, class_type):
    from apps.invoices.models import Invoice, InvoiceLineItem
    from apps.invoices.serializers import InvoiceLineItemSerializer

    staff = StaffProfileFactory(tenant=gym, role="instructor")
    event = TimetableEventFactory(
        tenant=gym, class_type=class_type, instructor=staff,
        start_datetime=MONDAY_9AM_NZ, end_datetime=MONDAY_9AM_NZ + dt.timedelta(hours=1),
    )
    invoice = Invoice.objects.create(
        tenant=gym, instructor=staff,
        period_start=dt.date(2026, 9, 1), period_end=dt.date(2026, 9, 30),
    )
    line = InvoiceLineItem.objects.create(
        tenant=gym, invoice=invoice, timetable_event=event,
        description="Aqua Fit", quantity=1, rate=50, amount=50,
    )

    # In UTC this class is on Sunday the 6th.
    assert InvoiceLineItemSerializer(line).data["event_date"] == "2026-09-07"


def test_availability_is_matched_against_the_gyms_clock(gym, class_type):
    """Monday-morning availability must count for a Monday 9am class. Read in
    UTC that class is Sunday 9pm and the availability matched nothing."""
    staff = _qualified(gym, class_type)
    event = TimetableEventFactory(
        tenant=gym, class_type=class_type,
        start_datetime=MONDAY_9AM_NZ, end_datetime=MONDAY_9AM_NZ + dt.timedelta(hours=1),
    )
    without = score_instructor_for_cover(staff, event)

    StaffAvailability.objects.create(
        tenant=gym, staff=staff, day_of_week=0,
        start_time=dt.time(5, 0), end_time=dt.time(12, 0),
    )

    assert score_instructor_for_cover(staff, event) == without + 30
