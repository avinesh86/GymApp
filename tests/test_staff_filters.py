"""
F4 — staff page filters, sort, and class tags.

Covers the StaffProfile list endpoint filtering by class type (capability),
availability day, and pay-rate type; A-Z / Z-A ordering; and the list
serializer exposing active capabilities (for the class tags on tiles).
"""

from datetime import date, time

import pytest
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.staff.models import StaffAvailability, StaffClassTypeCapability, StaffProfile
from apps.staff.views import StaffProfileViewSet
from tests.factories import ClassTypeFactory, StaffPayRateFactory, StaffProfileFactory

pytestmark = pytest.mark.django_db


def _staff(tenant, name, role="instructor"):
    return StaffProfileFactory(tenant=tenant, name=name, email=f"{name.lower()}@t.com", role=role)


def _capability(tenant, staff, class_type):
    return StaffClassTypeCapability.objects.create(tenant=tenant, staff=staff, class_type=class_type)


def _availability(tenant, staff, day):
    return StaffAvailability.objects.create(
        tenant=tenant, staff=staff, day_of_week=day,
        start_time=time(9, 0), end_time=time(12, 0),
    )


def _list(tenant, user, **params):
    request = APIRequestFactory().get("/api/v1/staff/", params)
    request.tenant = tenant
    force_authenticate(request, user=user)
    response = StaffProfileViewSet.as_view({"get": "list"})(request)
    response.render()
    return response


def _names(resp):
    rows = resp.data["results"] if isinstance(resp.data, dict) else resp.data
    return [row["name"] for row in rows]


def test_filter_by_class_type(tenant, manager_user):
    yoga = ClassTypeFactory(tenant=tenant, name="Yoga")
    spin = ClassTypeFactory(tenant=tenant, name="Spin")
    alice = _staff(tenant, "Alice")
    bob = _staff(tenant, "Bob")
    _capability(tenant, alice, yoga)
    _capability(tenant, bob, spin)

    resp = _list(tenant, manager_user, class_type=yoga.id)

    assert resp.status_code == 200
    assert _names(resp) == ["Alice"]


def test_class_type_filter_no_duplicate_rows(tenant, manager_user):
    yoga = ClassTypeFactory(tenant=tenant, name="Yoga")
    pilates = ClassTypeFactory(tenant=tenant, name="Pilates")
    alice = _staff(tenant, "Alice")
    # Two capabilities for the same member — must not duplicate the row.
    _capability(tenant, alice, yoga)
    _capability(tenant, alice, pilates)

    resp = _list(tenant, manager_user)

    assert _names(resp).count("Alice") == 1


def test_filter_by_availability_day(tenant, manager_user):
    monday_person = _staff(tenant, "Mona")
    friday_person = _staff(tenant, "Fred")
    _availability(tenant, monday_person, 0)  # Monday
    _availability(tenant, friday_person, 4)  # Friday

    resp = _list(tenant, manager_user, day=0)

    assert _names(resp) == ["Mona"]


def test_filter_by_pay_rate_type(tenant, manager_user):
    per_class = _staff(tenant, "Cara")
    hourly = _staff(tenant, "Hank")
    StaffPayRateFactory(tenant=tenant, staff=per_class, rate_type="per_class",
                        effective_from=date(2026, 1, 1))
    StaffPayRateFactory(tenant=tenant, staff=hourly, rate_type="hourly",
                        effective_from=date(2026, 1, 1))

    resp = _list(tenant, manager_user, rate_type="hourly")

    assert _names(resp) == ["Hank"]


def test_ordering_az_and_za(tenant, manager_user):
    _staff(tenant, "Zara")
    _staff(tenant, "Adam")
    _staff(tenant, "Mike")

    az = _names(_list(tenant, manager_user, ordering="name"))
    za = _names(_list(tenant, manager_user, ordering="-name"))

    assert az == ["Adam", "Mike", "Zara"]
    assert za == ["Zara", "Mike", "Adam"]


def test_list_includes_active_capabilities(tenant, manager_user):
    yoga = ClassTypeFactory(tenant=tenant, name="Yoga")
    gone = ClassTypeFactory(tenant=tenant, name="Gone")
    alice = _staff(tenant, "Alice")
    _capability(tenant, alice, yoga)
    deleted = _capability(tenant, alice, gone)
    deleted.is_deleted = True
    deleted.save(update_fields=["is_deleted"])

    resp = _list(tenant, manager_user)
    rows = resp.data["results"] if isinstance(resp.data, dict) else resp.data
    alice_row = next(r for r in rows if r["name"] == "Alice")

    names = {c["class_type_name"] for c in alice_row["capabilities"]}
    assert names == {"Yoga"}  # soft-deleted capability excluded
