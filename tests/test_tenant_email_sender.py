"""Sender resolution for tenant-configured outgoing email."""

import pytest
from django.test import override_settings

from apps.tenants.email import get_tenant_email_sender
from tests.factories import TenantFactory, TenantSettingsFactory


@pytest.fixture
def gym(db):
    return TenantFactory(name="Northern Arena", slug="northern-arena")


@override_settings(DEFAULT_FROM_EMAIL="FitOps <noreply@fitops.io>")
def test_falls_back_without_nesting_the_default_address(gym):
    """A DEFAULT_FROM_EMAIL that already names its sender must not be wrapped again."""
    TenantSettingsFactory(tenant=gym)

    sender = get_tenant_email_sender(gym, default_display_name=gym.name)

    assert sender.address == "noreply@fitops.io"
    assert sender.from_email == "Northern Arena <noreply@fitops.io>"


@override_settings(DEFAULT_FROM_EMAIL="noreply@fitops.io")
def test_falls_back_to_a_bare_default_address(gym):
    TenantSettingsFactory(tenant=gym)

    sender = get_tenant_email_sender(gym, default_display_name=gym.name)

    assert sender.from_email == "Northern Arena <noreply@fitops.io>"


@override_settings(DEFAULT_FROM_EMAIL="FitOps <noreply@fitops.io>")
def test_borrows_the_default_display_name_when_nothing_else_names_the_sender(gym):
    TenantSettingsFactory(tenant=gym)

    sender = get_tenant_email_sender(gym)

    assert sender.from_email == "FitOps <noreply@fitops.io>"


def test_uses_the_tenant_sender_when_configured(gym):
    settings_row = TenantSettingsFactory(
        tenant=gym,
        notification_from_email="gym@gmail.com",
        notification_from_name="Northern Arena Team",
    )
    settings_row.notification_email_password = "hzrhspuriuxsvnpl"
    settings_row.save()

    sender = get_tenant_email_sender(gym, default_display_name=gym.name)

    assert sender.connection is not None
    assert sender.connection.username == "gym@gmail.com"
    assert sender.from_email == "Northern Arena Team <gym@gmail.com>"


def test_quotes_a_display_name_containing_a_comma(gym):
    settings_row = TenantSettingsFactory(
        tenant=gym,
        notification_from_email="gym@gmail.com",
        notification_from_name="Northern Arena, Ltd",
    )
    settings_row.notification_email_password = "hzrhspuriuxsvnpl"
    settings_row.save()

    sender = get_tenant_email_sender(gym, default_display_name=gym.name)

    assert sender.from_email == '"Northern Arena, Ltd" <gym@gmail.com>'


@override_settings(DEFAULT_FROM_EMAIL="noreply@fitops.io")
def test_unreadable_password_falls_back_instead_of_raising(gym):
    """A FIELD_ENCRYPTION_KEY mismatch must not break every send path."""
    settings_row = TenantSettingsFactory(
        tenant=gym, notification_from_email="gym@gmail.com"
    )
    settings_row.notification_email_password = "hzrhspuriuxsvnpl"
    settings_row.save()

    with override_settings(FIELD_ENCRYPTION_KEY="9" * 43 + "="):
        sender = get_tenant_email_sender(gym, default_display_name=gym.name)

    assert sender.connection is None
    assert sender.address == "noreply@fitops.io"
