"""
Tests for soft delete behavior and TenantScopedMixin (get_queryset, perform_create,
perform_update, perform_destroy).
"""

import pytest
from django.utils import timezone
from rest_framework.test import APIRequestFactory

from apps.staff.models import StaffProfile
from apps.timetable.models import ClassType, TimetableEvent
from tests.factories import (
    ClassTypeFactory,
    StaffProfileFactory,
    TimetableEventFactory,
    UserFactory,
)


# ---------------------------------------------------------------------------
# TenantAwareModel.soft_delete
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestSoftDelete:
    def test_soft_delete_sets_is_deleted_true(self, tenant, admin_user):
        staff = StaffProfileFactory(tenant=tenant)
        assert staff.is_deleted is False

        staff.soft_delete(deleted_by=admin_user)
        staff.refresh_from_db()

        assert staff.is_deleted is True
        assert staff.updated_by == admin_user

    def test_soft_delete_does_not_hard_delete(self, tenant):
        staff = StaffProfileFactory(tenant=tenant)
        pk = staff.pk

        staff.soft_delete()
        assert StaffProfile.objects.filter(pk=pk).exists()

    def test_soft_delete_without_user(self, tenant):
        staff = StaffProfileFactory(tenant=tenant)
        staff.soft_delete()
        staff.refresh_from_db()

        assert staff.is_deleted is True


# ---------------------------------------------------------------------------
# TenantScopedMixin.get_queryset — excludes soft-deleted
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestTenantScopedMixinQueryset:
    def test_excludes_soft_deleted_records(self, tenant, admin_user):
        active = StaffProfileFactory(tenant=tenant)
        deleted = StaffProfileFactory(tenant=tenant)
        deleted.soft_delete()

        from apps.staff.views import StaffProfileViewSet
        from rest_framework.request import Request

        factory = APIRequestFactory()
        raw_request = factory.get("/api/v1/staff/")
        raw_request.user = admin_user
        raw_request.tenant = tenant

        drf_request = Request(raw_request)
        drf_request._user = admin_user
        drf_request.tenant = tenant

        viewset = StaffProfileViewSet()
        viewset.request = drf_request
        viewset.kwargs = {}
        qs = viewset.get_queryset()

        pks = list(qs.values_list("pk", flat=True))
        assert active.pk in pks
        assert deleted.pk not in pks

    def test_scoped_to_current_tenant(self, tenant, other_tenant, admin_user):
        mine = StaffProfileFactory(tenant=tenant)
        theirs = StaffProfileFactory(tenant=other_tenant)

        from apps.staff.views import StaffProfileViewSet
        from rest_framework.request import Request

        factory = APIRequestFactory()
        raw_request = factory.get("/api/v1/staff/")
        raw_request.user = admin_user
        raw_request.tenant = tenant

        drf_request = Request(raw_request)
        drf_request._user = admin_user
        drf_request.tenant = tenant

        viewset = StaffProfileViewSet()
        viewset.request = drf_request
        viewset.kwargs = {}
        qs = viewset.get_queryset()

        pks = list(qs.values_list("pk", flat=True))
        assert mine.pk in pks
        assert theirs.pk not in pks


# ---------------------------------------------------------------------------
# TenantScopedMixin.perform_destroy — uses soft delete
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestPerformDestroy:
    def test_perform_destroy_soft_deletes(self, tenant, admin_user):
        class_type = ClassTypeFactory(tenant=tenant)

        from apps.timetable.views import ClassTypeViewSet
        from rest_framework.request import Request

        factory = APIRequestFactory()
        raw_request = factory.delete(f"/api/v1/timetable/class-types/{class_type.pk}/")
        raw_request.user = admin_user
        raw_request.tenant = tenant

        drf_request = Request(raw_request)
        drf_request._user = admin_user
        drf_request.tenant = tenant

        viewset = ClassTypeViewSet()
        viewset.request = drf_request
        viewset.kwargs = {}
        viewset.perform_destroy(class_type)

        class_type.refresh_from_db()
        assert class_type.is_deleted is True
        assert ClassType.objects.filter(pk=class_type.pk).exists()


# ---------------------------------------------------------------------------
# TenantScopedMixin.perform_create — injects tenant + user
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestPerformCreate:
    def test_perform_create_injects_tenant_and_user(self, tenant, admin_user, class_type):
        from apps.timetable.serializers import ClassTypeSerializer
        from apps.timetable.views import ClassTypeViewSet
        from rest_framework.request import Request

        factory = APIRequestFactory()
        raw_request = factory.post("/api/v1/timetable/class-types/", {
            "name": "New Test Class",
            "duration_minutes": 45,
        }, format="json")
        raw_request.user = admin_user
        raw_request.tenant = tenant

        drf_request = Request(raw_request)
        drf_request._user = admin_user
        drf_request.tenant = tenant

        serializer = ClassTypeSerializer(data={
            "name": "New Test Class",
            "duration_minutes": 45,
        })
        serializer.is_valid(raise_exception=True)

        viewset = ClassTypeViewSet()
        viewset.request = drf_request
        viewset.kwargs = {}
        viewset.perform_create(serializer)

        created = serializer.instance
        assert created.tenant == tenant
        assert created.created_by == admin_user
        assert created.updated_by == admin_user


# ---------------------------------------------------------------------------
# TenantScopedMixin.perform_update — injects updated_by
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestPerformUpdate:
    def test_perform_update_injects_updated_by(self, tenant, admin_user):
        class_type = ClassTypeFactory(tenant=tenant, created_by=admin_user, updated_by=admin_user)

        other_admin = UserFactory(tenant=tenant, role="admin")

        from apps.timetable.serializers import ClassTypeSerializer
        from apps.timetable.views import ClassTypeViewSet
        from rest_framework.request import Request

        factory = APIRequestFactory()
        raw_request = factory.patch(f"/api/v1/timetable/class-types/{class_type.pk}/")
        raw_request.user = other_admin
        raw_request.tenant = tenant

        drf_request = Request(raw_request)
        drf_request._user = other_admin
        drf_request.tenant = tenant

        serializer = ClassTypeSerializer(class_type, data={"name": "Updated Name"}, partial=True)
        serializer.is_valid(raise_exception=True)

        viewset = ClassTypeViewSet()
        viewset.request = drf_request
        viewset.kwargs = {}
        viewset.perform_update(serializer)

        class_type.refresh_from_db()
        assert class_type.updated_by == other_admin
        assert class_type.name == "Updated Name"
