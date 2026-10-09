"""
Editing and deleting a recurring class: just this class, this and the following
classes, or the whole series.

A recurring class made for several days (e.g. Mon + Wed) is one rule per day.
The rules share a series_id, carried by their events as recurring_pattern_id,
so the whole set acts as one series. Series changes must also reach the rules,
or the daily generator brings deleted classes back / re-creates them at the old
time. Classes with attendance recorded are never rewritten or removed.
"""

import uuid
from datetime import date, time, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.timetable.models import RecurringTimetableRule, TimetableEvent
from apps.timetable.services import generate_recurring_events
from apps.timetable.views import RecurringTimetableRuleViewSet, TimetableEventViewSet
from tests.factories import AttendanceRecordFactory, SiteFactory, TenantSettingsFactory

pytestmark = pytest.mark.django_db

NZ = "Pacific/Auckland"
# A Monday well in the future, so every generated class is upcoming.
START = date(2030, 3, 4)
assert START.weekday() == 0


@pytest.fixture
def nz_tenant(tenant):
    TenantSettingsFactory(tenant=tenant, timezone=NZ)
    return tenant


@pytest.fixture
def site(nz_tenant):
    return SiteFactory(tenant=nz_tenant, name="Main Floor")


def _rule(tenant, user, class_type, site, day_of_week, series_id, **extra):
    return RecurringTimetableRule.objects.create(
        tenant=tenant,
        class_type=class_type,
        site=site,
        day_of_week=day_of_week,
        start_time=time(9, 0),
        end_time=time(10, 0),
        valid_from=START,
        valid_to=START + timedelta(weeks=4) - timedelta(days=1),
        series_id=series_id,
        created_by=user,
        updated_by=user,
        **extra,
    )


@pytest.fixture
def series(nz_tenant, admin_user, class_type, site):
    """A Mon + Wed class for four weeks: two rules, eight classes, one series."""
    series_id = uuid.uuid4()
    rules = [
        _rule(nz_tenant, admin_user, class_type, site, 0, series_id),
        _rule(nz_tenant, admin_user, class_type, site, 2, series_id),
    ]
    for rule in rules:
        generate_recurring_events(rule, START, START + timedelta(weeks=4))
    return rules


def _events(tenant):
    return list(
        TimetableEvent.objects.filter(tenant=tenant, is_deleted=False).order_by("start_datetime")
    )


def _local(dt):
    return timezone.localtime(dt, ZoneInfo(NZ))


def _post(tenant, user, action, pk, data):
    request = APIRequestFactory().post(f"/api/v1/timetable/events/{pk}/{action}/", data, format="json")
    request.tenant = tenant
    force_authenticate(request, user=user)
    view_action = {"update-series": "update_series_action", "delete-series": "delete_series_action"}[action]
    response = TimetableEventViewSet.as_view({"post": view_action})(request, pk=pk)
    response.render()
    return response


def _regenerate(tenant):
    for rule in RecurringTimetableRule.objects.filter(tenant=tenant, is_active=True):
        generate_recurring_events(rule, START, START + timedelta(weeks=8) - timedelta(days=1))


class TestSeriesIdentity:
    def test_generated_events_carry_the_series_id(self, nz_tenant, series):
        events = _events(nz_tenant)
        assert len(events) == 8
        assert {e.recurring_pattern_id for e in events} == {series[0].series_id}

    def test_rules_created_through_the_api_get_a_series_id(self, nz_tenant, admin_user, class_type, site):
        def create(data):
            request = APIRequestFactory().post("/api/v1/timetable/recurring-rules/", data, format="json")
            request.tenant = nz_tenant
            force_authenticate(request, user=admin_user)
            response = RecurringTimetableRuleViewSet.as_view({"post": "create"})(request)
            response.render()
            assert response.status_code == 201, response.data
            return response.data

        base = {
            "class_type": class_type.pk, "site": site.pk, "start_time": "06:00:00",
            "end_time": "06:45:00", "valid_from": START.isoformat(),
        }
        first = create({**base, "day_of_week": 0})
        assert first["series_id"]
        second = create({**base, "day_of_week": 2, "series_id": first["series_id"]})
        assert second["series_id"] == first["series_id"]

    def test_rule_end_time_sets_the_class_length(self, nz_tenant, series):
        event = _events(nz_tenant)[0]
        assert event.end_datetime - event.start_datetime == timedelta(hours=1)


class TestUpdateSeries:
    def test_all_moves_every_class_to_the_new_local_time(self, nz_tenant, admin_user, series):
        events = _events(nz_tenant)
        response = _post(nz_tenant, admin_user, "update-series", events[3].pk, {
            "scope": "all", "start_time": "06:15", "end_time": "07:00",
        })
        assert response.status_code == 200, response.data
        assert response.data["updated"] == 8

        for event in _events(nz_tenant):
            assert _local(event.start_datetime).time() == time(6, 15)
            assert _local(event.end_datetime).time() == time(7, 0)
        # Dates are kept: still Mondays and Wednesdays.
        assert {_local(e.start_datetime).weekday() for e in _events(nz_tenant)} == {0, 2}

    def test_all_updates_the_rules_so_later_classes_match(self, nz_tenant, admin_user, series):
        event = _events(nz_tenant)[0]
        _post(nz_tenant, admin_user, "update-series", event.pk, {"scope": "all", "start_time": "06:15"})

        for rule in RecurringTimetableRule.objects.filter(tenant=nz_tenant):
            rule.valid_to = None
            rule.save()
        _regenerate(nz_tenant)

        events = _events(nz_tenant)
        assert len(events) == 16
        assert {_local(e.start_datetime).time() for e in events} == {time(6, 15)}

    def test_following_leaves_earlier_classes_alone(self, nz_tenant, admin_user, series):
        events = _events(nz_tenant)
        pivot = events[4]  # third Monday
        response = _post(nz_tenant, admin_user, "update-series", pivot.pk, {
            "scope": "following", "start_time": "18:00", "end_time": "19:00",
        })
        assert response.data["updated"] == 4

        after = _events(nz_tenant)
        assert {_local(e.start_datetime).time() for e in after[:4]} == {time(9, 0)}
        assert {_local(e.start_datetime).time() for e in after[4:]} == {time(18, 0)}

    def test_following_splits_the_rules_without_duplicating_classes(self, nz_tenant, admin_user, series):
        pivot = _events(nz_tenant)[4]
        _post(nz_tenant, admin_user, "update-series", pivot.pk, {"scope": "following", "start_time": "18:00"})

        _regenerate(nz_tenant)

        events = _events(nz_tenant)
        assert len(events) == 8, "regenerating must not bring back classes at the old time"
        rules = RecurringTimetableRule.objects.filter(tenant=nz_tenant)
        assert rules.count() == 4
        assert {r.series_id for r in rules} == {series[0].series_id}

    def test_only_sent_fields_change(self, nz_tenant, admin_user, series):
        events = _events(nz_tenant)
        moved = events[1]
        moved.start_datetime += timedelta(hours=2)
        moved.end_datetime += timedelta(hours=2)
        moved.save()

        _post(nz_tenant, admin_user, "update-series", events[0].pk, {"scope": "all", "notes": "Bring a mat"})

        moved.refresh_from_db()
        assert _local(moved.start_datetime).time() == time(11, 0), "a notes edit must not reset its time"
        assert {e.notes for e in _events(nz_tenant)} == {"Bring a mat"}

    def test_location_change_applies_to_the_series(self, nz_tenant, admin_user, series):
        studio = SiteFactory(tenant=nz_tenant, name="Studio 2")
        event = _events(nz_tenant)[0]
        _post(nz_tenant, admin_user, "update-series", event.pk, {"scope": "all", "site": studio.pk})

        assert {e.site_id for e in _events(nz_tenant)} == {studio.pk}
        assert set(
            RecurringTimetableRule.objects.filter(tenant=nz_tenant).values_list("site_id", flat=True)
        ) == {studio.pk}

    def test_classes_with_attendance_are_not_changed(self, nz_tenant, admin_user, series):
        events = _events(nz_tenant)
        AttendanceRecordFactory(tenant=nz_tenant, timetable_event=events[0], count=12)

        response = _post(nz_tenant, admin_user, "update-series", events[2].pk, {"scope": "all", "start_time": "06:00"})

        assert response.data["updated"] == 7
        events[0].refresh_from_db()
        assert _local(events[0].start_datetime).time() == time(9, 0)

    def test_another_gyms_location_is_rejected(self, nz_tenant, other_tenant, admin_user, series):
        theirs = SiteFactory(tenant=other_tenant, name="Elsewhere")
        response = _post(nz_tenant, admin_user, "update-series", _events(nz_tenant)[0].pk, {
            "scope": "all", "site": theirs.pk,
        })
        assert response.status_code == 404

    def test_one_off_class_is_rejected(self, nz_tenant, admin_user, class_type):
        event = TimetableEvent.objects.create(
            tenant=nz_tenant, class_type=class_type,
            start_datetime=timezone.now() + timedelta(days=1),
            end_datetime=timezone.now() + timedelta(days=1, hours=1),
        )
        response = _post(nz_tenant, admin_user, "update-series", event.pk, {"scope": "all", "notes": "x"})
        assert response.status_code == 400


class TestDeleteSeries:
    def test_all_deletes_every_class_and_stops_the_rules(self, nz_tenant, admin_user, series):
        response = _post(nz_tenant, admin_user, "delete-series", _events(nz_tenant)[5].pk, {"scope": "all"})
        assert response.status_code == 200, response.data
        assert response.data["deleted"] == 8
        assert _events(nz_tenant) == []

        _regenerate(nz_tenant)
        assert _events(nz_tenant) == [], "the generator must not bring the series back"

    def test_following_keeps_earlier_classes(self, nz_tenant, admin_user, series):
        events = _events(nz_tenant)
        response = _post(nz_tenant, admin_user, "delete-series", events[4].pk, {"scope": "following"})
        assert response.data["deleted"] == 4
        assert [e.pk for e in _events(nz_tenant)] == [e.pk for e in events[:4]]

        for rule in RecurringTimetableRule.objects.filter(tenant=nz_tenant):
            assert rule.valid_to == _local(events[4].start_datetime).date() - timedelta(days=1)

    def test_following_from_a_rules_first_class_stops_that_rule(self, nz_tenant, admin_user, series):
        first_monday = _events(nz_tenant)[0]
        _post(nz_tenant, admin_user, "delete-series", first_monday.pk, {"scope": "following"})

        assert _events(nz_tenant) == []
        assert not RecurringTimetableRule.objects.filter(tenant=nz_tenant, is_active=True).exists()

    def test_classes_with_attendance_are_kept(self, nz_tenant, admin_user, series):
        events = _events(nz_tenant)
        AttendanceRecordFactory(tenant=nz_tenant, timetable_event=events[0], count=12)

        _post(nz_tenant, admin_user, "delete-series", events[0].pk, {"scope": "all"})

        assert [e.pk for e in _events(nz_tenant)] == [events[0].pk]

    def test_other_series_are_untouched(self, nz_tenant, admin_user, class_type, site, series):
        other = _rule(nz_tenant, admin_user, class_type, site, 4, uuid.uuid4())
        generate_recurring_events(other, START, START + timedelta(weeks=4))

        _post(nz_tenant, admin_user, "delete-series", _events(nz_tenant)[0].pk, {"scope": "all"})

        remaining = _events(nz_tenant)
        assert len(remaining) == 4
        assert {e.recurring_rule_id for e in remaining} == {other.pk}

    def test_legacy_events_without_series_id_use_their_rule(self, nz_tenant, admin_user, class_type, site):
        legacy = _rule(nz_tenant, admin_user, class_type, site, 0, None)
        generate_recurring_events(legacy, START, START + timedelta(weeks=4))
        assert {e.recurring_pattern_id for e in _events(nz_tenant)} == {None}

        response = _post(nz_tenant, admin_user, "delete-series", _events(nz_tenant)[0].pk, {"scope": "all"})

        assert response.data["deleted"] == 4
        legacy.refresh_from_db()
        assert legacy.is_active is False

    def test_instructors_cannot_delete_a_series(self, nz_tenant, instructor_user, series):
        response = _post(nz_tenant, instructor_user, "delete-series", _events(nz_tenant)[0].pk, {"scope": "all"})
        assert response.status_code == 403
        assert len(_events(nz_tenant)) == 8
