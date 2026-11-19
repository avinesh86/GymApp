"""The timetable's background jobs are registered with Celery beat.

Beat reads its jobs from the database (DatabaseScheduler). Without these rows
recurring classes stop appearing once the weeks made by "Generate" run out,
and classes with no instructor are never flagged Unfilled.
"""

import pytest

pytestmark = pytest.mark.django_db

TIMETABLE_JOBS = [
    "timetable.generate_upcoming_recurring_events",
    "timetable.check_unfilled_classes",
]


@pytest.mark.parametrize("task_name", TIMETABLE_JOBS)
def test_timetable_job_runs_every_hour(task_name):
    from django_celery_beat.models import PeriodicTask

    task = PeriodicTask.objects.get(task=task_name)
    assert (task.interval.every, task.interval.period) == (1, "hours")
    assert task.enabled


@pytest.mark.parametrize("task_name", TIMETABLE_JOBS)
def test_scheduled_name_is_a_registered_celery_task(task_name):
    """A typo in the migration would schedule a job beat can't find."""
    from fitops.celery import app

    import apps.timetable.tasks  # noqa: F401  (registers the shared tasks)

    assert task_name in app.tasks


def _migration():
    import importlib

    return importlib.import_module("apps.timetable.migrations.0011_schedule_background_jobs")


def test_job_added_by_hand_is_not_scheduled_twice():
    """A gym's admin may already have added the job in Django admin under
    another name; scheduling it again would run it twice an hour."""
    from django.apps import apps as django_apps
    from django_celery_beat.models import IntervalSchedule, PeriodicTask

    PeriodicTask.objects.filter(task__in=TIMETABLE_JOBS).delete()
    daily, _ = IntervalSchedule.objects.get_or_create(every=1, period="days")
    PeriodicTask.objects.create(
        name="hand-added generator", task=TIMETABLE_JOBS[0], interval=daily,
    )

    _migration().add_periodic_tasks(django_apps, None)

    for task_name in TIMETABLE_JOBS:
        assert PeriodicTask.objects.filter(task=task_name).count() == 1
    # The hand-added row is kept as it was.
    assert PeriodicTask.objects.get(task=TIMETABLE_JOBS[0]).name == "hand-added generator"


def test_reversing_removes_only_the_migrations_rows():
    from django.apps import apps as django_apps
    from django_celery_beat.models import PeriodicTask

    PeriodicTask.objects.filter(task=TIMETABLE_JOBS[0]).update(name="renamed by hand")

    _migration().remove_periodic_tasks(django_apps, None)

    assert list(PeriodicTask.objects.filter(task__in=TIMETABLE_JOBS).values_list("name", flat=True)) == [
        "renamed by hand"
    ]


def test_mark_completed_job_is_not_scheduled():
    """Left off on purpose: it would mark uncovered classes Completed under
    the absent instructor, who would then be paid for them."""
    from django_celery_beat.models import PeriodicTask

    assert not PeriodicTask.objects.filter(task="timetable.mark_past_events_completed").exists()


def test_first_run_waits_for_the_new_release():
    """deploy.sh migrates while the old worker and beat still run; the first
    run is held back so the old code never runs these jobs."""
    from datetime import timedelta

    from django.apps import apps as django_apps
    from django.utils import timezone
    from django_celery_beat.models import PeriodicTask

    PeriodicTask.objects.filter(task__in=TIMETABLE_JOBS).delete()
    _migration().add_periodic_tasks(django_apps, None)

    for task in PeriodicTask.objects.filter(task__in=TIMETABLE_JOBS):
        assert task.start_time > timezone.now() + timedelta(minutes=50)


def _fill():
    import importlib

    return importlib.import_module("apps.timetable.migrations.0010_fill_occurrence_date")


def test_backfill_gives_a_moved_class_its_rules_day_that_week(tenant, admin_user, class_type):
    from datetime import date, time

    from django.apps import apps as django_apps

    from apps.timetable.models import RecurringTimetableRule, TimetableEvent
    from apps.timetable.services import generate_recurring_events
    from tests.factories import TenantSettingsFactory

    TenantSettingsFactory(tenant=tenant, timezone="Pacific/Auckland")
    monday = date(2030, 3, 4)
    rule = RecurringTimetableRule.objects.create(
        tenant=tenant, class_type=class_type, day_of_week=0, start_time=time(9, 0),
        valid_from=monday, created_by=admin_user, updated_by=admin_user,
    )
    generate_recurring_events(rule, monday, monday)
    event = TimetableEvent.objects.get(recurring_rule=rule)
    from datetime import timedelta

    # Moved to Wednesday by a manager, before occurrence_date existed.
    TimetableEvent.objects.filter(pk=event.pk).update(
        occurrence_date=None,
        start_datetime=event.start_datetime + timedelta(days=2),
        end_datetime=event.end_datetime + timedelta(days=2),
    )

    _fill().fill_occurrence_dates(django_apps, None)

    assert TimetableEvent.objects.get(pk=event.pk).occurrence_date == monday
    assert generate_recurring_events(rule, monday, monday + timedelta(days=6)) == []


def test_backfill_switches_off_deleted_rules(tenant, admin_user, class_type):
    from datetime import date, time

    from django.apps import apps as django_apps

    from apps.timetable.models import RecurringTimetableRule

    rule = RecurringTimetableRule.objects.create(
        tenant=tenant, class_type=class_type, day_of_week=0, start_time=time(9, 0),
        valid_from=date(2030, 3, 4), created_by=admin_user, updated_by=admin_user,
    )
    rule.soft_delete(deleted_by=admin_user)

    _fill().fill_occurrence_dates(django_apps, None)

    rule.refresh_from_db()
    assert rule.is_active is False
