"""
Tests for WhatsApp webhook: verify token check and message processing.
"""

import hashlib
import hmac
import json

from django.test import TestCase, RequestFactory
from django.urls import reverse

from tests.factories import (
    ClassTypeFactory,
    StaffProfileFactory,
    TenantDomainFactory,
    TenantFactory,
    TimetableEventFactory,
    UserFactory,
    WhatsAppAccountFactory,
)


class WhatsAppWebhookVerificationTest(TestCase):
    def setUp(self):
        self.tenant = TenantFactory()
        TenantDomainFactory(tenant=self.tenant, domain="wa-test.localhost")
        self.account = WhatsAppAccountFactory(
            tenant=self.tenant,
            webhook_verify_token="my-secret-token",
        )

    def test_verify_webhook_valid_token(self):
        from apps.whatsapp.services import verify_webhook

        result = verify_webhook(
            verify_token="my-secret-token",
            hub_challenge="123456",
            expected_token="my-secret-token",
        )
        self.assertEqual(result, "123456")

    def test_verify_webhook_invalid_token(self):
        from apps.whatsapp.services import verify_webhook

        result = verify_webhook(
            verify_token="wrong-token",
            hub_challenge="123456",
            expected_token="my-secret-token",
        )
        self.assertIsNone(result)

    def test_validate_meta_signature_valid(self):
        from django.conf import settings
        from apps.whatsapp.services import validate_meta_signature

        original_secret = getattr(settings, "META_APP_SECRET", "")
        settings.META_APP_SECRET = "test-app-secret"

        body = b'{"test": "payload"}'
        signature = hmac.new(
            b"test-app-secret",
            msg=body,
            digestmod=hashlib.sha256,
        ).hexdigest()

        result = validate_meta_signature(body, f"sha256={signature}")
        self.assertTrue(result)

        settings.META_APP_SECRET = original_secret

    def test_validate_meta_signature_invalid(self):
        from django.conf import settings
        from apps.whatsapp.services import validate_meta_signature

        original_secret = getattr(settings, "META_APP_SECRET", "")
        settings.META_APP_SECRET = "test-app-secret"

        body = b'{"test": "payload"}'
        result = validate_meta_signature(body, "sha256=invalidsignature")
        self.assertFalse(result)

        settings.META_APP_SECRET = original_secret


class WhatsAppMessageProcessingTest(TestCase):
    def setUp(self):
        self.tenant = TenantFactory()
        TenantDomainFactory(tenant=self.tenant, domain="wa-msg-test.localhost")
        self.admin = UserFactory(tenant=self.tenant, role="admin")
        self.staff = StaffProfileFactory(tenant=self.tenant)
        self.account = WhatsAppAccountFactory(tenant=self.tenant)

    def test_inbound_message_stored(self):
        from apps.whatsapp.models import WhatsAppMessage
        from apps.whatsapp.services import process_inbound_message

        message_data = {
            "from": "+61400000001",
            "type": "text",
            "text": {"body": "Hello there"},
            "id": "wamid.test123",
        }
        process_inbound_message(message_data, self.tenant)

        self.assertTrue(
            WhatsAppMessage.objects.filter(
                tenant=self.tenant,
                phone_number="+61400000001",
                direction="inbound",
            ).exists()
        )

    def test_handle_webhook_event_message(self):
        from apps.whatsapp.models import WhatsAppWebhookEvent
        from apps.whatsapp.services import handle_webhook_event

        payload = {
            "object": "whatsapp_business_account",
            "entry": [
                {
                    "id": "123",
                    "changes": [
                        {
                            "value": {
                                "messaging_product": "whatsapp",
                                "metadata": {"display_phone_number": "1234567890", "phone_number_id": "test"},
                                "messages": [
                                    {
                                        "from": "+61400000001",
                                        "id": "wamid.test",
                                        "timestamp": "1234567890",
                                        "type": "text",
                                        "text": {"body": "test message"},
                                    }
                                ],
                            },
                            "field": "messages",
                        }
                    ],
                }
            ],
        }

        event = handle_webhook_event(payload, self.tenant)
        self.assertIsNotNone(event)
        self.assertEqual(event.event_type, "message")
        event.refresh_from_db()
        self.assertTrue(event.processed)

    def test_cover_reply_via_whatsapp(self):
        from datetime import timedelta
        from apps.cover.models import CoverOffer, CoverRequest
        from apps.cover.services import create_cover_request, send_cover_offers
        from apps.timetable.models import ClassType, TimetableEvent
        from apps.whatsapp.models import StaffWhatsAppConsent
        from apps.whatsapp.services import process_inbound_message
        from django.utils import timezone

        class_type = ClassTypeFactory(tenant=self.tenant)
        start = timezone.now() + timedelta(days=1)
        event = TimetableEventFactory(
            tenant=self.tenant,
            class_type=class_type,
            instructor=self.staff,
            start_datetime=start,
            end_datetime=start + timedelta(hours=1),
        )

        # Give staff WhatsApp consent
        StaffWhatsAppConsent.objects.create(
            tenant=self.tenant,
            staff=self.staff,
            phone_number="+61400000001",
            consent_given=True,
            created_by=self.admin,
            updated_by=self.admin,
        )

        cover_request = create_cover_request(
            timetable_event=event,
            absence=None,
            created_by=self.admin,
        )

        # Manually create a cover offer with a known accept code
        offer = CoverOffer.objects.create(
            tenant=self.tenant,
            cover_request=cover_request,
            staff=self.staff,
            status=CoverOffer.Status.PENDING,
            accept_code="TESTCODE",
            created_by=self.admin,
            updated_by=self.admin,
        )

        message_data = {
            "from": "+61400000001",
            "type": "text",
            "text": {"body": f"ACCEPT {offer.accept_code}"},
        }

        # Processing this message should trigger cover acceptance
        process_inbound_message(message_data, self.tenant)

        offer.refresh_from_db()
        self.assertEqual(offer.status, CoverOffer.Status.ACCEPTED)
