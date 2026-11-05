from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    CurrentTenantBrandingView,
    CurrentTenantSettingsView,
    CurrentWhatsAppAccountView,
    GymLocaleView,
    SiteViewSet,
    TenantSetupStatusView,
    TimetableDisplayView,
)

router = DefaultRouter()
router.register("sites", SiteViewSet, basename="sites")

urlpatterns = [
    path("branding/", CurrentTenantBrandingView.as_view(), name="tenant-branding"),
    path("settings/", CurrentTenantSettingsView.as_view(), name="tenant-settings"),
    path("locale/", GymLocaleView.as_view(), name="tenant-locale"),
    path("setup-status/", TenantSetupStatusView.as_view(), name="setup-status"),
    path("timetable-display/", TimetableDisplayView.as_view(), name="timetable-display"),
    path("whatsapp-account/", CurrentWhatsAppAccountView.as_view(), name="tenant-whatsapp-account"),
    path("", include(router.urls)),
]
