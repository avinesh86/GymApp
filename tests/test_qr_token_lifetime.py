"""A QR code lives until the class is counted, not on a timer."""

import datetime as dt

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.attendance.models import AttendanceRecord, QRAttendanceToken
from apps.users.models import Membership
from tests.factories import (
    TenantDomainFactory,
    TenantFactory,
    TimetableEventFactory,
    UserFactory,
)

HOST = "qr.localhost"


@pytest.fixture
def gym(db):
    tenant = TenantFactory(slug="qr-gym")
    TenantDomainFactory(tenant=tenant, domain=HOST)
    return tenant


@pytest.fixture
def manager_api(gym):
    user = UserFactory(tenant=gym, role="gym_manager")
    Membership.objects.get_or_create(
        user=user, tenant=gym, defaults={"role": user.role, "is_active": True}
    )
    client = APIClient()
    client.force_authenticate(user=user)
    client.defaults["HTTP_HOST"] = HOST
    return client


@pytest.fixture
def public_api():
    client = APIClient()
    client.defaults["HTTP_HOST"] = HOST
    return client


@pytest.fixture
def evening_class(gym):
    """Starts in 10 hours — the case that used to break."""
    starts = timezone.now() + dt.timedelta(hours=10)
    return TimetableEventFactory(
        tenant=gym, start_datetime=starts, end_datetime=starts + dt.timedelta(hours=1)
    )


def test_a_code_made_this_morning_still_works_tonight(manager_api, gym, evening_class):
    """Expiry used to be two hours from generation, so printing codes in the
    morning for an evening class produced a sheet of dead QR codes."""
    created = manager_api.post(
        "/api/v1/attendance/qr-tokens/",
        {"timetable_event": evening_class.pk},
        format="json",
    )
    assert created.status_code == 201, created.data

    token = QRAttendanceToken.objects.get(token=created.data["token"])
    assert token.expires_at > evening_class.end_datetime
    assert token.is_valid() is True


def test_a_code_stops_working_once_the_class_is_counted_by_hand(
    manager_api, public_api, gym, evening_class
):
    """Your rule: the code lives until attendance is recorded, by either route."""
    token_value = manager_api.post(
        "/api/v1/attendance/qr-tokens/",
        {"timetable_event": evening_class.pk},
        format="json",
    ).data["token"]

    # Counted in Bulk Attendance instead of by scanning.
    manager_api.post(
        "/api/v1/attendance/records/submit-for-event/",
        {"event": evening_class.pk, "count": 14},
        format="json",
    )

    assert QRAttendanceToken.objects.get(token=token_value).is_valid() is False

    response = public_api.post(
        "/api/v1/attendance/qr-tokens/submit/",
        {"token": token_value, "count": 99},
        format="json",
    )
    assert response.status_code == 400
    assert "already been recorded" in response.data["detail"]
    assert AttendanceRecord.objects.get(timetable_event=evening_class).count == 14


def test_the_failure_says_which_reason(manager_api, public_api, gym, evening_class):
    """"Expired or already used" left the person holding the phone guessing."""
    token_value = manager_api.post(
        "/api/v1/attendance/qr-tokens/",
        {"timetable_event": evening_class.pk},
        format="json",
    ).data["token"]
    url = "/api/v1/attendance/qr-tokens/submit/"
    public_api.post(url, {"token": token_value, "count": 12}, format="json")

    again = public_api.post(url, {"token": token_value, "count": 12}, format="json")

    assert again.status_code == 400
    assert "already been recorded" in again.data["detail"]


def test_an_expired_backstop_still_closes_a_code(gym, public_api, evening_class):
    """A code never used must not stay live forever."""
    token = QRAttendanceToken.objects.create(
        timetable_event=evening_class,
        expires_at=timezone.now() - dt.timedelta(minutes=1),
    )

    assert token.is_valid() is False
    response = public_api.post(
        "/api/v1/attendance/qr-tokens/submit/",
        {"token": token.token, "count": 5},
        format="json",
    )
    assert "expired" in response.data["detail"]


def test_tokens_can_be_listed_for_a_date_range(manager_api, gym):
    """The page shows a week either side, so it asks for a window."""
    old_class = TimetableEventFactory(
        tenant=gym,
        start_datetime=timezone.now() - dt.timedelta(days=3),
        end_datetime=timezone.now() - dt.timedelta(days=3, hours=-1),
    )
    far_past = TimetableEventFactory(
        tenant=gym,
        start_datetime=timezone.now() - dt.timedelta(days=40),
        end_datetime=timezone.now() - dt.timedelta(days=40, hours=-1),
    )
    for event in (old_class, far_past):
        manager_api.post(
            "/api/v1/attendance/qr-tokens/", {"timetable_event": event.pk}, format="json"
        )

    window_from = (timezone.now() - dt.timedelta(days=7)).date().isoformat()
    window_to = (timezone.now() + dt.timedelta(days=7)).date().isoformat()
    listed = manager_api.get(
        f"/api/v1/attendance/qr-tokens/?from={window_from}&to={window_to}"
    )

    rows = listed.data["results"] if "results" in listed.data else listed.data
    events = {r["event"] for r in rows}
    assert old_class.pk in events
    assert far_past.pk not in events


def test_a_past_uncounted_class_can_still_get_a_code(manager_api, gym):
    """Someone forgot to scan yesterday — they should not be forced into Bulk
    Attendance just because the page used to show only today."""
    yesterday = timezone.now() - dt.timedelta(days=1)
    event = TimetableEventFactory(
        tenant=gym, start_datetime=yesterday, end_datetime=yesterday + dt.timedelta(hours=1)
    )

    created = manager_api.post(
        "/api/v1/attendance/qr-tokens/", {"timetable_event": event.pk}, format="json"
    )

    assert created.status_code == 201
    assert QRAttendanceToken.objects.get(token=created.data["token"]).is_valid() is True
