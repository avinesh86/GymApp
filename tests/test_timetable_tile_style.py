"""
Timetable tile colours: each gym picks how strongly a class's colour shows on
its tile (stripe, tint or solid) in Settings → Timetable, and every role that
sees the timetable gets that choice and each class's colour.
"""

import pytest
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.tenants.models import TenantSettings
from apps.tenants.views import CurrentTenantSettingsView, TimetableDisplayView
from apps.timetable.serializers import TimetableEventSerializer

pytestmark = pytest.mark.django_db


def _request(method, url, user, tenant, data=None):
    factory = APIRequestFactory()
    request = (
        getattr(factory, method)(url, data, format="json")
        if data is not None
        else getattr(factory, method)(url)
    )
    force_authenticate(request, user=user)
    request.tenant = tenant
    return request


def test_defaults_to_tint(tenant, instructor_user):
    response = TimetableDisplayView.as_view()(
        _request("get", "/api/v1/tenants/timetable-display/", instructor_user, tenant)
    )
    assert response.status_code == 200
    assert response.data == {"tile_style": "tint"}


def test_admin_saves_the_style_and_instructors_see_it(
    tenant, admin_user, instructor_user
):
    response = CurrentTenantSettingsView.as_view()(
        _request(
            "patch",
            "/api/v1/tenants/settings/",
            admin_user,
            tenant,
            {"timetable_tile_style": "solid"},
        ),
    )
    assert response.status_code == 200
    assert TenantSettings.objects.get(tenant=tenant).timetable_tile_style == "solid"

    response = TimetableDisplayView.as_view()(
        _request("get", "/api/v1/tenants/timetable-display/", instructor_user, tenant)
    )
    assert response.data == {"tile_style": "solid"}


def test_rejects_an_unknown_style(tenant, admin_user):
    response = CurrentTenantSettingsView.as_view()(
        _request(
            "patch",
            "/api/v1/tenants/settings/",
            admin_user,
            tenant,
            {"timetable_tile_style": "neon"},
        ),
    )
    assert response.status_code == 400


def test_another_gym_cannot_read_it(tenant, other_tenant, instructor_user):
    response = TimetableDisplayView.as_view()(
        _request(
            "get", "/api/v1/tenants/timetable-display/", instructor_user, other_tenant
        ),
    )
    assert response.status_code == 403


def test_events_carry_their_class_colour(future_event):
    future_event.class_type.color = "#0d9488"
    future_event.class_type.save()
    assert TimetableEventSerializer(future_event).data["class_type_color"] == "#0d9488"
