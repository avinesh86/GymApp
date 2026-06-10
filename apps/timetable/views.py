from datetime import date

from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.core.mixins import TenantScopedMixin
from apps.core.permissions import IsGymManager, IsTeamLeader
from apps.staff.models import StaffProfile

from .models import ClassBonus, ClassType, RecurringTimetableRule, TimetableEvent
from .serializers import (
    AssignInstructorSerializer,
    CancelEventSerializer,
    ClassBonusSerializer,
    ClassTypeSerializer,
    RecurringTimetableRuleSerializer,
    TimetableEventSerializer,
)
from .services import assign_instructor, cancel_event, get_week_events


class ClassTypeViewSet(TenantScopedMixin, ModelViewSet):
    serializer_class = ClassTypeSerializer
    permission_classes = [IsGymManager]

    def get_queryset(self):
        return (
            ClassType.objects.filter(tenant=self.request.tenant, is_deleted=False)
            .prefetch_related("bonuses")
            .order_by("name")
        )


class ClassBonusViewSet(TenantScopedMixin, ModelViewSet):
    serializer_class = ClassBonusSerializer
    permission_classes = [IsGymManager]

    def get_queryset(self):
        return ClassBonus.objects.filter(
            tenant=self.request.tenant,
            is_deleted=False,
            class_type_id=self.kwargs.get("class_type_pk"),
        )

    def perform_create(self, serializer):
        class_type = ClassType.objects.get(
            pk=self.kwargs["class_type_pk"], tenant=self.request.tenant
        )
        serializer.save(
            tenant=self.request.tenant,
            class_type=class_type,
            created_by=self.request.user,
            updated_by=self.request.user,
        )


class RecurringTimetableRuleViewSet(TenantScopedMixin, ModelViewSet):
    serializer_class = RecurringTimetableRuleSerializer
    permission_classes = [IsGymManager]

    def get_queryset(self):
        return RecurringTimetableRule.objects.filter(
            tenant=self.request.tenant, is_deleted=False
        ).select_related("class_type", "site", "instructor").order_by("day_of_week", "start_time")

    @action(detail=True, methods=["post"], url_path="generate")
    def generate(self, request, pk=None):
        """Immediately generate TimetableEvent rows for this rule.

        Generates from the rule's valid_from (or today, whichever is later) up to
        valid_to (or 12 weeks out if no end date was set).
        """
        from datetime import date, timedelta

        from .services import generate_recurring_events

        rule = self.get_object()
        today = date.today()
        from_date = max(today, rule.valid_from)
        to_date = rule.valid_to or (today + timedelta(weeks=12))

        created = generate_recurring_events(rule, from_date, to_date)
        return Response({"created": len(created)}, status=status.HTTP_200_OK)


class TimetableEventViewSet(TenantScopedMixin, ModelViewSet):
    serializer_class = TimetableEventSerializer
    permission_classes = [IsTeamLeader]
    filterset_fields = ["status", "class_type", "site", "instructor"]

    def get_queryset(self):
        qs = (
            TimetableEvent.objects.filter(tenant=self.request.tenant, is_deleted=False)
            .select_related("class_type", "site", "instructor")
            .order_by("start_datetime")
        )
        params = self.request.query_params
        from_str = params.get("from")
        to_str = params.get("to")
        try:
            if from_str:
                qs = qs.filter(start_datetime__date__gte=date.fromisoformat(from_str))
            if to_str:
                qs = qs.filter(start_datetime__date__lte=date.fromisoformat(to_str))
        except ValueError:
            pass
        return qs

    @action(detail=False, methods=["get"], url_path="week")
    def week(self, request):
        from_date_str = request.query_params.get("from")
        try:
            from_date = date.fromisoformat(from_date_str) if from_date_str else date.today()
        except ValueError:
            return Response({"detail": "Invalid date format. Use YYYY-MM-DD."}, status=400)
        events = get_week_events(request.tenant, from_date)

        # Mirror the list view's filters so the calendar can filter too.
        params = request.query_params
        if params.get("status"):
            events = events.filter(status=params["status"])
        if params.get("site"):
            events = events.filter(site_id=params["site"])
        if params.get("instructor"):
            events = events.filter(instructor_id=params["instructor"])
        if params.get("class_type"):
            events = events.filter(class_type_id=params["class_type"])
        if params.get("search"):
            events = events.filter(class_type__name__icontains=params["search"])

        serializer = self.get_serializer(events, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="assign-instructor")
    def assign_instructor_action(self, request, pk=None):
        event = self.get_object()
        serializer = AssignInstructorSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instructor_id = serializer.validated_data.get("instructor_id")

        instructor = None
        if instructor_id is not None:
            try:
                instructor = StaffProfile.objects.get(
                    pk=instructor_id,
                    tenant=request.tenant,
                )
            except StaffProfile.DoesNotExist:
                return Response({"detail": "Instructor not found."}, status=404)

        updated = assign_instructor(event, instructor, request.user)
        return Response(TimetableEventSerializer(updated).data)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel_action(self, request, pk=None):
        event = self.get_object()
        serializer = CancelEventSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        updated = cancel_event(event, request.user, serializer.validated_data.get("reason", ""))
        return Response(TimetableEventSerializer(updated).data)
