"""Datetimes people read must be in the gym's local time, not UTC."""

import datetime as dt

import pytest
from django.utils import timezone

from apps.core.timezones import format_for_tenant, tenant_timezone, to_tenant_local
from tests.factories import (
    ClassTypeFactory,
    StaffProfileFactory,
    TenantDomainFactory,
    TenantFactory,
    TenantSettingsFactory,
    TimetableEventFactory,
)

# 21:00 Auckland on 6 Sep 2026 is 09:00 UTC the same day.
EVENING_CLASS_UTC = dt.datetime(2026, 9, 6, 9, 0, tzinfo=dt.timezone.utc)
# 09:00 Auckland on 7 Sep 2026 is 21:00 UTC on the 6th — a different day.
MORNING_CLASS_UTC = dt.datetime(2026, 9, 6, 21, 0, tzinfo=dt.timezone.utc)


@pytest.fixture
def nz_gym(db):
    tenant = TenantFactory(slug="nz-gym", name="Northern Arena")
    TenantSettingsFactory(tenant=tenant, timezone="Pacific/Auckland")
    TenantDomainFactory(tenant=tenant, domain="nz.localhost")
    return tenant


def test_the_helper_uses_the_configured_zone(nz_gym):
    assert str(tenant_timezone(nz_gym)) == "Pacific/Auckland"
    assert to_tenant_local(EVENING_CLASS_UTC, nz_gym).hour == 21


def test_an_unset_or_unknown_zone_falls_back(db):
    """A bad value must not crash a send — better UTC than no email."""
    tenant = TenantFactory(slug="broken-tz-gym")
    TenantSettingsFactory(tenant=tenant, timezone="Not/AZone")

    assert format_for_tenant(EVENING_CLASS_UTC, tenant, "%H:%M") == "09:00"


def test_cover_email_shows_the_local_time(nz_gym):
    """A 9pm Auckland class was emailing as 09:00."""
    from apps.cover.models import CoverOffer, CoverRequest
    from apps.cover.tasks import _send_cover_request_email

    event = TimetableEventFactory(
        tenant=nz_gym,
        class_type=ClassTypeFactory(tenant=nz_gym, name="Aqua Fit"),
        start_datetime=EVENING_CLASS_UTC,
        end_datetime=EVENING_CLASS_UTC + dt.timedelta(hours=1),
    )
    cover_request = CoverRequest.objects.create(tenant=nz_gym, timetable_event=event)
    staff = StaffProfileFactory(tenant=nz_gym, role="instructor")
    offer = CoverOffer.objects.create(
        cover_request=cover_request, tenant=nz_gym, staff=staff
    )

    from django.core import mail
    from django.test import override_settings

    with override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend"):
        _send_cover_request_email(offer)

    body = mail.outbox[0].body + "".join(c for c, _ in mail.outbox[0].alternatives)
    assert "21:00" in body, "should show the gym's 9pm, not UTC 09:00"
    assert "Sunday, 06 September 2026" in body


def test_a_morning_class_is_not_announced_on_the_wrong_day(nz_gym):
    """9am on the 7th is 21:00 UTC on the 6th — the date has to move too."""
    assert format_for_tenant(MORNING_CLASS_UTC, nz_gym, "%A, %d %B %Y") == (
        "Monday, 07 September 2026"
    )
    assert format_for_tenant(MORNING_CLASS_UTC, nz_gym, "%H:%M") == "09:00"


def test_qr_session_info_shows_local_time(nz_gym, client):
    """Whoever scans the code is standing at the gym."""
    from apps.attendance.models import QRAttendanceToken

    event = TimetableEventFactory(
        tenant=nz_gym,
        class_type=ClassTypeFactory(tenant=nz_gym, name="Aqua Fit"),
        start_datetime=MORNING_CLASS_UTC,
        end_datetime=MORNING_CLASS_UTC + dt.timedelta(hours=1),
    )
    token = QRAttendanceToken.objects.create(
        timetable_event=event, expires_at=timezone.now() + dt.timedelta(hours=2)
    )

    response = client.get(
        f"/api/v1/attendance/qr-tokens/info/?token={token.token}",
        HTTP_HOST="nz.localhost",
    )

    assert response.status_code == 200
    assert response.json()["start_time"] == "09:00"
    assert response.json()["date"] == "2026-09-07"
