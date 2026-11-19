"""Fill in occurrence_date for existing recurring classes, and retire deleted
recurring rules.

occurrence_date: the gym-local day each class is on now. A class that sits on
a different weekday from its rule was moved by a manager; it's given its
rule's day in the same Monday-Sunday week, the day it was most likely made
for, so the generator doesn't make a second class there. (A class moved into
another week can't be told apart and may be made again once.)

Deleted rules: deleting a rule left it active, and the code before this release
generated classes for any active rule. 0011 schedules the generator, and beat
can run it under the old code while a deploy is in progress or after a
rollback, so deleted rules are switched off here too.
"""

from datetime import timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.conf import settings
from django.db import migrations

BATCH = 1000


def _zone(name):
    try:
        return ZoneInfo(name or settings.TIME_ZONE)
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo(settings.TIME_ZONE)


def occurrence_day(start_datetime, zone, rule_day_of_week):
    local_day = start_datetime.astimezone(zone).date()
    return local_day + timedelta(days=rule_day_of_week - local_day.weekday())


def fill_occurrence_dates(apps, schema_editor):
    TimetableEvent = apps.get_model("timetable", "TimetableEvent")
    TenantSettings = apps.get_model("tenants", "TenantSettings")
    RecurringTimetableRule = apps.get_model("timetable", "RecurringTimetableRule")

    RecurringTimetableRule.objects.filter(is_deleted=True, is_active=True).update(is_active=False)

    zones = {
        tenant_id: _zone(name)
        for tenant_id, name in TenantSettings.objects.values_list("tenant_id", "timezone")
    }
    default = _zone(settings.TIME_ZONE)

    pending = []
    events = (
        TimetableEvent.objects.filter(recurring_rule__isnull=False, occurrence_date__isnull=True)
        .select_related("recurring_rule")
        .only("pk", "tenant_id", "start_datetime", "recurring_rule__day_of_week")
    )
    for event in events.iterator(chunk_size=BATCH):
        event.occurrence_date = occurrence_day(
            event.start_datetime, zones.get(event.tenant_id, default), event.recurring_rule.day_of_week,
        )
        pending.append(event)
        if len(pending) >= BATCH:
            TimetableEvent.objects.bulk_update(pending, ["occurrence_date"])
            pending = []
    if pending:
        TimetableEvent.objects.bulk_update(pending, ["occurrence_date"])


class Migration(migrations.Migration):
    dependencies = [
        ("timetable", "0009_timetableevent_occurrence_date"),
        ("tenants", "0001_initial"),
    ]

    operations = [migrations.RunPython(fill_occurrence_dates, migrations.RunPython.noop)]
