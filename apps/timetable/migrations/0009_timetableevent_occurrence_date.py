"""Record the day each recurring class was generated for.

The generator used to decide a day was already done by looking at which days
the rule's classes sit on now. A class moved to another day left its old day
looking empty, so the generator made a second class there. 0010 fills this in
for existing classes; it's a separate migration because MySQL can't roll back
a column added in the same migration if the fill-in fails.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("timetable", "0008_viability_thresholds_start_at"),
    ]

    operations = [
        migrations.AddField(
            model_name="timetableevent",
            name="occurrence_date",
            field=models.DateField(
                blank=True,
                null=True,
                help_text=(
                    "The gym-local day the recurring rule generated this class for. "
                    "Kept when the class is moved to another day, so the generator "
                    "doesn't make a new class on the old day."
                ),
            ),
        ),
    ]
