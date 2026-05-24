import logging

from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from apps.core.mixins import TenantScopedMixin
from apps.core.permissions import IsAdmin

from .models import StaffWhatsAppConsent, WhatsAppAccount, WhatsAppMessage, WhatsAppTemplate
from .serializers import (
    StaffWhatsAppConsentSerializer,
    WhatsAppAccountSerializer,
    WhatsAppMessageSerializer,
    WhatsAppTemplateSerializer,
)
from .services import handle_webhook_event, validate_meta_signature, verify_webhook

logger = logging.getLogger(__name__)


class WebhookThrottle(AnonRateThrottle):
    rate = "100/min"


@method_decorator(csrf_exempt, name="dispatch")
class WhatsAppWebhookView(APIView):
    """
    Meta webhook endpoint.
    GET  — verification challenge
    POST — incoming messages / status updates
    """

    authentication_classes = []
    permission_classes = []
    throttle_classes = [WebhookThrottle]

    def _resolve_tenant_from_verify_token(self, token: str):
        """
        Finds the tenant by matching the webhook verify token across all
        WhatsApp accounts. Used during Meta's GET verification handshake
        when no domain-based tenant is available.
        """
        account = WhatsAppAccount.objects.select_related("tenant").filter(
            webhook_verify_token=token,
            is_active=True,
            tenant__is_active=True,
        ).first()
        return account.tenant if account else None

    def _resolve_tenant_from_payload(self, payload: dict):
        """
        Finds the tenant by matching the phone_number_id in the webhook
        payload against WhatsApp accounts. Used for POST events.
        """
        try:
            phone_number_id = (
                payload["entry"][0]["changes"][0]["value"]["metadata"]["phone_number_id"]
            )
        except (KeyError, IndexError):
            return None

        account = WhatsAppAccount.objects.select_related("tenant").filter(
            phone_number_id=phone_number_id,
            is_active=True,
            tenant__is_active=True,
        ).first()
        return account.tenant if account else None

    def get(self, request):
        mode = request.query_params.get("hub.mode")
        token = request.query_params.get("hub.verify_token")
        challenge = request.query_params.get("hub.challenge")

        if mode != "subscribe":
            return Response({"detail": "Invalid mode."}, status=status.HTTP_400_BAD_REQUEST)

        # Tenant may be None when accessed via external domain (e.g. ngrok)
        tenant = getattr(request, "tenant", None) or self._resolve_tenant_from_verify_token(token)
        if tenant is None:
            logger.warning("Webhook GET: could not resolve tenant for verify token")
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        account = WhatsAppAccount.objects.filter(tenant=tenant, is_active=True).first()
        if not account:
            return Response(status=status.HTTP_404_NOT_FOUND)

        result = verify_webhook(token, challenge, account.webhook_verify_token)
        if result is None:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        # Meta expects the raw challenge string as the response body
        from django.http import HttpResponse
        return HttpResponse(result, content_type="text/plain", status=200)

    def post(self, request):
        signature = request.META.get("HTTP_X_HUB_SIGNATURE_256", "")
        if not validate_meta_signature(request.body, signature):
            logger.warning("Invalid Meta webhook signature")
            return Response({"detail": "Invalid signature."}, status=status.HTTP_403_FORBIDDEN)

        tenant = getattr(request, "tenant", None) or self._resolve_tenant_from_payload(request.data)
        if tenant is None:
            logger.warning("Webhook POST: could not resolve tenant from payload")
            return Response({"status": "ok"}, status=status.HTTP_200_OK)

        handle_webhook_event(request.data, tenant)
        return Response({"status": "ok"}, status=status.HTTP_200_OK)


class WhatsAppAccountViewSet(TenantScopedMixin, ModelViewSet):
    serializer_class = WhatsAppAccountSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        return WhatsAppAccount.objects.filter(tenant=self.request.tenant, is_deleted=False)


class WhatsAppTemplateViewSet(TenantScopedMixin, ModelViewSet):
    serializer_class = WhatsAppTemplateSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        return WhatsAppTemplate.objects.filter(tenant=self.request.tenant, is_deleted=False)


class WhatsAppMessageViewSet(TenantScopedMixin, ModelViewSet):
    serializer_class = WhatsAppMessageSerializer
    permission_classes = [IsAdmin]
    http_method_names = ["get", "head", "options"]  # read-only

    def get_queryset(self):
        return (
            WhatsAppMessage.objects.filter(tenant=self.request.tenant, is_deleted=False)
            .select_related("staff", "template")
            .order_by("-created_at")
        )


class StaffWhatsAppConsentViewSet(TenantScopedMixin, ModelViewSet):
    serializer_class = StaffWhatsAppConsentSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        return StaffWhatsAppConsent.objects.filter(
            tenant=self.request.tenant, is_deleted=False
        ).select_related("staff")
