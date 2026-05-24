from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    StaffWhatsAppConsentViewSet,
    WhatsAppAccountViewSet,
    WhatsAppMessageViewSet,
    WhatsAppTemplateViewSet,
    WhatsAppWebhookView,
)

router = DefaultRouter()
router.register("accounts", WhatsAppAccountViewSet, basename="whatsapp-accounts")
router.register("templates", WhatsAppTemplateViewSet, basename="whatsapp-templates")
router.register("messages", WhatsAppMessageViewSet, basename="whatsapp-messages")
router.register("consents", StaffWhatsAppConsentViewSet, basename="whatsapp-consents")

urlpatterns = [
    path("webhook/", WhatsAppWebhookView.as_view(), name="whatsapp-webhook"),
    path("", include(router.urls)),
]
