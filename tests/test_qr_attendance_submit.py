"""Public QR attendance flow: scan -> info -> submit (no login)."""

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.attendance.models import AttendanceRecord, QRAttendanceToken
from apps.timetable.models import TimetableEvent

pytestmark = pytest.mark.django_db

INFO_URL = "/api/v1/attendance/qr-tokens/info/"
SUBMIT_URL = "/api/v1/attendance/qr-tokens/submit/"


@pytest.fixture
def qr_token(tenant, future_event):
    return QRAttendanceToken.objects.create(
        timetable_event=future_event,
        expires_at=timezone.now() + timedelta(hours=2),
    )


def test_info_returns_session_details_without_auth(qr_token, future_event):
    resp = APIClient().get(INFO_URL, {"token": qr_token.token})

    assert resp.status_code == 200
    assert resp.data["valid"] is True
    assert resp.data["is_used"] is False
    assert resp.data["class_type_name"] == future_event.class_type.name
    assert "start_time" in resp.data and "date" in resp.data


def test_info_invalid_token_404(db):
    resp = APIClient().get(INFO_URL, {"token": "nope"})
    assert resp.status_code == 404


def test_submit_records_attendance_without_auth(qr_token, future_event):
    resp = APIClient().post(SUBMIT_URL, {"token": qr_token.token, "count": 12}, format="json")

    assert resp.status_code in (200, 201)
    record = AttendanceRecord.objects.get(timetable_event=future_event)
    assert record.count == 12
    qr_token.refresh_from_db()
    assert qr_token.is_used is True
    future_event.refresh_from_db()
    assert future_event.status == TimetableEvent.Status.COMPLETED


def test_submit_rejects_used_token(qr_token):
    qr_token.is_used = True
    qr_token.save(update_fields=["is_used"])

    resp = APIClient().post(SUBMIT_URL, {"token": qr_token.token, "count": 5}, format="json")
    assert resp.status_code == 400
