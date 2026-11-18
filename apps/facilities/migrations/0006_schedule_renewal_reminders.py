"""Register the hourly Celery Beat job that sends licence expiry and
subscription renewal reminders. Beat reads its jobs from the database, so
without this row no reminder would ever go."""

from django.db import migrations

TASK = "facilities.send_renewal_reminders"
NAME = "Facilities: licence and subscription reminders (hourly)"


def add_periodic_task(apps, schema_editor):
    IntervalSchedule = apps.get_model("django_celery_beat", "IntervalSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    hourly, _ = IntervalSchedule.objects.get_or_create(every=1, period="hours")
    PeriodicTask.objects.get_or_create(name=NAME, defaults={"task": TASK, "interval": hourly})


def remove_periodic_task(apps, schema_editor):
    apps.get_model("django_celery_beat", "PeriodicTask").objects.filter(name=NAME).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("facilities", "0005_licence_subscription"),
        ("django_celery_beat", "0018_improve_crontab_helptext"),
    ]

    operations = [migrations.RunPython(add_periodic_task, remove_periodic_task)]
