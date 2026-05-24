from .models import Tenant, TenantDomain

# Paths that resolve their own tenant — middleware sets request.tenant = None
# and the view is responsible for resolving it.
TENANT_EXEMPT_PREFIXES = (
    "/api/v1/whatsapp/webhook",
    "/api/v1/public/",
)


class TenantMiddleware:
    """
    Resolves the tenant on every request.

    Primary strategy: look up TenantDomain by the HTTP Host header.
    Fallback strategy: extract tenant_id from a JWT Bearer token (supports
    single-domain multi-tenant deployments where new tenants have no domain
    record yet).

    Sets request.tenant so downstream views and serializers can scope queries.
    Returns None (rather than raising Http404) when no tenant is found — DRF
    permission classes are then responsible for rejecting unauthenticated or
    mis-configured requests.

    Paths listed in TENANT_EXEMPT_PREFIXES bypass resolution entirely and
    receive request.tenant = None; those views must resolve the tenant
    themselves.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if any(request.path.startswith(prefix) for prefix in TENANT_EXEMPT_PREFIXES):
            request.tenant = None
        else:
            request.tenant = self._resolve_tenant(request)
        return self.get_response(request)

    def _resolve_tenant(self, request):
        host = request.get_host().split(":")[0].lower()
        try:
            domain_record = (
                TenantDomain.objects.select_related("tenant")
                .filter(domain=host)
                .first()
            )
            if domain_record:
                tenant = domain_record.tenant
                if not tenant.is_active:
                    return None
                return tenant
        except Exception:
            pass

        # Fallback: resolve from JWT tenant_id claim (single-domain SaaS)
        return self._resolve_from_jwt(request)

    def _resolve_from_jwt(self, request):
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        if not auth_header.startswith("Bearer "):
            return None
        token_str = auth_header[7:]
        try:
            from rest_framework_simplejwt.tokens import AccessToken

            token = AccessToken(token_str)
            tenant_id = token.get("tenant_id")
            if tenant_id:
                return Tenant.objects.filter(id=tenant_id, is_active=True).first()
        except Exception:
            return None
        return None
