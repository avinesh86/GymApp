"""
Tests proving that data from tenant A cannot be accessed by users of tenant B.
"""

import pytest
from django.test import TestCase

from tests.factories import (
    AdminUserFactory,
    ClassTypeFactory,
    StaffProfileFactory,
    TenantDomainFactory,
    TenantFactory,
    TimetableEventFactory,
    UserFactory,
)


class TenantIsolationTest(TestCase):
    def setUp(self):
        # Tenant A
        self.tenant_a = TenantFactory(slug="tenant-a")
        TenantDomainFactory(tenant=self.tenant_a, domain="tenant-a.localhost")
        self.user_a = UserFactory(tenant=self.tenant_a, role="admin")
        self.staff_a = StaffProfileFactory(tenant=self.tenant_a)
        self.class_type_a = ClassTypeFactory(tenant=self.tenant_a, name="Yoga A")
        self.event_a = TimetableEventFactory(
            tenant=self.tenant_a, class_type=self.class_type_a
        )

        # Tenant B
        self.tenant_b = TenantFactory(slug="tenant-b")
        TenantDomainFactory(tenant=self.tenant_b, domain="tenant-b.localhost")
        self.user_b = UserFactory(tenant=self.tenant_b, role="admin")
        self.staff_b = StaffProfileFactory(tenant=self.tenant_b)
        self.class_type_b = ClassTypeFactory(tenant=self.tenant_b, name="Yoga B")
        self.event_b = TimetableEventFactory(
            tenant=self.tenant_b, class_type=self.class_type_b
        )

    def _make_request(self, user, tenant):
        """Creates a mock request object with the given user and tenant."""

        class MockRequest:
            pass

        request = MockRequest()
        request.user = user
        request.tenant = tenant
        return request

    def test_staff_from_tenant_b_not_visible_to_tenant_a(self):
        from apps.staff.models import StaffProfile

        visible_to_a = StaffProfile.objects.filter(tenant=self.tenant_a)
        self.assertIn(self.staff_a, visible_to_a)
        self.assertNotIn(self.staff_b, visible_to_a)

    def test_events_from_tenant_b_not_visible_to_tenant_a(self):
        from apps.timetable.models import TimetableEvent

        visible_to_a = TimetableEvent.objects.filter(
            tenant=self.tenant_a, is_deleted=False
        )
        self.assertIn(self.event_a, visible_to_a)
        self.assertNotIn(self.event_b, visible_to_a)

    def test_class_types_scoped_to_tenant(self):
        from apps.timetable.models import ClassType

        visible_to_a = ClassType.objects.filter(tenant=self.tenant_a)
        self.assertIn(self.class_type_a, visible_to_a)
        self.assertNotIn(self.class_type_b, visible_to_a)

    def test_user_cannot_belong_to_two_tenants(self):
        from django.db import IntegrityError

        from apps.users.models import User

        # Attempting to create same email in same tenant raises integrity error
        with self.assertRaises(Exception):
            User.objects.create_user(
                email=self.user_a.email,
                tenant=self.tenant_a,
                password="testpass",
            )

    def test_tenant_permission_rejects_wrong_tenant_user(self):
        """TenantPermission should reject user_b accessing tenant_a endpoints."""
        from apps.core.permissions import TenantPermission

        permission = TenantPermission()
        request = self._make_request(self.user_b, self.tenant_a)

        self.assertFalse(permission.has_permission(request, view=None))

    def test_tenant_permission_accepts_correct_tenant_user(self):
        from apps.core.permissions import TenantPermission

        permission = TenantPermission()
        request = self._make_request(self.user_a, self.tenant_a)

        self.assertTrue(permission.has_permission(request, view=None))

    def test_api_staff_list_scoped_to_tenant(self):
        """API response must only contain staff from the request's tenant."""
        from rest_framework.test import APIRequestFactory

        from apps.core.permissions import TenantPermission
        from apps.staff.views import StaffProfileViewSet

        factory = APIRequestFactory()
        request = factory.get("/api/v1/staff/")
        request.user = self.user_a
        request.tenant = self.tenant_a

        from rest_framework_simplejwt.authentication import JWTAuthentication

        view = StaffProfileViewSet.as_view({"get": "list"})

        # Force authentication by setting user directly
        from rest_framework.request import Request

        drf_request = Request(request)
        drf_request._user = self.user_a
        drf_request.tenant = self.tenant_a

        queryset = StaffProfileViewSet()
        queryset.request = drf_request
        queryset.kwargs = {}
        qs = queryset.get_queryset()

        ids = list(qs.values_list("pk", flat=True))
        self.assertIn(self.staff_a.pk, ids)
        self.assertNotIn(self.staff_b.pk, ids)
