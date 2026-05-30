"""
Tests for attendance views: submit_for_event, _list_awaiting, QR token submit.
"""

from datetime import timedelta

import pytest
from django.contrib.auth.models import AnonymousUser
from django.utils import timezone

from apps.attendance.models import AttendanceRecord, QRAttendanceToken
from apps.timetable.models import TimetableEvent
from tests.factories import TimetableEventFactory


# ---------------------------------------------------------------------------
# submit_for_event
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestSubmitForEvent:
    def test_creates_attendance_record(self, tenant, class_count_admin_user, past_event):
        from rest_framework.test import APIRequestFactory

        factory = APIRequestFactory()
        request = factory.post("/api/v1/attendance/records/submit-for-event/", {
            "event": past_event.pk,
            "count": 15,
        }, format="json")
        request.user = class_count_admin_user
        request.tenant = tenant

        from apps.attendance.views import AttendanceRecordViewSet
        view = AttendanceRecordViewSet.as_view({"post": "submit_for_event"})
        response = view(request)

        assert response.status_code == 201
        record = AttendanceRecord.objects.get(timetable_event=past_event)
        assert record.count == 15
        assert record.recorded_by == class_count_admin_user

    def test_transitions_scheduled_event_to_completed(self, tenant, class_count_admin_user, past_event):
        from rest_framework.test import APIRequestFactory

        assert past_event.status == TimetableEvent.Status.SCHEDULED

        factory = APIRequestFactory()
        request = factory.post("/api/v1/attendance/records/submit-for-event/", {
            "event": past_event.pk,
            "count": 10,
        }, format="json")
        request.user = class_count_admin_user
        request.tenant = tenant

        from apps.attendance.views import AttendanceRecordViewSet
        view = AttendanceRecordViewSet.as_view({"post": "submit_for_event"})
        view(request)

        past_event.refresh_from_db()
        assert past_event.status == TimetableEvent.Status.COMPLETED

    def test_updates_existing_record_via_update_or_create(self, tenant, class_count_admin_user, past_event):
        from rest_framework.test import APIRequestFactory

        AttendanceRecord.objects.create(
            tenant=tenant,
            timetable_event=past_event,
            count=5,
            recorded_by=class_count_admin_user,
        )

        factory = APIRequestFactory()
        request = factory.post("/api/v1/attendance/records/submit-for-event/", {
            "event": past_event.pk,
            "count": 20,
        }, format="json")
        request.user = class_count_admin_user
        request.tenant = tenant

        from apps.attendance.views import AttendanceRecordViewSet
        view = AttendanceRecordViewSet.as_view({"post": "submit_for_event"})
        response = view(request)

        assert response.status_code == 200
        assert AttendanceRecord.objects.filter(timetable_event=past_event).count() == 1
        record = AttendanceRecord.objects.get(timetable_event=past_event)
        assert record.count == 20

    def test_missing_count_returns_400(self, tenant, class_count_admin_user, past_event):
        from rest_framework.test import APIRequestFactory

        factory = APIRequestFactory()
        request = factory.post("/api/v1/attendance/records/submit-for-event/", {
            "event": past_event.pk,
        }, format="json")
        request.user = class_count_admin_user
        request.tenant = tenant

        from apps.attendance.views import AttendanceRecordViewSet
        view = AttendanceRecordViewSet.as_view({"post": "submit_for_event"})
        response = view(request)

        assert response.status_code == 400

    def test_nonexistent_event_returns_404(self, tenant, class_count_admin_user):
        from rest_framework.test import APIRequestFactory

        factory = APIRequestFactory()
        request = factory.post("/api/v1/attendance/records/submit-for-event/", {
            "event": 999999,
            "count": 10,
        }, format="json")
        request.user = class_count_admin_user
        request.tenant = tenant

        from apps.attendance.views import AttendanceRecordViewSet
        view = AttendanceRecordViewSet.as_view({"post": "submit_for_event"})
        response = view(request)

        assert response.status_code == 404


# ---------------------------------------------------------------------------
# _list_awaiting
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestListAwaiting:
    def test_returns_events_without_attendance(self, tenant, class_count_admin_user, past_event):
        from rest_framework.test import APIRequestFactory

        factory = APIRequestFactory()
        request = factory.get("/api/v1/attendance/records/?awaiting=true")
        request.user = class_count_admin_user
        request.tenant = tenant

        from apps.attendance.views import AttendanceRecordViewSet
        view = AttendanceRecordViewSet.as_view({"get": "list"})
        response = view(request)

        assert response.status_code == 200
        event_ids = [item["event"] for item in response.data]
        assert past_event.pk in event_ids

    def test_excludes_events_with_attendance(self, tenant, class_count_admin_user, past_event):
        from rest_framework.test import APIRequestFactory

        AttendanceRecord.objects.create(
            tenant=tenant,
            timetable_event=past_event,
            count=10,
            recorded_by=class_count_admin_user,
        )

        factory = APIRequestFactory()
        request = factory.get("/api/v1/attendance/records/?awaiting=true")
        request.user = class_count_admin_user
        request.tenant = tenant

        from apps.attendance.views import AttendanceRecordViewSet
        view = AttendanceRecordViewSet.as_view({"get": "list"})
        response = view(request)

        event_ids = [item["event"] for item in response.data]
        assert past_event.pk not in event_ids

    def test_excludes_cancelled_events(self, tenant, class_count_admin_user, class_type, instructor):
        start = timezone.now() - timedelta(hours=3)
        cancelled_event = TimetableEventFactory(
            tenant=tenant,
            class_type=class_type,
            instructor=instructor,
            start_datetime=start,
            end_datetime=start + timedelta(hours=1),
            status="cancelled",
        )

        from rest_framework.test import APIRequestFactory

        factory = APIRequestFactory()
        request = factory.get("/api/v1/attendance/records/?awaiting=true")
        request.user = class_count_admin_user
        request.tenant = tenant

        from apps.attendance.views import AttendanceRecordViewSet
        view = AttendanceRecordViewSet.as_view({"get": "list"})
        response = view(request)

        event_ids = [item["event"] for item in response.data]
        assert cancelled_event.pk not in event_ids

    def test_excludes_future_events(self, tenant, class_count_admin_user, future_event):
        from rest_framework.test import APIRequestFactory

        factory = APIRequestFactory()
        request = factory.get("/api/v1/attendance/records/?awaiting=true")
        request.user = class_count_admin_user
        request.tenant = tenant

        from apps.attendance.views import AttendanceRecordViewSet
        view = AttendanceRecordViewSet.as_view({"get": "list"})
        response = view(request)

        event_ids = [item["event"] for item in response.data]
        assert future_event.pk not in event_ids

    def test_count_only_returns_count(self, tenant, class_count_admin_user, past_event):
        from rest_framework.test import APIRequestFactory

        factory = APIRequestFactory()
        request = factory.get("/api/v1/attendance/records/?awaiting=true&count_only=true")
        request.user = class_count_admin_user
        request.tenant = tenant

        from apps.attendance.views import AttendanceRecordViewSet
        view = AttendanceRecordViewSet.as_view({"get": "list"})
        response = view(request)

        assert response.status_code == 200
        assert "count" in response.data
        assert response.data["count"] >= 1

    def test_date_range_filtering(self, tenant, class_count_admin_user, class_type, instructor):
        old_start = timezone.now() - timedelta(days=30)
        old_event = TimetableEventFactory(
            tenant=tenant,
            class_type=class_type,
            instructor=instructor,
            start_datetime=old_start,
            end_datetime=old_start + timedelta(hours=1),
            status="completed",
        )

        from rest_framework.test import APIRequestFactory

        from_dt = (timezone.now() - timedelta(days=1)).isoformat()
        to_dt = timezone.now().isoformat()

        factory = APIRequestFactory()
        request = factory.get(
            f"/api/v1/attendance/records/?awaiting=true&from_datetime={from_dt}&to_datetime={to_dt}"
        )
        request.user = class_count_admin_user
        request.tenant = tenant

        from apps.attendance.views import AttendanceRecordViewSet
        view = AttendanceRecordViewSet.as_view({"get": "list"})
        response = view(request)

        event_ids = [item["event"] for item in response.data]
        assert old_event.pk not in event_ids


# ---------------------------------------------------------------------------
# QR Token Submit
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestQRTokenSubmit:
    def _create_token(self, event, expired=False, used=False):
        expires_at = timezone.now() + (timedelta(hours=-1) if expired else timedelta(hours=2))
        return QRAttendanceToken.objects.create(
            timetable_event=event,
            expires_at=expires_at,
            is_used=used,
        )

    def test_valid_token_creates_attendance(self, tenant, past_event):
        token = self._create_token(past_event)

        from rest_framework.test import APIRequestFactory
        factory = APIRequestFactory()
        request = factory.post("/api/v1/attendance/qr-tokens/submit/", {
            "token": token.token,
            "count": 12,
        }, format="json")
        request.user = AnonymousUser()
        request.tenant = tenant

        from apps.attendance.views import QRAttendanceTokenViewSet
        view = QRAttendanceTokenViewSet.as_view({"post": "submit"})
        response = view(request)

        assert response.status_code == 201
        record = AttendanceRecord.objects.get(timetable_event=past_event)
        assert record.count == 12

        token.refresh_from_db()
        assert token.is_used is True

    def test_expired_token_returns_400(self, tenant, past_event):
        token = self._create_token(past_event, expired=True)

        from rest_framework.test import APIRequestFactory
        factory = APIRequestFactory()
        request = factory.post("/api/v1/attendance/qr-tokens/submit/", {
            "token": token.token,
            "count": 10,
        }, format="json")
        request.user = AnonymousUser()
        request.tenant = tenant

        from apps.attendance.views import QRAttendanceTokenViewSet
        view = QRAttendanceTokenViewSet.as_view({"post": "submit"})
        response = view(request)

        assert response.status_code == 400

    def test_used_token_returns_400(self, tenant, past_event):
        token = self._create_token(past_event, used=True)

        from rest_framework.test import APIRequestFactory
        factory = APIRequestFactory()
        request = factory.post("/api/v1/attendance/qr-tokens/submit/", {
            "token": token.token,
            "count": 10,
        }, format="json")
        request.user = AnonymousUser()
        request.tenant = tenant

        from apps.attendance.views import QRAttendanceTokenViewSet
        view = QRAttendanceTokenViewSet.as_view({"post": "submit"})
        response = view(request)

        assert response.status_code == 400

    def test_invalid_token_returns_404(self, tenant):
        from rest_framework.test import APIRequestFactory
        factory = APIRequestFactory()
        request = factory.post("/api/v1/attendance/qr-tokens/submit/", {
            "token": "totally-invalid-token",
            "count": 10,
        }, format="json")
        request.user = AnonymousUser()
        request.tenant = tenant

        from apps.attendance.views import QRAttendanceTokenViewSet
        view = QRAttendanceTokenViewSet.as_view({"post": "submit"})
        response = view(request)

        assert response.status_code == 404

    def test_valid_token_transitions_event_to_completed(self, tenant, past_event):
        token = self._create_token(past_event)
        assert past_event.status == TimetableEvent.Status.SCHEDULED

        from rest_framework.test import APIRequestFactory
        factory = APIRequestFactory()
        request = factory.post("/api/v1/attendance/qr-tokens/submit/", {
            "token": token.token,
            "count": 8,
        }, format="json")
        request.user = AnonymousUser()
        request.tenant = tenant

        from apps.attendance.views import QRAttendanceTokenViewSet
        view = QRAttendanceTokenViewSet.as_view({"post": "submit"})
        view(request)

        past_event.refresh_from_db()
        assert past_event.status == TimetableEvent.Status.COMPLETED
