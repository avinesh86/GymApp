"""
Creating a class stores the time the manager typed, in the gym's timezone.

The Add Class form sends naive wall-clock datetimes ("2026-10-06T05:15:00").
DRF made those aware in UTC, so a 5:15am–8:00am Auckland class was saved as
05:15 UTC and rendered as 6:15pm–9:00pm. These tests pin the fix for the
one-off create path, the recurring generator, and the date-range filters that
must still find an early-morning class on its local day.
"""

from datetime import date, datetime, time, timedelta, timezone as dt_timezone

import pytest
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.timetable.models import RecurringTimetableRule, TimetableEvent
from apps.timetable.services import generate_recurring_events
from apps.timetable.views import TimetableEventViewSet
from tests.factories import SiteFactory, TenantSettingsFactory, TimetableEventFactory

pytestmark = pytest.mark.django_db

# Tuesday 6 Oct 2026 — NZDT (UTC+13) is in effect.
CLASS_DAY = date(2026, 10, 6)
NZ = "Pacific/Auckland"


@pytest.fixture
def nz_tenant(tenant):
    TenantSettingsFactory(tenant=tenant, timezone=NZ)
    return tenant


def _call(tenant, user, method, path, action, data=None, pk=None, params=None):
    rf = APIRequestFactory()
    if method == "get":
        request = rf.get(path, params or {})
    else:
        request = getattr(rf, method)(path, data, format="json")
    request.tenant = tenant
    force_authenticate(request, user=user)
    view = TimetableEventViewSet.as_view({method: action})
    response = view(request, pk=pk) if pk is not None else view(request)
    response.render()
    return response


def _create(tenant, user, class_type, start, end):
    site = SiteFactory(tenant=tenant)
    return _call(
        tenant, user, "post", "/api/v1/timetable/events/", "create",
        data={
            "class_type": class_type.pk,
            "site": site.pk,
            "start_datetime": start,
            "end_datetime": end,
            "capacity": 20,
        },
    )


class TestCreateUsesTenantTimezone:
    def test_naive_times_are_read_as_gym_local_time(self, nz_tenant, admin_user, class_type):
        """The reported bug: 5:15am–8:00am came back as 6:15pm–9:00pm."""
        response = _create(
            nz_tenant, admin_user, class_type,
            "2026-10-06T05:15:00", "2026-10-06T08:00:00",
        )

        assert response.status_code == 201, response.data
        assert response.data["start_time"] == "05:15"
        assert response.data["end_time"] == "08:00"
        assert response.data["date"] == "2026-10-06"

        event = TimetableEvent.objects.get(pk=response.data["id"])
        # 05:15 NZDT == 16:15 UTC the previous day.
        assert event.start_datetime == datetime(2026, 10, 5, 16, 15, tzinfo=dt_timezone.utc)
        assert event.end_datetime == datetime(2026, 10, 5, 19, 0, tzinfo=dt_timezone.utc)

    def test_explicit_offset_is_respected(self, nz_tenant, admin_user, class_type):
        """A client that already sends UTC must not be shifted a second time."""
        response = _create(
            nz_tenant, admin_user, class_type,
            "2026-10-05T16:15:00Z", "2026-10-05T19:00:00Z",
        )

        assert response.status_code == 201, response.data
        assert response.data["start_time"] == "05:15"
        assert response.data["end_time"] == "08:00"

    def test_update_reads_naive_times_in_gym_timezone(self, nz_tenant, admin_user, class_type):
        start = datetime(2026, 10, 5, 20, 0, tzinfo=dt_timezone.utc)
        event = TimetableEventFactory(
            tenant=nz_tenant, class_type=class_type,
            start_datetime=start, end_datetime=start + timedelta(hours=1),
        )

        response = _call(
            nz_tenant, admin_user, "patch", f"/api/v1/timetable/events/{event.pk}/",
            "partial_update", pk=event.pk,
            data={"start_datetime": "2026-10-06T05:15:00", "end_datetime": "2026-10-06T08:00:00"},
        )

        assert response.status_code == 200, response.data
        assert response.data["start_time"] == "05:15"
        assert response.data["end_time"] == "08:00"

    def test_utc_tenant_unchanged(self, tenant, admin_user, class_type):
        """No settings row → project default (UTC); wall clock stays as typed."""
        response = _create(
            tenant, admin_user, class_type,
            "2026-10-06T05:15:00", "2026-10-06T08:00:00",
        )

        assert response.status_code == 201, response.data
        event = TimetableEvent.objects.get(pk=response.data["id"])
        assert event.start_datetime == datetime(2026, 10, 6, 5, 15, tzinfo=dt_timezone.utc)


class TestDateFiltersUseLocalDays:
    """An early-morning class is on the previous UTC day; it must still be
    listed under its local day."""

    @pytest.fixture
    def early_class(self, nz_tenant, class_type):
        start = datetime(2026, 10, 5, 16, 15, tzinfo=dt_timezone.utc)  # 05:15 NZDT on the 6th
        return TimetableEventFactory(
            tenant=nz_tenant, class_type=class_type,
            start_datetime=start, end_datetime=start + timedelta(hours=2, minutes=45),
        )

    def test_week_includes_class_on_its_local_day(self, nz_tenant, admin_user, early_class):
        monday = CLASS_DAY - timedelta(days=CLASS_DAY.weekday())
        response = _call(
            nz_tenant, admin_user, "get", "/api/v1/timetable/events/week/", "week",
            params={"from": monday.isoformat()},
        )

        assert response.status_code == 200
        assert [e["id"] for e in response.data] == [early_class.pk]

    def test_week_includes_monday_early_class(self, nz_tenant, admin_user, class_type):
        """5:15am Monday local is Sunday in UTC — it used to drop out of its week."""
        start = datetime(2026, 10, 4, 16, 15, tzinfo=dt_timezone.utc)  # Mon 5 Oct 05:15 NZDT
        event = TimetableEventFactory(
            tenant=nz_tenant, class_type=class_type,
            start_datetime=start, end_datetime=start + timedelta(hours=1),
        )

        response = _call(
            nz_tenant, admin_user, "get", "/api/v1/timetable/events/week/", "week",
            params={"from": "2026-10-05"},
        )

        assert response.status_code == 200
        assert [e["id"] for e in response.data] == [event.pk]

    def test_week_excludes_class_from_next_local_week(self, nz_tenant, admin_user, early_class):
        # Week of 28 Sep – 4 Oct (local) must not pick up the 6 Oct class just
        # because its UTC date (5 Oct) is close to the boundary.
        response = _call(
            nz_tenant, admin_user, "get", "/api/v1/timetable/events/week/", "week",
            params={"from": "2026-09-28"},
        )

        assert response.status_code == 200
        assert response.data == []

    def test_list_from_to_uses_local_day(self, nz_tenant, admin_user, early_class):
        day = CLASS_DAY.isoformat()
        response = _call(
            nz_tenant, admin_user, "get", "/api/v1/timetable/events/", "list",
            params={"from": day, "to": day},
        )

        assert response.status_code == 200
        results = response.data["results"] if isinstance(response.data, dict) else response.data
        assert [e["id"] for e in results] == [early_class.pk]

        previous = (CLASS_DAY - timedelta(days=1)).isoformat()
        response = _call(
            nz_tenant, admin_user, "get", "/api/v1/timetable/events/", "list",
            params={"from": previous, "to": previous},
        )
        results = response.data["results"] if isinstance(response.data, dict) else response.data
        assert results == []


class TestRecurringUsesTenantTimezone:
    def _rule(self, tenant, admin_user, class_type, valid_from):
        return RecurringTimetableRule.objects.create(
            tenant=tenant,
            class_type=class_type,
            day_of_week=CLASS_DAY.weekday(),
            start_time=time(5, 15),
            valid_from=valid_from,
            is_active=True,
            created_by=admin_user,
            updated_by=admin_user,
        )

    def test_generated_events_start_at_local_time(self, nz_tenant, admin_user, class_type):
        rule = self._rule(nz_tenant, admin_user, class_type, CLASS_DAY)

        created = generate_recurring_events(rule, CLASS_DAY, CLASS_DAY + timedelta(days=13))

        assert len(created) == 2
        assert created[0].start_datetime == datetime(2026, 10, 5, 16, 15, tzinfo=dt_timezone.utc)

    def test_regenerating_does_not_duplicate_early_classes(self, nz_tenant, admin_user, class_type):
        """Idempotency compares local dates; on UTC dates an early class looked
        missing and was created again."""
        rule = self._rule(nz_tenant, admin_user, class_type, CLASS_DAY)
        to_date = CLASS_DAY + timedelta(days=13)

        generate_recurring_events(rule, CLASS_DAY, to_date)
        again = generate_recurring_events(rule, CLASS_DAY, to_date)

        assert again == []
        assert TimetableEvent.objects.filter(recurring_rule=rule).count() == 2
