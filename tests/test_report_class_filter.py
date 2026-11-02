"""
Reports: choosing which classes count, only counting classes that happened,
and listing the ones nobody recorded.

- A gym can untick class types (Virtual, Family Swim…) and the Attendance,
  Classes and Viability reports leave them out. The choice is shared by every
  manager and kept until changed. Payroll doesn't read it.
- Future classes are not "classes" yet: they no longer inflate totals,
  dilute cancellation rates or count as pending.
- Past classes with no count are left out of averages and listed by slot so
  repeat gaps stand out.
"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.attendance.models import AttendanceRecord
from apps.reports.class_filter import ReportClassFilterView
from apps.reports.views import (
    AttendanceReportView,
    ClassesReportView,
    ClassViabilityReportView,
    UnrecordedAttendanceReportView,
)
from apps.tenants.models import TenantSettings
from tests.factories import ClassTypeFactory, TimetableEventFactory

pytestmark = pytest.mark.django_db


def _call(view, method, url, user, tenant, data=None):
    factory = APIRequestFactory()
    request = getattr(factory, method)(url, data, format="json") if data is not None else getattr(factory, method)(url)
    force_authenticate(request, user=user)
    request.tenant = tenant
    return view.as_view()(request)


def _class(tenant, class_type, start, count=None, status="completed", instructor=None):
    event = TimetableEventFactory(
        tenant=tenant, class_type=class_type, instructor=instructor,
        start_datetime=start, end_datetime=start + timedelta(hours=1), status=status,
    )
    if count is not None:
        AttendanceRecord.objects.create(tenant=tenant, timetable_event=event, count=count)
    return event


def _range():
    today = timezone.now().date()
    return (today - timedelta(days=20)).isoformat(), (today + timedelta(days=20)).isoformat()


@pytest.fixture
def spin(tenant):
    return ClassTypeFactory(tenant=tenant, name="Spin")


@pytest.fixture
def virtual(tenant):
    return ClassTypeFactory(tenant=tenant, name="Virtual RPM")


def _exclude(tenant, *class_types):
    settings_obj, _ = TenantSettings.objects.get_or_create(tenant=tenant)
    settings_obj.report_excluded_class_types = [ct.id for ct in class_types]
    settings_obj.save()


# ---------------------------------------------------------------------------
# Saving the selection
# ---------------------------------------------------------------------------

def test_selection_is_saved_for_the_gym(tenant, manager_user, owner_user, virtual):
    url = "/api/v1/reports/class-filter/"
    assert _call(ReportClassFilterView, "get", url, manager_user, tenant).data == {"excluded_class_types": []}

    response = _call(ReportClassFilterView, "put", url, manager_user, tenant, {"excluded_class_types": [virtual.id]})
    assert response.status_code == 200

    # Another manager sees the same choice.
    assert _call(ReportClassFilterView, "get", url, owner_user, tenant).data == {"excluded_class_types": [virtual.id]}


def test_cannot_exclude_another_gyms_class(tenant, other_tenant, manager_user):
    theirs = ClassTypeFactory(tenant=other_tenant, name="Theirs")
    response = _call(
        ReportClassFilterView, "put", "/api/v1/reports/class-filter/", manager_user, tenant,
        {"excluded_class_types": [theirs.id]},
    )
    assert response.status_code == 400


def test_instructors_cannot_change_it(tenant, instructor_user, virtual):
    response = _call(
        ReportClassFilterView, "put", "/api/v1/reports/class-filter/", instructor_user, tenant,
        {"excluded_class_types": [virtual.id]},
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Attendance report
# ---------------------------------------------------------------------------

def test_attendance_counts_only_held_classes_and_honours_the_selection(tenant, manager_user, spin, virtual):
    now = timezone.now()
    _class(tenant, spin, now - timedelta(days=2), count=10)
    _class(tenant, spin, now - timedelta(days=1), count=None)                  # held, not recorded
    _class(tenant, spin, now - timedelta(days=3), status="cancelled")          # not held
    _class(tenant, spin, now + timedelta(days=2), status="scheduled")          # future
    _class(tenant, virtual, now - timedelta(days=2), count=2)
    _exclude(tenant, virtual)

    frm, to = _range()
    data = _call(AttendanceReportView, "get", f"/api/v1/reports/attendance/?from={frm}&to={to}", manager_user, tenant).data

    assert data["total_classes"] == 2               # was 4: future and cancelled counted
    assert data["classes_with_attendance"] == 1
    assert data["classes_without_attendance"] == 1
    assert data["avg_attendance"] == 10.0           # Virtual's 2 and the unrecorded class don't drag it down
    assert [c["class_type_name"] for c in data["by_class_type"]] == ["Spin"]


def test_attendance_by_day_uses_the_gyms_day(tenant, manager_user, spin):
    # Monday 6am in Sydney is Sunday evening in UTC.
    sydney = ZoneInfo("Australia/Sydney")
    TenantSettings.objects.update_or_create(tenant=tenant, defaults={"timezone": "Australia/Sydney"})
    today = timezone.now().astimezone(sydney).date()
    last_monday = today - timedelta(days=today.weekday() + 7)
    _class(tenant, spin, datetime.combine(last_monday, datetime.min.time().replace(hour=6), tzinfo=sydney), count=12)

    frm, to = _range()
    data = _call(AttendanceReportView, "get", f"/api/v1/reports/attendance/?from={frm}&to={to}", manager_user, tenant).data

    assert [d["day"] for d in data["by_day_of_week"]] == ["Mon"]
    assert [s["slot"] for s in data["by_time_slot"]] == ["Early (6-9am)"]


# ---------------------------------------------------------------------------
# Classes and Viability reports
# ---------------------------------------------------------------------------

def test_classes_report_ignores_future_classes(tenant, manager_user, spin, virtual):
    now = timezone.now()
    _class(tenant, spin, now - timedelta(days=2), count=10)
    _class(tenant, spin, now - timedelta(days=1), status="cancelled")
    _class(tenant, spin, now - timedelta(hours=5), count=None)
    for days in (1, 2, 3, 4):
        _class(tenant, spin, now + timedelta(days=days), status="scheduled")
    _class(tenant, virtual, now - timedelta(days=2), count=3)
    _exclude(tenant, virtual)

    frm, to = _range()
    data = _call(ClassesReportView, "get", f"/api/v1/reports/classes/?from={frm}&to={to}", manager_user, tenant).data

    [row] = data["by_class_type"]
    assert row["class_type_name"] == "Spin"
    assert row["total_classes"] == 3                # was 7 with the four future classes
    assert row["cancellation_percentage"] == 33.3   # was 14.3
    assert (row["recorded_classes"], row["unrecorded_classes"]) == (1, 1)


def test_viability_pending_is_only_past_classes(tenant, manager_user, spin, virtual):
    now = timezone.now()
    _class(tenant, spin, now - timedelta(days=1), count=None)
    _class(tenant, spin, now + timedelta(days=1), status="scheduled")
    _class(tenant, virtual, now - timedelta(days=1), count=None)
    _exclude(tenant, virtual)

    data = _call(ClassViabilityReportView, "get", "/api/v1/reports/class-viability/", manager_user, tenant).data

    assert data["overall_snapshot"]["pending"] == 1
    assert "Virtual RPM" not in [r["class_type_name"] for r in data["by_class_type"]]


# ---------------------------------------------------------------------------
# No attendance recorded
# ---------------------------------------------------------------------------

def test_unrecorded_groups_repeat_gaps_by_slot(tenant, manager_user, spin, virtual, instructor):
    sydney = ZoneInfo("Australia/Sydney")
    TenantSettings.objects.update_or_create(tenant=tenant, defaults={"timezone": "Australia/Sydney"})
    today = timezone.now().astimezone(sydney).date()
    monday = today - timedelta(days=today.weekday() + 7)

    def mon(weeks_ago, hour=8, minute=30):
        d = monday - timedelta(weeks=weeks_ago)
        return datetime.combine(d, datetime.min.time().replace(hour=hour, minute=minute), tzinfo=sydney)

    _class(tenant, spin, mon(0), count=None, instructor=instructor)
    _class(tenant, spin, mon(1), count=None, instructor=instructor)
    _class(tenant, spin, mon(2), count=14, instructor=instructor)          # recorded: held, not missed
    _class(tenant, spin, mon(0, hour=18), count=None)                       # another slot
    _class(tenant, spin, timezone.now() + timedelta(days=1), status="scheduled")  # future: not missed
    _class(tenant, spin, mon(1, hour=18), status="cancelled")               # cancelled: not missed
    _class(tenant, virtual, mon(0), count=None)                             # excluded class type
    _exclude(tenant, virtual)

    today_iso = timezone.now().date()
    frm, to = (today_iso - timedelta(days=30)).isoformat(), (today_iso + timedelta(days=5)).isoformat()
    data = _call(UnrecordedAttendanceReportView, "get", f"/api/v1/reports/unrecorded/?from={frm}&to={to}", manager_user, tenant).data

    assert data["total"] == 3
    first, second = data["by_slot"]
    assert (first["class_name"], first["day"], first["missed"], first["held"]) == ("Spin", "Mon", 2, 3)
    assert first["time"] == "08:30"
    assert first["instructors"] == [{"name": instructor.name, "missed": 2}]
    assert (second["missed"], second["held"]) == (1, 1)
    assert second["instructors"] == [{"name": "Unassigned", "missed": 1}]
