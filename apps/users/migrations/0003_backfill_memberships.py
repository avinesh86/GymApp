from django.db import migrations


def create_memberships(apps, schema_editor):
    """Give every existing user a Membership mirroring their current tenant/role."""
    User = apps.get_model("users", "User")
    Membership = apps.get_model("users", "Membership")

    memberships = [
        Membership(user_id=user.id, tenant_id=user.tenant_id, role=user.role, is_active=True)
        for user in User.objects.all().iterator()
    ]
    Membership.objects.bulk_create(memberships, ignore_conflicts=True)


def remove_memberships(apps, schema_editor):
    Membership = apps.get_model("users", "Membership")
    Membership.objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0002_membership"),
    ]

    operations = [
        migrations.RunPython(create_memberships, remove_memberships),
    ]
