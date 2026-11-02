"""
Viability thresholds now mean "the count this colour starts at".

Settings used to label four boxes "Red (below)", "Amber (below)",
"Green (below)" and "Purple (above)", and gyms filled them in that way: Red 9,
Amber 20 meant red up to 8, amber from 9, green from 20. The colouring code
instead read amber_threshold as where amber *starts* and ignored Red, so a
class of 10 showed red.

This moves each gym's numbers to what they meant:

    amber starts at  = old Red (at least 1, so nobody turning up is red)
    green starts at  = old Amber
    purple starts at = old Purple

red_threshold is left in place, unused. deploy.sh rolls code back on a
failed deploy but not the database, and the previous release still reads
that column, so dropping it here would break a rollback. A later release
drops it.
"""

from django.db import migrations


def to_start_at(apps, schema_editor):
    ClassType = apps.get_model("timetable", "ClassType")
    for ct in ClassType._base_manager.all():
        amber = max(ct.red_threshold, 1)
        green = max(ct.amber_threshold, amber)
        purple = max(ct.purple_threshold, green)
        ClassType._base_manager.filter(pk=ct.pk).update(
            amber_threshold=amber, green_threshold=green, purple_threshold=purple,
        )


def to_below(apps, schema_editor):
    # Best-effort reverse: put the numbers back in the boxes they came from.
    # A Red of 0 was raised to 1 going forward and comes back as 1.
    ClassType = apps.get_model("timetable", "ClassType")
    for ct in ClassType._base_manager.all():
        ClassType._base_manager.filter(pk=ct.pk).update(
            red_threshold=ct.amber_threshold,
            amber_threshold=ct.green_threshold,
            green_threshold=ct.purple_threshold,
        )


class Migration(migrations.Migration):

    dependencies = [
        ("timetable", "0007_recurringtimetablerule_capacity"),
    ]

    operations = [
        migrations.RunPython(to_start_at, to_below),
    ]
