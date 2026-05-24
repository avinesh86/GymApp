from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AbsenceViewSet, CoverOfferViewSet, CoverRequestViewSet

router = DefaultRouter()
router.register("absences", AbsenceViewSet, basename="absences")
router.register("requests", CoverRequestViewSet, basename="cover-requests")
router.register("offers", CoverOfferViewSet, basename="cover-offers")

urlpatterns = [
    path("", include(router.urls)),
]
