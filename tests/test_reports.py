"""
Tests for report views: correct response shape, empty data handling, tenant scoping.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.attendance.models import AttendanceRecord
from apps.invoices.models import Invoice
from apps.reports.views import (
    AttendanceReportView,
    ClassesReportView,
    ClassViabilityReportView,
    CoverReportView,
    InstructorChartsReportView,
    InstructorReliabilityReportView,
    PayrollReportView,
)
from tests.factories import (
    AttendanceRecordFactory,
    ClassTypeFactory,
    InvoiceFactory,
    StaffProfileFactory,
    TimetableEventFactory,
)


def _make_request(url, user, tenant):
    factory = APIRequestFactory()
    request = factory.get(url)
    force_authenticate(request, user=user)
    request.tenant = tenant
    return request


# ---------------------------------------------------------------------------
# AttendanceReportView
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestAttendanceReport:
    def test_returns_correct_shape(self, tenant, manager_user, class_type, instructor):
        start = timezone.now() - timedelta(hours=2)
        event = TimetableEventFactory(
            tenant=tenant,
            class_type=class_type,
            instructor=instructor,
            start_datetime=start,
            end_datetime=start + timedelta(hours=1),
            status="completed",
        )
        AttendanceRecord.objects.create(
            tenant=tenant, timetable_event=event, count=12,
        )

        from_date = (date.today() - timedelta(days=7)).isoformat()
        to_date = date.today().isoformat()
        request = _make_request(
            f"/api/v1/reports/attendance/?from={from_date}&to={to_date}",
            manager_user, tenant,
        )

        response = AttendanceReportView.as_view()(request)
        assert response.status_code == 200

        data = response.data
        assert "total_classes" in data
        assert "avg_attendance" in data
        assert "daily_breakdown" in data
        assert "weekly_trend" in data
        assert "by_class_type" in data
        assert "by_day_of_week" in data
        assert "by_time_slot" in data
        assert "class_log" in data

    def test_empty_data_returns_zeros(self, tenant, manager_user):
        from_date = (date.today() - timedelta(days=7)).isoformat()
        to_date = date.today().isoformat()
        request = _make_request(
            f"/api/v1/reports/attendance/?from={from_date}&to={to_date}",
            manager_user, tenant,
        )

        response = AttendanceReportView.as_view()(request)
        assert response.status_code == 200
        assert response.data["total_classes"] == 0
        assert response.data["avg_attendance"] == 0.0

    def test_invalid_date_returns_400(self, tenant, manager_user):
        request = _make_request(
            "/api/v1/reports/attendance/?from=bad-date&to=2025-01-01",
            manager_user, tenant,
        )
        response = AttendanceReportView.as_view()(request)
        assert response.status_code == 400

    def test_scoped_to_tenant(self, tenant, other_tenant, manager_user):
        other_class_type = ClassTypeFactory(tenant=other_tenant, name="Other Yoga")
        other_instructor = StaffProfileFactory(tenant=other_tenant)
        start = timezone.now() - timedelta(hours=2)
        other_event = TimetableEventFactory(
            tenant=other_tenant,
            class_type=other_class_type,
            instructor=other_instructor,
            start_datetime=start,
            end_datetime=start + timedelta(hours=1),
            status="completed",
        )
        AttendanceRecord.objects.create(
            tenant=other_tenant, timetable_event=other_event, count=50,
        )

        from_date = (date.today() - timedelta(days=7)).isoformat()
        to_date = date.today().isoformat()
        request = _make_request(
            f"/api/v1/reports/attendance/?from={from_date}&to={to_date}",
            manager_user, tenant,
        )

        response = AttendanceReportView.as_view()(request)
        assert response.data["total_classes"] == 0


# ---------------------------------------------------------------------------
# InstructorReliabilityReportView
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestInstructorReliabilityReport:
    def test_returns_list(self, tenant, manager_user, class_type, instructor):
        start = timezone.now() - timedelta(hours=2)
        event = TimetableEventFactory(
            tenant=tenant,
            class_type=class_type,
            instructor=instructor,
            start_datetime=start,
            end_datetime=start + timedelta(hours=1),
            status="completed",
        )

        from_date = (date.today() - timedelta(days=7)).isoformat()
        to_date = date.today().isoformat()
        request = _make_request(
            f"/api/v1/reports/instructor-reliability/?from={from_date}&to={to_date}",
            manager_user, tenant,
        )

        response = InstructorReliabilityReportView.as_view()(request)
        assert response.status_code == 200
        assert isinstance(response.data, list)

        if response.data:
            entry = response.data[0]
            assert "instructor_id" in entry
            assert "reliability_score" in entry
            assert "avg_attendance" in entry

    def test_empty_data(self, tenant, manager_user):
        from_date = (date.today() - timedelta(days=7)).isoformat()
        to_date = date.today().isoformat()
        request = _make_request(
            f"/api/v1/reports/instructor-reliability/?from={from_date}&to={to_date}",
            manager_user, tenant,
        )

        response = InstructorReliabilityReportView.as_view()(request)
        assert response.status_code == 200
        assert response.data == []


@pytest.mark.django_db
class TestInstructorChartsReport:
    def test_returns_per_class_and_trend_for_instructor(self, tenant, manager_user, class_type, instructor):
        start = timezone.now() - timedelta(hours=2)
        event = TimetableEventFactory(
            tenant=tenant, class_type=class_type, instructor=instructor,
            start_datetime=start, end_datetime=start + timedelta(hours=1),
            status="completed",
        )
        AttendanceRecord.objects.create(tenant=tenant, timetable_event=event, count=18)

        from_date = (date.today() - timedelta(days=7)).isoformat()
        to_date = date.today().isoformat()
        request = _make_request(
            f"/api/v1/reports/instructor-charts/?from={from_date}&to={to_date}&instructor={instructor.id}",
            manager_user, tenant,
        )

        response = InstructorChartsReportView.as_view()(request)
        assert response.status_code == 200
        assert "avg_attendance_per_class" in response.data
        assert "attendance_trend" in response.data
        per_class = response.data["avg_attendance_per_class"]
        assert per_class and per_class[0]["class_type_name"] == class_type.name
        assert per_class[0]["avg_attendance"] == 18.0
        assert len(response.data["attendance_trend"]) == 1

    def test_empty_without_instructor(self, tenant, manager_user):
        from_date = (date.today() - timedelta(days=7)).isoformat()
        to_date = date.today().isoformat()
        request = _make_request(
            f"/api/v1/reports/instructor-charts/?from={from_date}&to={to_date}",
            manager_user, tenant,
        )
        response = InstructorChartsReportView.as_view()(request)
        assert response.status_code == 200
        assert response.data == {"avg_attendance_per_class": [], "attendance_trend": []}


# ---------------------------------------------------------------------------
# ClassesReportView
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestClassesReport:
    def test_returns_class_type_stats(self, tenant, manager_user, class_type, instructor):
        start = timezone.now() - timedelta(hours=2)
        event = TimetableEventFactory(
            tenant=tenant,
            class_type=class_type,
            instructor=instructor,
            start_datetime=start,
            end_datetime=start + timedelta(hours=1),
            status="completed",
        )
        AttendanceRecord.objects.create(
            tenant=tenant, timetable_event=event, count=15,
        )

        from_date = (date.today() - timedelta(days=7)).isoformat()
        to_date = date.today().isoformat()
        request = _make_request(
            f"/api/v1/reports/classes/?from={from_date}&to={to_date}",
            manager_user, tenant,
        )

        response = ClassesReportView.as_view()(request)
        assert response.status_code == 200
        assert isinstance(response.data, list)

        if response.data:
            entry = response.data[0]
            assert "class_type_name" in entry
            assert "avg_attendance" in entry
            assert "viability_percentage" in entry


# ---------------------------------------------------------------------------
# PayrollReportView
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestPayrollReport:
    def test_returns_correct_shape(self, tenant, payroll_user, instructor):
        InvoiceFactory(
            tenant=tenant,
            instructor=instructor,
            status="paid",
            total_amount=Decimal("500.00"),
        )

        from_date = (date.today().replace(day=1)).isoformat()
        to_date = date.today().isoformat()
        request = _make_request(
            f"/api/v1/reports/payroll/?from={from_date}&to={to_date}",
            payroll_user, tenant,
        )

        response = PayrollReportView.as_view()(request)
        assert response.status_code == 200

        data = response.data
        assert "total_payroll" in data
        assert "paid_amount" in data
        assert "pending_amount" in data
        assert "period_breakdown" in data
        assert "instructor_breakdown" in data

    def test_empty_data(self, tenant, payroll_user):
        from_date = (date.today().replace(day=1)).isoformat()
        to_date = date.today().isoformat()
        request = _make_request(
            f"/api/v1/reports/payroll/?from={from_date}&to={to_date}",
            payroll_user, tenant,
        )

        response = PayrollReportView.as_view()(request)
        assert response.status_code == 200
        assert Decimal(response.data["total_payroll"]) == Decimal("0")


# ---------------------------------------------------------------------------
# ClassViabilityReportView
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestClassViabilityReport:
    def test_returns_viability_buckets(self, tenant, manager_user, class_type, instructor):
        start = timezone.now() - timedelta(hours=2)
        event = TimetableEventFactory(
            tenant=tenant,
            class_type=class_type,
            instructor=instructor,
            start_datetime=start,
            end_datetime=start + timedelta(hours=1),
            status="completed",
        )
        AttendanceRecord.objects.create(
            tenant=tenant, timetable_event=event, count=12,
        )

        request = _make_request(
            "/api/v1/reports/class-viability/",
            manager_user, tenant,
        )

        response = ClassViabilityReportView.as_view()(request)
        assert response.status_code == 200
        assert isinstance(response.data, list)

        if response.data:
            entry = response.data[0]
            assert "red_count" in entry
            assert "amber_count" in entry
            assert "green_count" in entry
            assert "purple_count" in entry
            assert "viability_percentage" in entry

    def test_no_data_returns_empty(self, tenant, manager_user):
        request = _make_request(
            "/api/v1/reports/class-viability/",
            manager_user, tenant,
        )
        response = ClassViabilityReportView.as_view()(request)
        assert response.status_code == 200
        assert response.data == []


# ---------------------------------------------------------------------------
# CoverReportView
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestCoverReport:
    def test_returns_correct_shape(self, tenant, manager_user):
        from_date = (date.today() - timedelta(days=30)).isoformat()
        to_date = date.today().isoformat()
        request = _make_request(
            f"/api/v1/reports/cover/?from={from_date}&to={to_date}",
            manager_user, tenant,
        )

        response = CoverReportView.as_view()(request)
        assert response.status_code == 200

        data = response.data
        assert "by_status" in data
        assert "by_urgency" in data
