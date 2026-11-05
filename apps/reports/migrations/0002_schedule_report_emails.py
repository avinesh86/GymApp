"""Register the every-15-minutes Celery Beat job that emails scheduled reports.

Beat reads its jobs from the database (DatabaseScheduler), so without this
row the scheduled reports would never go out.
"""

from django.db import migrations

TASK = "reports.send_scheduled_reports"
NAME = "Send scheduled report emails (every 15 minutes)"


def add_periodic_task(apps, schema_editor):
    IntervalSchedule = apps.get_model("django_celery_beat", "IntervalSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    every_15, _ = IntervalSchedule.objects.get_or_create(every=15, period="minutes")
    PeriodicTask.objects.get_or_create(
        name=NAME, defaults={"task": TASK, "interval": every_15}
    )


def remove_periodic_task(apps, schema_editor):
    apps.get_model("django_celery_beat", "PeriodicTask").objects.filter(
        name=NAME
    ).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("reports", "0001_initial"),
        ("django_celery_beat", "0018_improve_crontab_helptext"),
    ]

    operations = [migrations.RunPython(add_periodic_task, remove_periodic_task)]
