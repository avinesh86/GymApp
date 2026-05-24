from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ImportJobViewSet

router = DefaultRouter()
router.register("", ImportJobViewSet, basename="imports")

urlpatterns = [
    path("", include(router.urls)),
]
