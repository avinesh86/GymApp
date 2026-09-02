"""The Resend HTTP backend, used where outbound SMTP is blocked."""

import json
from unittest.mock import patch

import pytest
from django.core.mail import EmailMessage, EmailMultiAlternatives
from django.test import override_settings

from apps.core.email_backends import ResendEmailBackend


class FakeResponse:
    def __init__(self, status_code=200):
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            import requests

            raise requests.HTTPError(f"{self.status_code}")


@pytest.fixture
def posted():
    """Captures the payloads a backend would POST, without any network."""
    calls = []

    def fake_post(self, url, json=None, timeout=None):
        calls.append({"url": url, "payload": json})
        return FakeResponse()

    with patch("requests.Session.post", fake_post):
        yield calls


@override_settings(RESEND_API_KEY="re_test")
def test_sends_a_plain_message(posted):
    sent = ResendEmailBackend().send_messages(
        [
            EmailMessage(
                subject="Reset your password",
                body="Follow the link",
                from_email="FitOps <noreply@fitops.northernarena.nz>",
                to=["staff@example.com"],
                reply_to=["gym@northernarena.co.nz"],
            )
        ]
    )

    assert sent == 1
    payload = posted[0]["payload"]
    assert posted[0]["url"] == "https://api.resend.com/emails"
    assert payload["from"] == "FitOps <noreply@fitops.northernarena.nz>"
    assert payload["to"] == ["staff@example.com"]
    assert payload["subject"] == "Reset your password"
    assert payload["text"] == "Follow the link"
    assert payload["reply_to"] == ["gym@northernarena.co.nz"]
    assert "html" not in payload


@override_settings(RESEND_API_KEY="re_test")
def test_sends_both_bodies_of_a_multipart_message(posted):
    """Cover emails are HTML with a plain-text fallback — both must survive."""
    message = EmailMultiAlternatives(
        subject="Cover needed",
        body="Plain version",
        from_email="noreply@fitops.northernarena.nz",
        to=["staff@example.com"],
    )
    message.attach_alternative("<p>HTML version</p>", "text/html")

    ResendEmailBackend().send_messages([message])

    payload = posted[0]["payload"]
    assert payload["text"] == "Plain version"
    assert payload["html"] == "<p>HTML version</p>"


@override_settings(RESEND_API_KEY="re_test")
def test_passes_cc_and_bcc_through(posted):
    ResendEmailBackend().send_messages(
        [
            EmailMessage(
                subject="s",
                body="b",
                from_email="noreply@fitops.northernarena.nz",
                to=["a@example.com"],
                cc=["b@example.com"],
                bcc=["c@example.com"],
            )
        ]
    )

    payload = posted[0]["payload"]
    assert payload["cc"] == ["b@example.com"]
    assert payload["bcc"] == ["c@example.com"]


@override_settings(RESEND_API_KEY="re_test")
def test_counts_only_what_resend_accepted(posted):
    """A rejected message must not be counted as sent."""

    def fake_post(self, url, json=None, timeout=None):
        return FakeResponse(422)

    message = EmailMessage(
        subject="s", body="b", from_email="noreply@x.nz", to=["a@example.com"]
    )
    with patch("requests.Session.post", fake_post):
        sent = ResendEmailBackend(fail_silently=True).send_messages([message])

    assert sent == 0


@override_settings(RESEND_API_KEY="re_test")
def test_raises_when_not_failing_silently():
    def fake_post(self, url, json=None, timeout=None):
        return FakeResponse(500)

    import requests

    message = EmailMessage(
        subject="s", body="b", from_email="noreply@x.nz", to=["a@example.com"]
    )
    with patch("requests.Session.post", fake_post), pytest.raises(requests.HTTPError):
        ResendEmailBackend(fail_silently=False).send_messages([message])


@override_settings(RESEND_API_KEY="")
def test_missing_api_key_is_reported_not_swallowed():
    message = EmailMessage(
        subject="s", body="b", from_email="noreply@x.nz", to=["a@example.com"]
    )
    with pytest.raises(ValueError, match="RESEND_API_KEY"):
        ResendEmailBackend().send_messages([message])


@override_settings(RESEND_API_KEY="re_test")
def test_skips_a_message_with_no_recipients(posted):
    message = EmailMessage(subject="s", body="b", from_email="noreply@x.nz", to=[])

    assert ResendEmailBackend().send_messages([message]) == 0
    assert posted == []


@override_settings(RESEND_API_KEY="re_test")
def test_payload_is_json_serialisable(posted):
    """Guards against a non-serialisable header slipping into the payload."""
    message = EmailMessage(
        subject="s",
        body="b",
        from_email="noreply@x.nz",
        to=["a@example.com"],
        headers={"X-Entity-Ref-ID": "abc123"},
    )
    ResendEmailBackend().send_messages([message])

    payload = posted[0]["payload"]
    assert json.dumps(payload)
    assert payload["headers"] == {"X-Entity-Ref-ID": "abc123"}


@pytest.mark.parametrize(
    "settings_module", ["fitops.settings.prod", "fitops.settings.pythonanywhere"]
)
def test_deployment_settings_honour_the_email_backend_env_var(settings_module, tmp_path):
    """A hardcoded EMAIL_BACKEND silently overrides .env.

    prod.py did exactly that, so setting the Resend backend in the environment
    had no effect and mail kept going to SMTP.
    """
    import os
    import subprocess
    import sys

    env = {
        **os.environ,
        "DJANGO_SETTINGS_MODULE": settings_module,
        "EMAIL_BACKEND": "apps.core.email_backends.ResendEmailBackend",
        "ALLOWED_HOSTS": "example.test",
        "MYSQL_PASSWORD": "unused-by-this-check",
        "PA_USERNAME": "unused",
    }
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "import django; django.setup();"
            "from django.conf import settings; print(settings.EMAIL_BACKEND)",
        ],
        env=env,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "apps.core.email_backends.ResendEmailBackend" in result.stdout
