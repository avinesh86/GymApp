"""
Management command to trigger invoice generation for a tenant/period.

Usage:
    python manage.py generate_invoices --tenant demo-gym --period-start 2024-11-01 --period-end 2024-11-30
"""

from datetime import date

from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Generate draft invoices for all active instructors in a tenant for a given period"

    def add_arguments(self, parser):
        parser.add_argument("--tenant", required=True, help="Tenant slug")
        parser.add_argument("--period-start", required=True, help="Period start (YYYY-MM-DD)")
        parser.add_argument("--period-end", required=True, help="Period end (YYYY-MM-DD)")

    def handle(self, *args, **options):
        from apps.invoices.services import generate_invoice_for_instructor
        from apps.staff.models import StaffProfile
        from apps.tenants.models import Tenant

        tenant_slug = options["tenant"]
        try:
            period_start = date.fromisoformat(options["period_start"])
            period_end = date.fromisoformat(options["period_end"])
        except ValueError as exc:
            raise CommandError(f"Invalid date format: {exc}") from exc

        try:
            tenant = Tenant.objects.get(slug=tenant_slug, is_active=True)
        except Tenant.DoesNotExist:
            raise CommandError(f"Tenant '{tenant_slug}' not found or inactive.")

        instructors = StaffProfile.objects.filter(
            tenant=tenant,
            status=StaffProfile.Status.ACTIVE,
            is_deleted=False,
        )

        if not instructors.exists():
            self.stdout.write(self.style.WARNING("No active instructors found."))
            return

        generated = 0
        for instructor in instructors:
            try:
                invoice = generate_invoice_for_instructor(instructor, period_start, period_end)
                self.stdout.write(
                    f"  Generated invoice {invoice.invoice_number} for {instructor.name}"
                )
                generated += 1
            except Exception as exc:
                self.stdout.write(
                    self.style.ERROR(f"  Failed for {instructor.name}: {exc}")
                )

        self.stdout.write(
            self.style.SUCCESS(
                f"Done. Generated {generated} invoices for tenant '{tenant_slug}'."
            )
        )
