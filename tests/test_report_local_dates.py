"""
Report date ranges are the gym's local calendar days, not UTC days.

A 9am class in Auckland (UTC+13 in November) starts at 20:00 UTC the day
before. Filtering on ``start_datetime__date`` put it in the previous day — and
a 9am class on the 1st of the month in the previous month.
"""

from datetime import datetime, timedelta
from unittest import mock
from zoneinfo import ZoneInfo

import pytest
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.attendance.models import AttendanceRecord
from apps.cover.models import CoverRequest
from apps.reports.views import (
    AttendanceReportView,
    ClassesReportView,
    ClassViabilityReportView,
    CoverReportView,
    InstructorChartsReportView,
    InstructorReliabilityReportView,
    UnrecordedAttendanceReportView,
)
from tests.factories import (
    ClassTypeFactory,
    StaffProfileFactory,
    TenantFactory,
    TenantSettingsFactory,
    TimetableEventFactory,
    UserFactory,
)

NZ = ZoneInfo("Pacific/Auckland")


@pytest.fixture
def nz_gym(db):
    tenant = TenantFactory(slug="nz-gym")
    TenantSettingsFactory(tenant=tenant, timezone="Pacific/Auckland")
    return tenant


@pytest.fixture
def nz_manager(nz_gym):
    return UserFactory(tenant=nz_gym, role="gym_manager")


@pytest.fixture
def nz_instructor(nz_gym):
    return StaffProfileFactory(tenant=nz_gym, name="Kiri")


@pytest.fixture
def nz_class_type(nz_gym):
    return ClassTypeFactory(tenant=nz_gym, name="Spin", green_threshold=10)


def _nz_class(tenant, class_type, instructor, local_start, *, record=True, status="completed"):
    """A one-hour class at ``local_start`` (Auckland wall-clock time)."""
    start = local_start.replace(tzinfo=NZ)
    event = TimetableEventFactory(
        tenant=tenant,
        class_type=class_type,
        instructor=instructor,
        start_datetime=start,
        end_datetime=start + timedelta(hours=1),
        status=status,
    )
    if record:
        AttendanceRecord.objects.create(tenant=tenant, timetable_event=event, count=12)
    return event


def _get(view, url, user, tenant):
    request = APIRequestFactory().get(url)
    force_authenticate(request, user=user)
    request.tenant = tenant
    response = view.as_view()(request)
    assert response.status_code == 200, response.data
    return response.data


# Each endpoint, and how many classes (or cover requests) it counted.
def _attendance(data, **_):
    return data["total_classes"]


def _reliability(data, instructor, **_):
    return sum(r["total_classes"] for r in data if r["instructor_id"] == instructor.id)


def _charts(data, **_):
    return len(data["avg_attendance_per_class"])


def _classes(data, **_):
    return sum(r["total_classes"] for r in data["by_class_type"])


def _viability(data, **_):
    return sum(r["total_classes"] for r in data["by_class_type"])


ENDPOINTS = [
    pytest.param(AttendanceReportView, "attendance", _attendance, id="attendance"),
    pytest.param(InstructorReliabilityReportView, "instructor-reliability", _reliability, id="reliability"),
    pytest.param(InstructorChartsReportView, "instructor-charts", _charts, id="instructor-charts"),
    pytest.param(ClassesReportView, "classes", _classes, id="classes"),
    pytest.param(ClassViabilityReportView, "class-viability", _viability, id="viability"),
]


def _url(slug, from_date, to_date, instructor):
    url = f"/api/v1/reports/{slug}/?from={from_date}&to={to_date}"
    if slug == "instructor-charts":
        url += f"&instructor={instructor.id}"
    return url


@pytest.mark.django_db
class TestClassCountsOnItsLocalDay:
    @pytest.mark.parametrize("view, slug, count", ENDPOINTS)
    def test_9am_class_counts_on_its_local_day(
        self, view, slug, count, nz_gym, nz_manager, nz_instructor, nz_class_type
    ):
        # 9am Tue 3 Nov 2025 in Auckland = 20:00 UTC Mon 2 Nov.
        _nz_class(nz_gym, nz_class_type, nz_instructor, datetime(2025, 11, 3, 9, 0))

        on_day = _get(view, _url(slug, "2025-11-03", "2025-11-03", nz_instructor), nz_manager, nz_gym)
        day_before = _get(view, _url(slug, "2025-11-02", "2025-11-02", nz_instructor), nz_manager, nz_gym)

        assert count(on_day, instructor=nz_instructor) == 1
        assert count(day_before, instructor=nz_instructor) == 0

    @pytest.mark.parametrize("view, slug, count", ENDPOINTS)
    def test_9am_on_the_1st_counts_in_that_month(
        self, view, slug, count, nz_gym, nz_manager, nz_instructor, nz_class_type
    ):
        # 9am 1 Dec 2025 in Auckland = 20:00 UTC 30 Nov.
        _nz_class(nz_gym, nz_class_type, nz_instructor, datetime(2025, 12, 1, 9, 0))

        december = _get(view, _url(slug, "2025-12-01", "2025-12-31", nz_instructor), nz_manager, nz_gym)
        november = _get(view, _url(slug, "2025-11-01", "2025-11-30", nz_instructor), nz_manager, nz_gym)

        assert count(december, instructor=nz_instructor) == 1
        assert count(november, instructor=nz_instructor) == 0

    def test_late_class_on_last_day_stays_in_that_month(
        self, nz_gym, nz_manager, nz_instructor, nz_class_type
    ):
        # 11:30pm 30 Nov in Auckland = 10:30 UTC 30 Nov: same date either way,
        # but the range end must still include the whole local day.
        _nz_class(nz_gym, nz_class_type, nz_instructor, datetime(2025, 11, 30, 23, 30))

        november = _get(AttendanceReportView, _url("attendance", "2025-11-01", "2025-11-30", None),
                        nz_manager, nz_gym)
        december = _get(AttendanceReportView, _url("attendance", "2025-12-01", "2025-12-31", None),
                        nz_manager, nz_gym)

        assert november["total_classes"] == 1
        assert december["total_classes"] == 0

    def test_viability_pending_uses_local_day(self, nz_gym, nz_manager, nz_instructor, nz_class_type):
        _nz_class(nz_gym, nz_class_type, nz_instructor, datetime(2025, 11, 3, 9, 0),
                  record=False, status="scheduled")

        on_day = _get(ClassViabilityReportView, _url("class-viability", "2025-11-03", "2025-11-03", None),
                      nz_manager, nz_gym)
        day_before = _get(ClassViabilityReportView, _url("class-viability", "2025-11-02", "2025-11-02", None),
                          nz_manager, nz_gym)

        assert on_day["overall_snapshot"]["pending"] == 1
        assert day_before["overall_snapshot"]["pending"] == 0

    def test_viability_open_ended_ranges_use_local_day(
        self, nz_gym, nz_manager, nz_instructor, nz_class_type
    ):
        _nz_class(nz_gym, nz_class_type, nz_instructor, datetime(2025, 11, 3, 9, 0))

        from_day = _get(ClassViabilityReportView, "/api/v1/reports/class-viability/?from=2025-11-03",
                        nz_manager, nz_gym)
        to_day_before = _get(ClassViabilityReportView, "/api/v1/reports/class-viability/?to=2025-11-02",
                             nz_manager, nz_gym)

        assert _viability(from_day) == 1
        assert _viability(to_day_before) == 0

    def test_unrecorded_uses_local_day(self, nz_gym, nz_manager, nz_instructor, nz_class_type):
        _nz_class(nz_gym, nz_class_type, nz_instructor, datetime(2025, 11, 3, 9, 0),
                  record=False, status="scheduled")

        on_day = _get(UnrecordedAttendanceReportView, _url("unrecorded", "2025-11-03", "2025-11-03", None),
                      nz_manager, nz_gym)
        day_before = _get(UnrecordedAttendanceReportView, _url("unrecorded", "2025-11-02", "2025-11-02", None),
                          nz_manager, nz_gym)

        assert on_day["total"] == 1
        assert day_before["total"] == 0

    def test_cover_request_counts_on_local_day_it_was_raised(self, nz_gym, nz_manager, nz_class_type):
        event = _nz_class(nz_gym, nz_class_type, None, datetime(2025, 11, 5, 9, 0), record=False)
        cover = CoverRequest.objects.create(tenant=nz_gym, timetable_event=event)
        # Raised at 8am 3 Nov in Auckland = 19:00 UTC 2 Nov.
        CoverRequest.objects.filter(pk=cover.pk).update(
            created_at=datetime(2025, 11, 3, 8, 0, tzinfo=NZ)
        )

        on_day = _get(CoverReportView, _url("cover", "2025-11-03", "2025-11-03", None), nz_manager, nz_gym)
        day_before = _get(CoverReportView, _url("cover", "2025-11-02", "2025-11-02", None), nz_manager, nz_gym)

        assert sum(s["count"] for s in on_day["by_status"]) == 1
        assert sum(s["count"] for s in day_before["by_status"]) == 0


@pytest.mark.django_db
def test_default_range_is_this_month_at_the_gym(nz_gym, nz_manager, nz_instructor, nz_class_type):
    """With no dates, the range is the gym's current month up to its today.

    At 20:30 UTC on 31 Oct it is already 9:30am on 1 Nov in Auckland, so the
    default range is 1 Nov–1 Nov and the 9am class is in it.
    """
    _nz_class(nz_gym, nz_class_type, nz_instructor, datetime(2025, 11, 1, 9, 0))
    frozen_now = datetime(2025, 10, 31, 20, 30, tzinfo=ZoneInfo("UTC"))

    with mock.patch("django.utils.timezone.now", return_value=frozen_now):
        data = _get(AttendanceReportView, "/api/v1/reports/attendance/", nz_manager, nz_gym)

    assert data["from_date"] == "2025-11-01"
    assert data["to_date"] == "2025-11-01"
    assert data["total_classes"] == 1
