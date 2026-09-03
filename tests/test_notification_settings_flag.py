"""Whether the gym is asked for a mail account depends on the deployment."""

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from apps.tenants.email import get_tenant_email_sender
from apps.tenants.serializers import TenantSettingsSerializer
from apps.users.models import Membership
from tests.factories import (
    TenantDomainFactory,
    TenantFactory,
    TenantSettingsFactory,
    UserFactory,
)

HOST = "flag.localhost"

TEST_KEY = "dGVzdC1rZXktZm9yLXVuaXQtdGVzdHMtMzJieXRlcyE="


@pytest.fixture
def gym(db):
    tenant = TenantFactory(slug="flag-gym", name="Flag Gym")
    TenantDomainFactory(tenant=tenant, domain=HOST)
    return tenant


@pytest.fixture
def settings_row(gym):
    return TenantSettingsFactory(
        tenant=gym, notification_from_email="replies@flaggym.co.nz"
    )


@override_settings(RESEND_API_KEY="re_test")
def test_managed_when_the_server_sends_mail_itself(settings_row):
    data = TenantSettingsSerializer(settings_row).data

    assert data["email_sending_managed"] is True


@override_settings(RESEND_API_KEY="")
def test_not_managed_when_mail_goes_over_smtp(settings_row):
    """PythonAnywhere and local dev still need the gym's own mail account."""
    data = TenantSettingsSerializer(settings_row).data

    assert data["email_sending_managed"] is False


@override_settings(FIELD_ENCRYPTION_KEY=TEST_KEY)
def test_the_password_is_never_returned(settings_row):
    """It is write-only, and hiding the field must not change that."""
    settings_row.notification_email_password = "hzrhspuriuxsvnpl"
    settings_row.save()

    data = TenantSettingsSerializer(settings_row).data

    assert "notification_email_password" not in data
    assert data["notification_email_password_set"] is True


@override_settings(RESEND_API_KEY="re_test", FIELD_ENCRYPTION_KEY=TEST_KEY)
def test_sending_is_unchanged_with_resend(settings_row, gym):
    """The guard on this work: adding a reported flag must not alter how mail
    is actually sent. With Resend, no tenant connection and the gym's address
    as reply-to."""
    sender = get_tenant_email_sender(gym, default_display_name=gym.name)

    assert sender.connection is None
    assert sender.reply_to == "replies@flaggym.co.nz"


@override_settings(RESEND_API_KEY="", FIELD_ENCRYPTION_KEY=TEST_KEY)
def test_the_smtp_fallback_still_works(gym):
    """The app password is still read where there is no managed sending —
    removing that path would have broken every SMTP deployment."""
    row = TenantSettingsFactory(tenant=gym, notification_from_email="gym@gmail.com")
    row.notification_email_password = "hzrhspuriuxsvnpl"
    row.save()

    sender = get_tenant_email_sender(gym, default_display_name=gym.name)

    assert sender.connection is not None, "SMTP connection must still be built"
    assert sender.connection.username == "gym@gmail.com"


@override_settings(RESEND_API_KEY="re_test")
def test_the_flag_reaches_the_api(gym, settings_row):
    user = UserFactory(tenant=gym, role="admin")
    Membership.objects.get_or_create(
        user=user, tenant=gym, defaults={"role": "admin", "is_active": True}
    )
    client = APIClient()
    client.force_authenticate(user=user)
    client.defaults["HTTP_HOST"] = HOST

    response = client.get("/api/v1/tenants/settings/")

    assert response.status_code == 200, response.data
    payload = response.data[0] if isinstance(response.data, list) else response.data
    if "results" in payload:
        payload = payload["results"][0]
    assert payload["email_sending_managed"] is True
