from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import CurrentTenantBrandingView, CurrentTenantSettingsView, CurrentWhatsAppAccountView, SiteViewSet

router = DefaultRouter()
router.register("sites", SiteViewSet, basename="sites")

urlpatterns = [
    path("branding/", CurrentTenantBrandingView.as_view(), name="tenant-branding"),
    path("settings/", CurrentTenantSettingsView.as_view(), name="tenant-settings"),
    path("whatsapp-account/", CurrentWhatsAppAccountView.as_view(), name="tenant-whatsapp-account"),
    path("", include(router.urls)),
]
