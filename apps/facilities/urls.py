from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    EquipmentViewSet,
    FacilitiesConfigView,
    FacilitiesSummaryView,
    FaultBoardViewSet,
    FaultReportViewSet,
)

router = DefaultRouter()
router.register("equipment", EquipmentViewSet, basename="facilities-equipment")
router.register("faults", FaultReportViewSet, basename="facilities-faults")
router.register("fault-board", FaultBoardViewSet, basename="facilities-fault-board")

urlpatterns = [
    path("config/", FacilitiesConfigView.as_view(), name="facilities-config"),
    path("summary/", FacilitiesSummaryView.as_view(), name="facilities-summary"),
    path("", include(router.urls)),
]
