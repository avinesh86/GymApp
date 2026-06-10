"""
Tests for the staff "Classes" tab capability toggle.

Bug: unique_together(staff, class_type) ignores the soft-delete flag, so
toggling a class off (soft delete) then on again INSERTed a duplicate and
raised IntegrityError — surfacing in the UI as a generic "Failed" toast.
The viewset now revives the soft-deleted row, making the toggle idempotent.
"""

import pytest
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.staff.models import StaffClassTypeCapability
from apps.staff.views import StaffCapabilityViewSet


def _create(staff_pk, tenant, user, class_type_id):
    request = APIRequestFactory().post(
        f"/api/v1/staff/{staff_pk}/capabilities/",
        {"class_type": class_type_id},
        format="json",
    )
    force_authenticate(request, user=user)
    request.tenant = tenant
    view = StaffCapabilityViewSet.as_view({"post": "create"})
    return view(request, staff_pk=staff_pk)


def _destroy(staff_pk, tenant, user, cap_id):
    request = APIRequestFactory().delete(f"/api/v1/staff/{staff_pk}/capabilities/{cap_id}/")
    force_authenticate(request, user=user)
    request.tenant = tenant
    view = StaffCapabilityViewSet.as_view({"delete": "destroy"})
    return view(request, staff_pk=staff_pk, pk=cap_id)


@pytest.mark.django_db
class TestCapabilityToggle:
    def test_add_then_remove_then_readd_succeeds(self, tenant, manager_user, instructor, class_type):
        # Toggle on
        resp = _create(instructor.pk, tenant, manager_user, class_type.id)
        assert resp.status_code == 201
        cap_id = resp.data["id"]

        # Toggle off (soft delete)
        resp = _destroy(instructor.pk, tenant, manager_user, cap_id)
        assert resp.status_code == 204
        assert StaffClassTypeCapability.objects.get(pk=cap_id).is_deleted is True

        # Toggle on again — previously raised IntegrityError (the bug)
        resp = _create(instructor.pk, tenant, manager_user, class_type.id)
        assert resp.status_code in (200, 201)

        # Exactly one row, revived
        rows = StaffClassTypeCapability.objects.filter(
            staff=instructor, class_type=class_type
        )
        assert rows.count() == 1
        assert rows.first().is_deleted is False

    def test_readd_is_visible_in_active_queryset(self, tenant, manager_user, instructor, class_type):
        resp = _create(instructor.pk, tenant, manager_user, class_type.id)
        _destroy(instructor.pk, tenant, manager_user, resp.data["id"])
        _create(instructor.pk, tenant, manager_user, class_type.id)

        active = StaffClassTypeCapability.objects.filter(
            tenant=tenant, staff=instructor, is_deleted=False
        )
        assert active.count() == 1

    def test_duplicate_add_without_delete_is_idempotent(self, tenant, manager_user, instructor, class_type):
        _create(instructor.pk, tenant, manager_user, class_type.id)
        resp = _create(instructor.pk, tenant, manager_user, class_type.id)

        assert resp.status_code in (200, 201)
        assert StaffClassTypeCapability.objects.filter(
            staff=instructor, class_type=class_type
        ).count() == 1
