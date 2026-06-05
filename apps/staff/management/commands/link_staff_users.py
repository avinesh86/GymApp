"""
Backfill: give every StaffProfile a linked login User.

Run this before the migration that makes StaffProfile.user required.

    python manage.py link_staff_users [--tenant slug] [--send-invites] [--dry-run]
"""

from django.core.management.base import BaseCommand

from apps.staff.models import StaffProfile
from apps.staff.services import provision_user_for_staff


class Command(BaseCommand):
    help = "Provision/link a User for every StaffProfile that lacks one."

    def add_arguments(self, parser):
        parser.add_argument("--tenant", help="Limit to a single tenant slug.")
        parser.add_argument(
            "--send-invites",
            action="store_true",
            help="Email a set-password link to each newly created user.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would happen without writing.",
        )

    def handle(self, *args, **options):
        qs = StaffProfile.objects.filter(user__isnull=True, is_deleted=False)
        if options["tenant"]:
            qs = qs.filter(tenant__slug=options["tenant"])

        created = linked = skipped = 0
        send_invites = options["send_invites"]
        dry_run = options["dry_run"]

        for staff in qs.select_related("tenant", "user").iterator():
            if dry_run:
                self.stdout.write(
                    f"[dry-run] would provision user for {staff.email} ({staff.tenant.slug})"
                )
                continue
            try:
                user, was_created = provision_user_for_staff(
                    staff, send_invite=send_invites
                )
            except Exception as exc:  # noqa: BLE001 — report and continue the batch
                skipped += 1
                self.stderr.write(
                    self.style.ERROR(f"FAIL {staff.email} ({staff.tenant.slug}): {exc}")
                )
                continue

            if was_created:
                created += 1
            else:
                linked += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Done. created={created} linked={linked} skipped={skipped}"
            )
        )
        remaining = StaffProfile.objects.filter(user__isnull=True, is_deleted=False).count()
        if remaining:
            self.stdout.write(
                self.style.WARNING(
                    f"{remaining} StaffProfile(s) still unlinked — resolve before enforcing NOT NULL."
                )
            )
