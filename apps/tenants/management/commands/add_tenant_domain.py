"""
Register a hostname against a tenant so TenantMiddleware can resolve it.

TenantMiddleware looks up TenantDomain by the incoming Host header before it
falls back to the JWT tenant_id claim.  Without a matching row every request
takes that fallback path, which means anonymous requests (login, the public
endpoints, the SPA shell) resolve to no tenant at all.

Usage:
    python manage.py add_tenant_domain --tenant northern-arena \\
        --domain fitops.northernarena.co.nz --primary
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction


class Command(BaseCommand):
    help = "Register a hostname against a tenant (TenantDomain)."

    def add_arguments(self, parser):
        parser.add_argument("--tenant", required=True, help="Tenant slug")
        parser.add_argument(
            "--domain", required=True, help="Hostname, e.g. fitops.example.co.nz"
        )
        parser.add_argument(
            "--primary",
            action="store_true",
            help="Mark as the tenant's primary domain, demoting any existing primary.",
        )
        parser.add_argument(
            "--custom",
            action="store_true",
            help="Flag as a customer-supplied domain rather than one we host.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would happen without writing.",
        )

    def handle(self, *args, **options):
        from apps.tenants.models import Tenant, TenantDomain

        domain = self._normalise(options["domain"])
        tenant_slug = options["tenant"]
        dry_run = options["dry_run"]

        try:
            tenant = Tenant.objects.get(slug=tenant_slug)
        except Tenant.DoesNotExist:
            raise CommandError(f"Tenant '{tenant_slug}' not found.")

        if not tenant.is_active:
            # Worth stopping on: _resolve_tenant returns None for an inactive
            # tenant, so the domain would resolve to nothing.
            raise CommandError(
                f"Tenant '{tenant_slug}' is inactive — requests to {domain} would resolve "
                f"to no tenant. Activate it first."
            )

        existing = (
            TenantDomain.objects.filter(domain=domain).select_related("tenant").first()
        )
        if existing and existing.tenant_id != tenant.id:
            raise CommandError(
                f"'{domain}' is already registered to tenant '{existing.tenant.slug}'. "
                f"TenantDomain.domain is unique — remove that row first if this is a move."
            )

        if dry_run:
            verb = "update" if existing else "create"
            self.stdout.write(
                f"[dry-run] would {verb} {domain} -> {tenant.slug} "
                f"(primary={options['primary']}, custom={options['custom']})"
            )
            return

        with transaction.atomic():
            if options["primary"]:
                # is_primary carries no DB constraint, so demote explicitly
                # rather than leaving the tenant with two primaries.
                TenantDomain.objects.filter(tenant=tenant, is_primary=True).exclude(
                    domain=domain
                ).update(is_primary=False)

            record, created = TenantDomain.objects.update_or_create(
                domain=domain,
                defaults={
                    "tenant": tenant,
                    "is_primary": options["primary"],
                    "is_custom": options["custom"],
                },
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"{'Created' if created else 'Updated'} {record.domain} -> {tenant.slug} "
                f"(primary={record.is_primary}, custom={record.is_custom})"
            )
        )
        self.stdout.write(
            "Remember to add this host to ALLOWED_HOSTS and CSRF_TRUSTED_ORIGINS."
        )

    @staticmethod
    def _normalise(raw):
        """
        Match what TenantMiddleware compares against: request.get_host() lowered
        with the port stripped.  A row stored as 'https://Example.co.nz/' would
        never match a real request, and the failure is silent.
        """
        domain = raw.strip().lower()
        for prefix in ("https://", "http://"):
            if domain.startswith(prefix):
                domain = domain[len(prefix) :]
        domain = domain.split("/")[0].split(":")[0].strip(".")
        if not domain:
            raise CommandError(f"'{raw}' is not a usable hostname.")
        return domain
