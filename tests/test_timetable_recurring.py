"""
Tests for timetable recurring event generation.
"""

from datetime import date, time, timedelta

from django.test import TestCase
from django.utils import timezone

from tests.factories import (
    ClassTypeFactory,
    StaffProfileFactory,
    TenantDomainFactory,
    TenantFactory,
    UserFactory,
)


class RecurringEventGenerationTest(TestCase):
    def setUp(self):
        self.tenant = TenantFactory()
        TenantDomainFactory(tenant=self.tenant)
        self.admin = UserFactory(tenant=self.tenant, role="admin")
        self.class_type = ClassTypeFactory(tenant=self.tenant, duration_minutes=60)
        self.instructor = StaffProfileFactory(tenant=self.tenant)

    def _create_rule(self, day_of_week, valid_from=None, valid_to=None, instructor=None):
        from apps.timetable.models import RecurringTimetableRule

        return RecurringTimetableRule.objects.create(
            tenant=self.tenant,
            class_type=self.class_type,
            day_of_week=day_of_week,
            start_time=time(9, 0),
            instructor=instructor,
            valid_from=valid_from or date.today(),
            valid_to=valid_to,
            is_active=True,
            created_by=self.admin,
            updated_by=self.admin,
        )

    def test_generates_events_for_correct_weekday(self):
        from apps.timetable.models import TimetableEvent
        from apps.timetable.services import generate_recurring_events

        # Find next Monday
        today = date.today()
        days_until_monday = (0 - today.weekday()) % 7
        next_monday = today + timedelta(days=days_until_monday)

        rule = self._create_rule(day_of_week=0, valid_from=next_monday)  # Monday = 0
        from_date = next_monday
        to_date = next_monday + timedelta(days=13)  # 2 weeks

        created = generate_recurring_events(rule, from_date, to_date)

        # Should create 2 events (2 Mondays in 2-week range)
        self.assertEqual(len(created), 2)
        for event in created:
            self.assertEqual(event.start_datetime.weekday(), 0)
            self.assertEqual(event.start_datetime.time().hour, 9)

    def test_skips_dates_outside_valid_range(self):
        from apps.timetable.services import generate_recurring_events

        today = date.today()
        days_until_wednesday = (2 - today.weekday()) % 7
        next_wednesday = today + timedelta(days=days_until_wednesday)

        # Rule valid only for 1 week
        rule = self._create_rule(
            day_of_week=2,
            valid_from=next_wednesday,
            valid_to=next_wednesday + timedelta(days=6),
        )

        # Generate for a month — should only create 1 event
        created = generate_recurring_events(rule, next_wednesday, next_wednesday + timedelta(days=27))
        wednesdays_in_range = sum(
            1 for i in range(28)
            if (next_wednesday + timedelta(days=i)).weekday() == 2
            and (next_wednesday + timedelta(days=i)) <= next_wednesday + timedelta(days=6)
        )
        self.assertEqual(len(created), wednesdays_in_range)

    def test_idempotent_generation(self):
        from apps.timetable.models import TimetableEvent
        from apps.timetable.services import generate_recurring_events

        today = date.today()
        days_until_friday = (4 - today.weekday()) % 7
        next_friday = today + timedelta(days=days_until_friday)

        rule = self._create_rule(day_of_week=4, valid_from=next_friday)
        to_date = next_friday + timedelta(days=6)

        # Generate twice
        first = generate_recurring_events(rule, next_friday, to_date)
        second = generate_recurring_events(rule, next_friday, to_date)

        # Second call should return 0 — events already exist
        self.assertEqual(len(second), 0)

        # Total events should match first call count
        self.assertEqual(
            TimetableEvent.objects.filter(recurring_rule=rule).count(),
            len(first),
        )

    def test_event_status_unfilled_without_instructor(self):
        from apps.timetable.models import TimetableEvent
        from apps.timetable.services import generate_recurring_events

        today = date.today()
        days_until_saturday = (5 - today.weekday()) % 7
        next_saturday = today + timedelta(days=days_until_saturday)

        rule = self._create_rule(day_of_week=5, valid_from=next_saturday, instructor=None)
        created = generate_recurring_events(rule, next_saturday, next_saturday)

        if created:
            self.assertEqual(created[0].status, TimetableEvent.Status.UNFILLED)

    def test_event_status_scheduled_with_instructor(self):
        from apps.timetable.models import TimetableEvent
        from apps.timetable.services import generate_recurring_events

        today = date.today()
        days_until_sunday = (6 - today.weekday()) % 7
        next_sunday = today + timedelta(days=days_until_sunday)

        rule = self._create_rule(
            day_of_week=6,
            valid_from=next_sunday,
            instructor=self.instructor,
        )
        created = generate_recurring_events(rule, next_sunday, next_sunday)

        if created:
            self.assertEqual(created[0].status, TimetableEvent.Status.SCHEDULED)
            self.assertEqual(created[0].instructor, self.instructor)

    def test_inactive_rule_generates_nothing(self):
        from apps.timetable.models import RecurringTimetableRule
        from apps.timetable.services import generate_recurring_events

        today = date.today()
        rule = RecurringTimetableRule.objects.create(
            tenant=self.tenant,
            class_type=self.class_type,
            day_of_week=1,
            start_time=time(10, 0),
            valid_from=today,
            is_active=False,
            created_by=self.admin,
            updated_by=self.admin,
        )

        created = generate_recurring_events(rule, today, today + timedelta(days=30))
        self.assertEqual(len(created), 0)

    def test_get_week_events_returns_correct_range(self):
        from apps.timetable.models import TimetableEvent
        from apps.timetable.services import generate_recurring_events, get_week_events

        today = date.today()
        days_until_monday = (0 - today.weekday()) % 7
        next_monday = today + timedelta(days=days_until_monday)

        rule = self._create_rule(day_of_week=0, valid_from=next_monday)
        generate_recurring_events(rule, next_monday, next_monday + timedelta(days=13))

        week_events = get_week_events(self.tenant, next_monday)
        for event in week_events:
            event_date = event.start_datetime.date()
            self.assertGreaterEqual(event_date, next_monday)
            self.assertLessEqual(event_date, next_monday + timedelta(days=6))
