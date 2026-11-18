from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ChecklistAnswerPhotoView,
    ChecklistRunViewSet,
    ChecklistTemplateViewSet,
    EquipmentScanView,
    EquipmentViewSet,
    FacilitiesConfigView,
    FacilitiesPeopleView,
    FacilitiesSummaryView,
    FaultBoardViewSet,
    FaultReportViewSet,
    LicenceViewSet,
    SubscriptionViewSet,
)

router = DefaultRouter()
router.register("equipment", EquipmentViewSet, basename="facilities-equipment")
router.register("faults", FaultReportViewSet, basename="facilities-faults")
router.register("fault-board", FaultBoardViewSet, basename="facilities-fault-board")
router.register("checklists", ChecklistTemplateViewSet, basename="facilities-checklists")
router.register("checklist-runs", ChecklistRunViewSet, basename="facilities-checklist-runs")
router.register("licences", LicenceViewSet, basename="facilities-licences")
router.register("subscriptions", SubscriptionViewSet, basename="facilities-subscriptions")

urlpatterns = [
    path("config/", FacilitiesConfigView.as_view(), name="facilities-config"),
    path("summary/", FacilitiesSummaryView.as_view(), name="facilities-summary"),
    path("people/", FacilitiesPeopleView.as_view(), name="facilities-people"),
    path("equipment/<int:pk>/scan/", EquipmentScanView.as_view(), name="facilities-equipment-scan"),
    path(
        "checklist-answers/<int:pk>/photo/",
        ChecklistAnswerPhotoView.as_view(),
        name="facilities-checklist-photo",
    ),
    path("", include(router.urls)),
]
