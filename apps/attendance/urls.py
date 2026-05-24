from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AttendanceRecordViewSet, QRAttendanceTokenViewSet

router = DefaultRouter()
router.register("records", AttendanceRecordViewSet, basename="attendance-records")
router.register("qr-tokens", QRAttendanceTokenViewSet, basename="qr-tokens")

urlpatterns = [
    path("", include(router.urls)),
]
