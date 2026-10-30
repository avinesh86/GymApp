"""
Viability colours: one rule, used everywhere, with thresholds that mean
"the count this colour starts at".

The bug: Settings labelled the boxes "Red (below) 9, Amber (below) 20,
Green (below) 30, Purple (above) 30" and the gym read that as red 0-8, amber
9-19, green 20-29, purple 30+. The timetable ignored Red and read Amber as where
amber *starts*, so a Sprint class of 10 showed red. The reports used a third
reading again.
"""

from datetime import timedelta

import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.attendance.models import AttendanceRecord
from apps.reports.views import AttendanceReportView, ClassViabilityReportView
from apps.timetable.serializers import TimetableEventSerializer
from apps.timetable.viability import viability_colour
from apps.timetable.views import ClassTypeViewSet
from tests.factories import ClassTypeFactory, TimetableEventFactory

BEFORE = ("timetable", "0007_recurringtimetablerule_capacity")
AFTER = ("timetable", "0008_viability_thresholds_start_at")


# ---------------------------------------------------------------------------
# The rule
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("count, colour", [
    (0, "red"), (8, "red"),
    (9, "amber"), (10, "amber"), (19, "amber"),
    (20, "green"), (29, "green"),
    (30, "purple"), (45, "purple"),
    (None, "pending"),
])
def test_sprint_colours(count, colour):
    # Sprint: amber starts at 9, green at 20, purple at 30.
    assert viability_colour(count, 9, 20, 30) == colour


# ---------------------------------------------------------------------------
# Converting the numbers gyms already saved
# ---------------------------------------------------------------------------

@pytest.mark.django_db(transaction=True)
def test_migration_keeps_what_the_gym_meant(tenant):
    executor = MigrationExecutor(connection)
    executor.migrate([BEFORE])
    ClassType = executor.loader.project_state(BEFORE).apps.get_model("timetable", "ClassType")

    # As saved through the old "(below)" boxes.
    sprint = ClassType.objects.create(
        tenant_id=tenant.id, name="Les Mills Sprint",
        red_threshold=9, amber_threshold=20, green_threshold=30, purple_threshold=30,
    )
    virtual = ClassType.objects.create(
        tenant_id=tenant.id, name="Virtual RPM",
        red_threshold=0, amber_threshold=3, green_threshold=5, purple_threshold=5,
    )

    try:
        executor = MigrationExecutor(connection)
        executor.migrate([AFTER])
        ClassTypeNew = executor.loader.project_state(AFTER).apps.get_model("timetable", "ClassType")

        s = ClassTypeNew.objects.get(pk=sprint.pk)
        assert (s.amber_threshold, s.green_threshold, s.purple_threshold) == (9, 20, 30)
        # The reported case: 10 people at Sprint is amber, not red.
        assert viability_colour(10, s.amber_threshold, s.green_threshold, s.purple_threshold) == "amber"

        # Red 0 could never be red. Amber now starts at 1, so nobody is red.
        v = ClassTypeNew.objects.get(pk=virtual.pk)
        assert (v.amber_threshold, v.green_threshold, v.purple_threshold) == (1, 3, 5)
        assert viability_colour(0, v.amber_threshold, v.green_threshold, v.purple_threshold) == "red"
    finally:
        MigrationExecutor(connection).migrate([AFTER])


# ---------------------------------------------------------------------------
# Timetable and reports agree
# ---------------------------------------------------------------------------

@pytest.fixture
def sprint(tenant):
    return ClassTypeFactory(
        tenant=tenant, name="Les Mills Sprint",
        amber_threshold=9, green_threshold=20, purple_threshold=30,
    )


def _class_with(tenant, class_type, instructor, count):
    start = timezone.now() - timedelta(hours=2)
    event = TimetableEventFactory(
        tenant=tenant, class_type=class_type, instructor=instructor,
        start_datetime=start, end_datetime=start + timedelta(hours=1), status="completed",
    )
    AttendanceRecord.objects.create(tenant=tenant, timetable_event=event, count=count)
    return event


def _get(view, url, user, tenant):
    request = APIRequestFactory().get(url)
    force_authenticate(request, user=user)
    request.tenant = tenant
    return view.as_view()(request)


@pytest.mark.django_db
def test_timetable_shows_ten_at_sprint_as_amber(tenant, sprint, instructor):
    event = _class_with(tenant, sprint, instructor, 10)
    assert TimetableEventSerializer(event).data["viability_color"] == "amber"


@pytest.mark.django_db
def test_viability_report_counts_low_classes_as_red(tenant, manager_user, sprint, instructor):
    # Classes below the old Red number used to fall out of every bucket, so a
    # class of 2 counted towards no colour at all.
    _class_with(tenant, sprint, instructor, 2)
    _class_with(tenant, sprint, instructor, 10)

    response = _get(ClassViabilityReportView, "/api/v1/reports/class-viability/", manager_user, tenant)

    row = next(r for r in response.data["by_class_type"] if r["class_type_name"] == "Les Mills Sprint")
    assert (row["red_count"], row["amber_count"], row["green_count"], row["purple_count"]) == (1, 1, 0, 0)


@pytest.mark.django_db
def test_attendance_calendar_uses_the_class_colour(tenant, manager_user, sprint, instructor):
    # The calendar used fixed cut-offs for every class; it now carries the
    # same colour as the timetable.
    _class_with(tenant, sprint, instructor, 10)
    today = timezone.now().date()
    response = _get(
        AttendanceReportView,
        f"/api/v1/reports/attendance/?from={(today - timedelta(days=1)).isoformat()}&to={today.isoformat()}",
        manager_user, tenant,
    )

    events = [e for day in response.data["daily_breakdown"] for e in day["events"]]
    assert [e["viability_color"] for e in events] == ["amber"]


# ---------------------------------------------------------------------------
# Saving thresholds
# ---------------------------------------------------------------------------

def _patch(user, tenant, class_type, data):
    request = APIRequestFactory().patch(f"/api/v1/timetable/class-types/{class_type.id}/", data, format="json")
    force_authenticate(request, user=user)
    request.tenant = tenant
    return ClassTypeViewSet.as_view({"patch": "partial_update"})(request, pk=class_type.id)


@pytest.mark.django_db
def test_saves_thresholds_that_climb(tenant, manager_user, sprint):
    response = _patch(manager_user, tenant, sprint, {"amber_threshold": 10, "green_threshold": 20, "purple_threshold": 30})
    assert response.status_code == 200
    sprint.refresh_from_db()
    assert sprint.amber_threshold == 10


@pytest.mark.django_db
@pytest.mark.parametrize("data, field", [
    ({"amber_threshold": 0}, "amber_threshold"),
    ({"green_threshold": 5}, "green_threshold"),
    ({"purple_threshold": 15}, "purple_threshold"),
])
def test_rejects_thresholds_that_go_backwards(tenant, manager_user, sprint, data, field):
    response = _patch(manager_user, tenant, sprint, data)
    assert response.status_code == 400
    assert field in response.data["detail"]
