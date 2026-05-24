from django.http import Http404

from .models import TenantDomain

# Paths that resolve their own tenant — middleware sets request.tenant = None
# and the view is responsible for resolving it.
TENANT_EXEMPT_PREFIXES = (
    "/api/v1/whatsapp/webhook",
)


class TenantMiddleware:
    """
    Resolves the tenant on every request from the HTTP Host header.

    Looks up TenantDomain by the incoming domain (subdomain or custom domain).
    Sets request.tenant so downstream views and serializers can scope queries.
    Raises Http404 if the tenant is not found or marked inactive.

    Paths listed in TENANT_EXEMPT_PREFIXES bypass domain resolution and receive
    request.tenant = None; those views must resolve the tenant themselves.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if any(request.path.startswith(prefix) for prefix in TENANT_EXEMPT_PREFIXES):
            request.tenant = None
        else:
            host = request.get_host().split(":")[0].lower()
            request.tenant = self._resolve_tenant(host)
        return self.get_response(request)

    def _resolve_tenant(self, host):
        try:
            domain_record = (
                TenantDomain.objects.select_related("tenant")
                .filter(domain=host)
                .first()
            )
        except Exception:
            raise Http404("Tenant not found.")

        if domain_record is None:
            raise Http404("Tenant not found for domain: " + host)

        tenant = domain_record.tenant
        if not tenant.is_active:
            raise Http404("Tenant is inactive.")

        return tenant
