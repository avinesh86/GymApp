"""Register the timetable's hourly Celery Beat jobs.

Beat reads its jobs from the database (DatabaseScheduler), and nothing had
added these, so on the Docker deploy:
  - recurring classes stopped appearing once the weeks made by "Generate" ran
    out (the top-up to 4 weeks ahead never ran);
  - classes with no instructor were never flagged Unfilled.

timetable.mark_past_events_completed is deliberately left out: it would mark
past classes nobody covered as Completed under the absent instructor, who
would then be paid for them. That needs a decision on pay first.

Both are idempotent, so hourly is safe (it's what the PythonAnywhere
runner, `run_scheduled_tasks`, did).

The first run is held back an hour (start_time). deploy.sh migrates while the
old worker and beat are still running, and beat would otherwise start the new
jobs at once under the old code, which regenerates moved classes on their old
day. By then the new release is running.

A job someone already added by hand in Django admin is left alone, matched by
task rather than name, so the same job is never scheduled twice.
"""

from datetime import timedelta

from django.db import migrations
from django.utils import timezone

JOBS = [
    ("timetable.generate_upcoming_recurring_events",
     "Timetable: generate recurring classes 4 weeks ahead (hourly)"),
    ("timetable.check_unfilled_classes",
     "Timetable: flag upcoming classes with no instructor (hourly)"),
]


def add_periodic_tasks(apps, schema_editor):
    IntervalSchedule = apps.get_model("django_celery_beat", "IntervalSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    hourly = IntervalSchedule.objects.filter(every=1, period="hours").first()
    if hourly is None:
        hourly = IntervalSchedule.objects.create(every=1, period="hours")
    first_run = timezone.now() + timedelta(hours=1)
    for task, name in JOBS:
        if PeriodicTask.objects.filter(task=task).exists():
            continue
        PeriodicTask.objects.create(name=name, task=task, interval=hourly, start_time=first_run)


def remove_periodic_tasks(apps, schema_editor):
    # Only the rows this migration made; hand-added ones have other names.
    apps.get_model("django_celery_beat", "PeriodicTask").objects.filter(
        name__in=[name for _, name in JOBS]
    ).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("timetable", "0010_fill_occurrence_date"),
        ("django_celery_beat", "0018_improve_crontab_helptext"),
    ]

    operations = [migrations.RunPython(add_periodic_tasks, remove_periodic_tasks)]
