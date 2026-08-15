"""
Health endpoint tests.

`scripts/deploy.sh` decides whether a release came up cleanly from this
endpoint, so it must stay reachable without auth or a tenant, and it must fail
loudly when the database is gone.
"""

import pytest
from django.db import DatabaseError
from rest_framework.test import APIRequestFactory

from apps.core.health_views import HealthCheckView


def _get_health(**request_kwargs):
    request = APIRequestFactory().get("/api/v1/public/health/", **request_kwargs)
    return HealthCheckView.as_view()(request)


@pytest.mark.django_db
def test_health_returns_200_without_auth_or_tenant():
    response = _get_health()

    assert response.status_code == 200
    assert response.data == {"status": "healthy", "database": "ok"}


@pytest.mark.django_db
def test_health_returns_503_when_the_database_is_unreachable(monkeypatch):
    def explode(*args, **kwargs):
        raise DatabaseError("connection refused")

    monkeypatch.setattr("apps.core.health_views.connection.cursor", explode)

    response = _get_health()

    assert response.status_code == 503
    assert response.data["status"] == "unhealthy"
    assert response.data["database"] == "error"


def test_health_url_is_tenant_exempt():
    """The middleware must not try to resolve a tenant for this path."""
    from apps.tenants.middleware import TENANT_EXEMPT_PREFIXES

    assert any(
        "/api/v1/public/health/".startswith(prefix) for prefix in TENANT_EXEMPT_PREFIXES
    )
