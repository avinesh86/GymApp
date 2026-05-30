from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tenants", "0002_notification_email_config"),
    ]

    operations = [
        migrations.AddField(
            model_name="tenant",
            name="signup_email",
            field=models.EmailField(blank=True, default="", max_length=254),
        ),
        migrations.AddField(
            model_name="tenant",
            name="signup_phone",
            field=models.CharField(blank=True, default="", max_length=30),
        ),
        migrations.AddField(
            model_name="tenant",
            name="stripe_customer_id",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
        migrations.AddField(
            model_name="tenant",
            name="stripe_subscription_id",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
        migrations.AddField(
            model_name="tenant",
            name="subscription_plan",
            field=models.CharField(default="trial", max_length=50),
        ),
        migrations.AddField(
            model_name="tenant",
            name="subscription_status",
            field=models.CharField(default="trialing", max_length=50),
        ),
        migrations.AddField(
            model_name="tenant",
            name="trial_ends_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="tenant",
            name="setup_completed",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="tenant",
            name="onboarding_step",
            field=models.PositiveSmallIntegerField(default=0),
        ),
    ]
