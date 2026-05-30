"""
Tests for custom JWT token serializer that embeds tenant_id and role claims.
"""

import pytest
from rest_framework_simplejwt.tokens import AccessToken

from apps.users.jwt_serializers import TenantTokenObtainPairSerializer
from tests.factories import TenantFactory, UserFactory


class TestTenantTokenClaims:
    """Verify that JWT tokens include tenant_id and role claims."""

    def test_token_contains_tenant_id(self, db):
        tenant = TenantFactory(slug="jwt-test")
        user = UserFactory(tenant=tenant, role="admin")

        token = TenantTokenObtainPairSerializer.get_token(user)

        assert "tenant_id" in token
        assert token["tenant_id"] == tenant.id

    def test_token_contains_role(self, db):
        tenant = TenantFactory(slug="jwt-role")
        user = UserFactory(tenant=tenant, role="gym_manager")

        token = TenantTokenObtainPairSerializer.get_token(user)

        assert "role" in token
        assert token["role"] == "gym_manager"

    def test_token_contains_user_id(self, db):
        tenant = TenantFactory()
        user = UserFactory(tenant=tenant, role="instructor")

        token = TenantTokenObtainPairSerializer.get_token(user)

        assert "user_id" in token
        assert token["user_id"] == user.id

    def test_access_token_from_refresh_has_claims(self, db):
        tenant = TenantFactory(slug="jwt-access")
        user = UserFactory(tenant=tenant, role="owner")

        refresh = TenantTokenObtainPairSerializer.get_token(user)
        access = refresh.access_token

        assert access["tenant_id"] == tenant.id
        assert access["role"] == "owner"

    def test_different_roles_produce_different_claims(self, db):
        tenant = TenantFactory()
        admin = UserFactory(tenant=tenant, role="admin")
        instructor = UserFactory(tenant=tenant, role="instructor")

        admin_token = TenantTokenObtainPairSerializer.get_token(admin)
        instructor_token = TenantTokenObtainPairSerializer.get_token(instructor)

        assert admin_token["role"] == "admin"
        assert instructor_token["role"] == "instructor"
        assert admin_token["tenant_id"] == instructor_token["tenant_id"]

    def test_different_tenants_produce_different_tenant_ids(self, db):
        tenant_a = TenantFactory(slug="tenant-a-jwt")
        tenant_b = TenantFactory(slug="tenant-b-jwt")
        user_a = UserFactory(tenant=tenant_a, role="owner")
        user_b = UserFactory(tenant=tenant_b, role="owner")

        token_a = TenantTokenObtainPairSerializer.get_token(user_a)
        token_b = TenantTokenObtainPairSerializer.get_token(user_b)

        assert token_a["tenant_id"] != token_b["tenant_id"]
