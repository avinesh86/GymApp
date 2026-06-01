"""
Tests for TenantMiddleware: domain resolution, JWT fallback, exempt paths.
"""

import pytest
from django.test import RequestFactory
from rest_framework_simplejwt.tokens import AccessToken

from apps.tenants.middleware import TenantMiddleware
from tests.factories import TenantDomainFactory, TenantFactory, UserFactory


@pytest.fixture
def middleware():
    """Create a TenantMiddleware instance with a no-op get_response."""
    return TenantMiddleware(get_response=lambda request: None)


@pytest.fixture
def rf():
    return RequestFactory()


class TestTenantDomainResolution:
    """Tests for resolving tenant from the HTTP Host header."""

    def test_resolves_tenant_from_known_domain(self, db, middleware, rf):
        tenant = TenantFactory(slug="alpha")
        TenantDomainFactory(tenant=tenant, domain="alpha.fitops.app")

        request = rf.get("/api/v1/users/", HTTP_HOST="alpha.fitops.app")
        resolved = middleware._resolve_tenant(request)

        assert resolved is not None
        assert resolved.pk == tenant.pk

    def test_returns_none_for_unknown_domain(self, db, middleware, rf):
        request = rf.get("/api/v1/users/", HTTP_HOST="unknown.example.com")
        resolved = middleware._resolve_tenant(request)

        assert resolved is None

    def test_returns_none_for_inactive_tenant(self, db, middleware, rf):
        tenant = TenantFactory(slug="inactive", is_active=False)
        TenantDomainFactory(tenant=tenant, domain="inactive.fitops.app")

        request = rf.get("/api/v1/users/", HTTP_HOST="inactive.fitops.app")
        resolved = middleware._resolve_tenant(request)

        assert resolved is None

    def test_strips_port_from_host(self, db, middleware, rf):
        tenant = TenantFactory(slug="porttest")
        TenantDomainFactory(tenant=tenant, domain="porttest.fitops.app")

        request = rf.get("/api/v1/users/", HTTP_HOST="porttest.fitops.app:8000")
        resolved = middleware._resolve_tenant(request)

        assert resolved is not None
        assert resolved.pk == tenant.pk

    def test_case_insensitive_host_match(self, db, middleware, rf):
        tenant = TenantFactory(slug="casetest")
        TenantDomainFactory(tenant=tenant, domain="casetest.fitops.app")

        request = rf.get("/api/v1/users/", HTTP_HOST="CaseTest.FitOps.App")
        resolved = middleware._resolve_tenant(request)

        assert resolved is not None
        assert resolved.pk == tenant.pk


class TestTenantExemptPrefixes:
    """Tests for paths that bypass tenant resolution."""

    def test_exempt_prefix_sets_tenant_none(self, db, middleware, rf):
        request = rf.get("/api/v1/public/signup/")
        middleware(request)

        assert request.tenant is None

    def test_whatsapp_webhook_exempt(self, db, middleware, rf):
        request = rf.get("/api/v1/whatsapp/webhook/")
        middleware(request)

        assert request.tenant is None

    def test_non_exempt_path_resolves_tenant(self, db, middleware, rf):
        tenant = TenantFactory(slug="normal")
        TenantDomainFactory(tenant=tenant, domain="normal.fitops.app")

        request = rf.get("/api/v1/staff/", HTTP_HOST="normal.fitops.app")
        middleware(request)

        assert request.tenant is not None
        assert request.tenant.pk == tenant.pk


class TestJWTFallbackResolution:
    """Tests for resolving tenant from JWT Bearer token."""

    def test_resolves_tenant_from_jwt_tenant_id(self, db, middleware, rf):
        tenant = TenantFactory(slug="jwt-tenant")
        user = UserFactory(tenant=tenant, role="admin")

        token = AccessToken.for_user(user)
        token["tenant_id"] = tenant.id

        request = rf.get(
            "/api/v1/users/",
            HTTP_HOST="unknown.example.com",
            HTTP_AUTHORIZATION=f"Bearer {str(token)}",
        )
        resolved = middleware._resolve_tenant(request)

        assert resolved is not None
        assert resolved.pk == tenant.pk

    def test_resolves_tenant_from_jwt_user_fallback(self, db, middleware, rf):
        """Legacy tokens without tenant_id fall back to user.tenant."""
        tenant = TenantFactory(slug="legacy-jwt")
        user = UserFactory(tenant=tenant, role="instructor")

        token = AccessToken.for_user(user)
        # Do NOT set tenant_id — simulates a legacy token

        request = rf.get(
            "/api/v1/users/",
            HTTP_HOST="unknown.example.com",
            HTTP_AUTHORIZATION=f"Bearer {str(token)}",
        )
        resolved = middleware._resolve_tenant(request)

        assert resolved is not None
        assert resolved.pk == tenant.pk

    def test_returns_none_for_invalid_token(self, db, middleware, rf):
        request = rf.get(
            "/api/v1/users/",
            HTTP_HOST="unknown.example.com",
            HTTP_AUTHORIZATION="Bearer invalid.token.here",
        )
        resolved = middleware._resolve_tenant(request)

        assert resolved is None

    def test_returns_none_without_bearer_prefix(self, db, middleware, rf):
        request = rf.get(
            "/api/v1/users/",
            HTTP_HOST="unknown.example.com",
            HTTP_AUTHORIZATION="Token abc123",
        )
        resolved = middleware._resolve_tenant(request)

        assert resolved is None

    def test_returns_none_for_inactive_tenant_via_jwt(self, db, middleware, rf):
        tenant = TenantFactory(slug="inactive-jwt", is_active=False)
        user = UserFactory(tenant=tenant, role="admin")

        token = AccessToken.for_user(user)
        token["tenant_id"] = tenant.id

        request = rf.get(
            "/api/v1/users/",
            HTTP_HOST="unknown.example.com",
            HTTP_AUTHORIZATION=f"Bearer {str(token)}",
        )
        resolved = middleware._resolve_tenant(request)

        assert resolved is None
