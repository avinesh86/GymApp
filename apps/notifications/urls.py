from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import NotificationPreferenceViewSet, NotificationViewSet

router = DefaultRouter()
router.register("", NotificationViewSet, basename="notifications")
router.register("preferences", NotificationPreferenceViewSet, basename="notification-preferences")

urlpatterns = [
    path("", include(router.urls)),
]
