from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AttendanceRecordViewSet

router = DefaultRouter()
router.register("records", AttendanceRecordViewSet, basename="attendance-records")

urlpatterns = [
    path("", include(router.urls)),
]
