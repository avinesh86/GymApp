from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_nested import routers as nested_routers

from .views import (
    StaffAvailabilityViewSet,
    StaffCapabilityViewSet,
    StaffPayRateOverrideViewSet,
    StaffPayRateViewSet,
    StaffProfileViewSet,
    StaffQualificationViewSet,
)

router = DefaultRouter()
router.register("", StaffProfileViewSet, basename="staff")

staff_router = nested_routers.NestedDefaultRouter(router, "", lookup="staff")
staff_router.register("qualifications", StaffQualificationViewSet, basename="staff-qualifications")
staff_router.register("capabilities", StaffCapabilityViewSet, basename="staff-capabilities")
staff_router.register("availability", StaffAvailabilityViewSet, basename="staff-availability")
staff_router.register("pay-rates", StaffPayRateViewSet, basename="staff-pay-rates")
staff_router.register("pay-rate-overrides", StaffPayRateOverrideViewSet, basename="staff-pay-rate-overrides")

urlpatterns = [
    path("", include(router.urls)),
    path("", include(staff_router.urls)),
]
