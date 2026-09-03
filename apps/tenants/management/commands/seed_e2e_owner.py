"""
Create the account the end-to-end tests sign in as.

The tests drive the app through its interface, but they still need one account
to start from — signing up creates a gym through Stripe, which is not
something to run on every test pass. Everything after signing in is done by
clicking.

    python manage.py seed_e2e_owner --domain localhost

Idempotent: running it again resets the password rather than failing.
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.tenants.models import TenantDomain
from apps.users.constants import UserRole
from apps.users.models import Membership, User

DEFAULT_EMAIL = "e2e-owner@example.com"
DEFAULT_PASSWORD = "e2e-password-123"


class Command(BaseCommand):
    help = "Create or reset the owner account used by the end-to-end tests."

    def add_arguments(self, parser):
        parser.add_argument(
            "--domain",
            default="localhost",
            help="Host the tests run against. The account is created in whichever "
            "gym that host resolves to, because tenant is resolved from it.",
        )
        parser.add_argument("--email", default=DEFAULT_EMAIL)
        parser.add_argument("--password", default=DEFAULT_PASSWORD)
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Also delete records left behind by previous runs. Only touches "
            "rows whose name starts with 'E2E ', so hand-made data is left alone.",
        )

    def handle(self, *args, **options):
        domain = options["domain"].strip().lower()

        tenant_domain = (
            TenantDomain.objects.select_related("tenant").filter(domain=domain).first()
        )
        if tenant_domain is None:
            known = ", ".join(TenantDomain.objects.values_list("domain", flat=True)) or "none"
            raise CommandError(
                f"No gym is registered against '{domain}'. Known hosts: {known}. "
                f"Add one with add_tenant_domain first."
            )

        tenant = tenant_domain.tenant
        if not tenant.is_active:
            raise CommandError(
                f"Gym '{tenant.slug}' is inactive, so requests to {domain} resolve to "
                f"no tenant and the tests would fail on every page."
            )

        with transaction.atomic():
            user, created = User.objects.get_or_create(
                email=options["email"],
                defaults={
                    "tenant": tenant,
                    "first_name": "E2E",
                    "last_name": "Owner",
                    "role": UserRole.OWNER,
                    "is_active": True,
                },
            )
            # Reset on every run: a half-finished previous run may have left the
            # account deactivated, and a stale password is a confusing failure.
            user.tenant = tenant
            user.role = UserRole.OWNER
            user.is_active = True
            user.set_password(options["password"])
            user.save()

            Membership.objects.update_or_create(
                user=user,
                tenant=tenant,
                defaults={"role": UserRole.OWNER, "is_active": True},
            )

        if options["reset"]:
            self._clear_previous_runs(tenant)

        self.stdout.write(
            self.style.SUCCESS(
                f"{'Created' if created else 'Reset'} {user.email} as owner of "
                f"'{tenant.slug}' (host {domain})"
            )
        )

    def _clear_previous_runs(self, tenant):
        """Remove what earlier runs created, so a run starts from a known state.

        Without this the suite is not repeatable: the second run finds the
        class it meant to assign an instructor to already assigned, and fails
        for a reason that has nothing to do with the code.

        Everything the tests make is prefixed "E2E ", and only that prefix is
        matched — anything created by hand in the same gym survives.
        """
        from apps.cover.models import CoverOffer, CoverRequest
        from apps.staff.models import StaffProfile
        from apps.timetable.models import ClassType, TimetableEvent

        events = TimetableEvent.objects.filter(
            tenant=tenant, class_type__name__startswith="E2E "
        )
        offers = CoverOffer.objects.filter(cover_request__timetable_event__in=events)
        requests = CoverRequest.objects.filter(timetable_event__in=events)

        counts = {
            "cover offers": offers.count(),
            "cover requests": requests.count(),
            "classes": events.count(),
        }
        offers.delete()
        requests.delete()
        events.delete()

        for model, label in (
            (ClassType, "class types"),
            (StaffProfile, "staff"),
        ):
            qs = model.objects.filter(tenant=tenant, name__startswith="E2E ")
            counts[label] = qs.count()
            qs.delete()

        # Sites are named separately from the rest.
        from apps.tenants.models import Site

        sites = Site.objects.filter(tenant=tenant, name__startswith="E2E ")
        counts["locations"] = sites.count()
        sites.delete()

        removed = ", ".join(f"{n} {label}" for label, n in counts.items() if n)
        self.stdout.write(f"  Cleared from earlier runs: {removed or 'nothing'}")
