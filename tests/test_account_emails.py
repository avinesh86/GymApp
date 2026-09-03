"""The invite and password-reset emails: HTML button plus a text fallback."""

import pytest
from django.core import mail
from django.test import override_settings

from apps.users.emails import send_invite_email, send_password_reset_email
from tests.factories import TenantFactory, UserFactory


def html_part(message) -> str:
    """The text/html alternative. Django stores these as (content, mimetype)."""
    for content, mimetype in message.alternatives:
        if mimetype == "text/html":
            return content
    raise AssertionError("message has no text/html alternative")


@pytest.fixture
def staff_user(db):
    tenant = TenantFactory(slug="email-gym", name="Northern Arena")
    return UserFactory(
        tenant=tenant, role="instructor", first_name="Casey", email="casey@example.com"
    )


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    FRONTEND_URL="https://fitops.example.nz",
)
@pytest.mark.parametrize(
    "send, expected_label",
    [(send_password_reset_email, "Reset password"), (send_invite_email, "Set your password")],
)
def test_the_email_carries_a_button_and_a_text_fallback(staff_user, send, expected_label):
    assert send(staff_user) is True

    message = mail.outbox[0]
    html = html_part(message)

    assert expected_label in html, "the button label should be in the HTML part"
    assert "cta-button" in html
    assert "https://fitops.example.nz/set-password?" in html
    # The plain-text part must still carry the raw link for clients that
    # cannot render HTML, and for people who forward the message.
    assert "https://fitops.example.nz/set-password?" in message.body


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
def test_the_recipient_is_greeted_by_name(staff_user):
    send_password_reset_email(staff_user)

    assert "Hi Casey," in html_part(mail.outbox[0])


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
def test_a_nameless_user_is_greeted_without_one(db):
    tenant = TenantFactory(slug="email-gym-2")
    user = UserFactory(tenant=tenant, first_name="", last_name="", email="x@example.com")

    send_password_reset_email(user)

    assert "Hi there," in html_part(mail.outbox[0])


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
def test_the_invite_names_the_gym(staff_user):
    send_invite_email(staff_user)

    message = mail.outbox[0]
    assert "Northern Arena" in message.subject
    assert "Northern Arena" in html_part(message)


def test_a_send_failure_is_logged_not_raised(staff_user, monkeypatch):
    """send_invite_email is called during staff creation — it must not break it."""
    from django.core.mail import EmailMultiAlternatives

    def boom(self, *args, **kwargs):
        raise RuntimeError("resend is down")

    monkeypatch.setattr(EmailMultiAlternatives, "send", boom)

    assert send_password_reset_email(staff_user) is False
