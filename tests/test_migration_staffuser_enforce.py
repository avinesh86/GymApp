"""
Regression test for staff.0007: enforcing StaffProfile.user NOT NULL must
back-fill unlinked staff first, so it doesn't fail on a populated database.

This reproduces the production failure where a tenant had 55 staff with
user=NULL and the AlterField raised "Invalid use of NULL value". CI never
caught it because the test DB is empty at migrate time — so here we roll back
to 0006, insert an unlinked staff row, then migrate forward and assert success.
"""

import pytest
from django.contrib.auth.hashers import is_password_usable
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

APP = "staff"
BEFORE = (APP, "0006_alter_staffprofile_user")
AFTER = (APP, "0007_alter_staffprofile_user")


@pytest.mark.django_db(transaction=True)
def test_enforce_migration_backfills_unlinked_staff():
    executor = MigrationExecutor(connection)
    # Roll back to the state where StaffProfile.user is still nullable.
    executor.migrate([BEFORE])
    old_apps = executor.loader.project_state(BEFORE).apps

    Tenant = old_apps.get_model("tenants", "Tenant")
    StaffProfile = old_apps.get_model("staff", "StaffProfile")

    tenant = Tenant.objects.create(slug="mig-test", name="Mig Test", is_active=True, plan="starter")
    staff = StaffProfile.objects.create(
        tenant=tenant,
        name="Pat Coach",
        email="pat.coach@migtest.com",
        role="instructor",
        status="active",
        user=None,
    )
    # A soft-deleted, never-linked orphan — the production blocker. The migration
    # must drop these rather than fail the NOT NULL alter on them.
    orphan = StaffProfile.objects.create(
        tenant=tenant,
        name="Gone Person",
        email="gone@migtest.com",
        role="instructor",
        status="inactive",
        user=None,
        is_deleted=True,
    )
    assert staff.user_id is None

    try:
        # Apply the enforce migration — back-fill then NOT NULL.
        executor = MigrationExecutor(connection)
        executor.migrate([AFTER])

        new_apps = executor.loader.project_state(AFTER).apps
        StaffProfileNew = new_apps.get_model("staff", "StaffProfile")
        UserNew = new_apps.get_model("users", "User")
        MembershipNew = new_apps.get_model("users", "Membership")

        linked = StaffProfileNew.objects.get(pk=staff.pk)
        assert linked.user_id is not None, "staff should have been linked by the migration"

        user = UserNew.objects.get(pk=linked.user_id)
        assert user.email == "pat.coach@migtest.com"
        assert not is_password_usable(user.password), "provisioned login must be unusable until invite"

        # The soft-deleted orphan was hard-deleted, not given a login.
        assert not StaffProfileNew.objects.filter(pk=orphan.pk).exists()
        assert not UserNew.objects.filter(email="gone@migtest.com").exists()
        assert MembershipNew.objects.filter(user_id=user.id, tenant_id=tenant.id).exists()
    finally:
        # Leave the DB at the latest state for the rest of the suite.
        MigrationExecutor(connection).migrate([AFTER])
