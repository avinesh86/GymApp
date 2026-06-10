"""
F11 — assigning a colour to a class type via the Settings > Classes form.

The colour is stored on ClassType and round-trips through the API.
"""

import pytest
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.timetable.models import ClassType
from apps.timetable.views import ClassTypeViewSet

pytestmark = pytest.mark.django_db


def test_create_class_type_with_colour(tenant, manager_user):
    request = APIRequestFactory().post(
        "/api/v1/timetable/class-types/",
        {"name": "Spin", "color": "#ff0055", "duration_minutes": 45},
        format="json",
    )
    force_authenticate(request, user=manager_user)
    request.tenant = tenant

    response = ClassTypeViewSet.as_view({"post": "create"})(request)

    assert response.status_code == 201
    assert response.data["color"] == "#ff0055"
    assert ClassType.objects.get(name="Spin").color == "#ff0055"


def test_update_class_type_colour(tenant, manager_user, class_type):
    request = APIRequestFactory().patch(
        f"/api/v1/timetable/class-types/{class_type.id}/",
        {"color": "#00aa88"},
        format="json",
    )
    force_authenticate(request, user=manager_user)
    request.tenant = tenant

    response = ClassTypeViewSet.as_view({"patch": "partial_update"})(request, pk=class_type.id)

    assert response.status_code == 200
    class_type.refresh_from_db()
    assert class_type.color == "#00aa88"
