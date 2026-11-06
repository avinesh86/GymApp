"""Saving settings refuses to overwrite a change made since the form opened.

The Settings forms send, with each save, the values the fields they change
had when the form opened ("expected"). If any of those fields has been
changed since, by another admin, the save is refused with 409 and the
current values, so the form can say what changed instead of quietly writing
its older values over the newer ones.
"""

import pytest
from rest_framework.test import APIClient

from apps.whatsapp.models import WhatsAppAccount
from tests.factories import TenantSettingsFactory

SETTINGS = "/api/v1/tenants/settings/"
BRANDING = "/api/v1/tenants/branding/"
WHATSAPP = "/api/v1/tenants/whatsapp-account/"


@pytest.fixture
def client(admin_user):
    c = APIClient()
    c.force_authenticate(user=admin_user)
    c.defaults["HTTP_HOST"] = "test.localhost"
    return c


@pytest.fixture
def gym_settings(tenant):
    return TenantSettingsFactory(
        tenant=tenant, timezone="Pacific/Auckland", invoice_frequency="monthly"
    )


def test_saves_when_the_fields_are_as_the_form_last_saw_them(client, gym_settings):
    response = client.patch(
        SETTINGS,
        {"invoice_frequency": "weekly", "expected": {"invoice_frequency": "monthly"}},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["invoice_frequency"] == "weekly"
    gym_settings.refresh_from_db()
    assert gym_settings.invoice_frequency == "weekly"


def test_refuses_to_overwrite_a_field_someone_else_changed(client, gym_settings):
    gym_settings.invoice_frequency = "fortnightly"  # another admin's save
    gym_settings.save()

    response = client.patch(
        SETTINGS,
        {"invoice_frequency": "weekly", "expected": {"invoice_frequency": "monthly"}},
        format="json",
    )

    assert response.status_code == 409
    assert response.data["changed"] == ["invoice_frequency"]
    assert response.data["current"]["invoice_frequency"] == "fortnightly"
    gym_settings.refresh_from_db()
    assert gym_settings.invoice_frequency == "fortnightly"


def test_a_change_to_a_field_the_save_leaves_alone_does_not_block_it(
    client, gym_settings
):
    gym_settings.timezone = "Europe/London"
    gym_settings.save()

    response = client.patch(
        SETTINGS,
        {"invoice_frequency": "weekly", "expected": {"invoice_frequency": "monthly"}},
        format="json",
    )

    assert response.status_code == 200
    gym_settings.refresh_from_db()
    assert gym_settings.timezone == "Europe/London"  # theirs is kept
    assert gym_settings.invoice_frequency == "weekly"


def test_saves_without_expected_values_work_as_before(client, gym_settings):
    """Other callers (the auto-saving switches, older pages) don't send them."""
    response = client.patch(SETTINGS, {"timezone": "Europe/Paris"}, format="json")

    assert response.status_code == 200
    gym_settings.refresh_from_db()
    assert gym_settings.timezone == "Europe/Paris"


def test_expected_values_must_be_an_object(client, gym_settings):
    response = client.patch(
        SETTINGS, {"timezone": "Europe/Paris", "expected": "monthly"}, format="json"
    )

    assert response.status_code == 400
    gym_settings.refresh_from_db()
    assert gym_settings.timezone == "Pacific/Auckland"


def test_branding_refuses_to_overwrite_a_newer_app_name(client, tenant):
    from apps.tenants.models import TenantBranding

    TenantBranding.objects.update_or_create(
        tenant=tenant, defaults={"app_name": "Theirs"}
    )

    response = client.patch(
        BRANDING,
        {"app_name": "Mine", "expected": {"app_name": "Original"}},
        format="json",
    )

    assert response.status_code == 409
    assert response.data["changed"] == ["app_name"]
    assert TenantBranding.objects.get(tenant=tenant).app_name == "Theirs"


def test_whatsapp_refuses_to_overwrite_a_newer_number(client, tenant, admin_user):
    WhatsAppAccount.objects.create(
        tenant=tenant,
        display_name="Gym",
        business_phone_number="+64220000002",
        created_by=admin_user,
        updated_by=admin_user,
    )

    response = client.patch(
        WHATSAPP,
        {
            "business_phone_number": "+64220000003",
            "expected": {"business_phone_number": "+64220000001"},
        },
        format="json",
    )

    assert response.status_code == 409
    assert (
        WhatsAppAccount.objects.get(tenant=tenant).business_phone_number
        == "+64220000002"
    )


def test_another_gyms_settings_are_untouched(client, gym_settings, other_tenant):
    theirs = TenantSettingsFactory(tenant=other_tenant, invoice_frequency="monthly")

    client.patch(
        SETTINGS,
        {"invoice_frequency": "weekly", "expected": {"invoice_frequency": "monthly"}},
        format="json",
    )

    theirs.refresh_from_db()
    assert theirs.invoice_frequency == "monthly"


def test_setting_a_field_to_what_someone_else_already_set_is_not_a_conflict(client, gym_settings):
    """Both admins chose the same value: nothing to choose between."""
    gym_settings.invoice_frequency = "weekly"
    gym_settings.save()

    response = client.patch(
        SETTINGS,
        {"invoice_frequency": "weekly", "expected": {"invoice_frequency": "monthly"}},
        format="json",
    )

    assert response.status_code == 200


def test_a_body_that_is_not_an_object_is_a_bad_request_not_a_server_error(client, gym_settings):
    for body in ([1, 2], "monthly"):
        response = client.patch(SETTINGS, body, format="json")
        assert response.status_code == 400, body
