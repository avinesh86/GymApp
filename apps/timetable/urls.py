from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_nested import routers as nested_routers

from .views import (
    ClassBonusViewSet,
    ClassTypeViewSet,
    RecurringTimetableRuleViewSet,
    TimetableEventViewSet,
)

router = DefaultRouter()
router.register("class-types", ClassTypeViewSet, basename="class-types")
router.register("recurring-rules", RecurringTimetableRuleViewSet, basename="recurring-rules")
router.register("events", TimetableEventViewSet, basename="timetable-events")

class_type_router = nested_routers.NestedDefaultRouter(router, "class-types", lookup="class_type")
class_type_router.register("bonuses", ClassBonusViewSet, basename="class-type-bonuses")

urlpatterns = [
    path("", include(router.urls)),
    path("", include(class_type_router.urls)),
]
