from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("staff", "0003_paymentdetails_additional_notes_and_more"),
    ]

    operations = [
        migrations.AlterUniqueTogether(
            name="staffavailability",
            unique_together={("staff", "day_of_week", "start_time")},
        ),
    ]
