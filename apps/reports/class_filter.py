"""
Which class types the Attendance, Classes and Viability reports leave out.

A gym chooses this once (e.g. untick Virtual classes and Family Swim) and it
stays until someone changes it. It is shared by every manager at the gym and
lives on TenantSettings as a list of excluded class type ids. Payroll reports
ignore it: instructors are paid for every class.
"""

from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsGymManager
from apps.tenants.models import TenantSettings
from apps.timetable.models import ClassType


def excluded_class_type_ids(tenant) -> list[int]:
    settings_obj = (
        TenantSettings.objects.filter(tenant=tenant)
        .only("report_excluded_class_types")
        .first()
    )
    return list(settings_obj.report_excluded_class_types) if settings_obj else []


class ClassFilterSerializer(serializers.Serializer):
    excluded_class_types = serializers.ListField(
        child=serializers.IntegerField(), allow_empty=True
    )

    def validate_excluded_class_types(self, ids):
        tenant = self.context["tenant"]
        ids = sorted(set(ids))
        known = set(
            ClassType.objects.filter(tenant=tenant, id__in=ids).values_list(
                "id", flat=True
            )
        )
        unknown = [i for i in ids if i not in known]
        if unknown:
            raise serializers.ValidationError(f"Unknown class types: {unknown}")
        return ids


class ReportClassFilterView(APIView):
    """
    GET /api/v1/reports/class-filter/   → {"excluded_class_types": [ids]}
    PUT /api/v1/reports/class-filter/   with the same body to change it.
    """

    permission_classes = [IsGymManager]

    def get(self, request):
        return Response(
            {"excluded_class_types": excluded_class_type_ids(request.tenant)}
        )

    def put(self, request):
        serializer = ClassFilterSerializer(
            data=request.data, context={"tenant": request.tenant}
        )
        serializer.is_valid(raise_exception=True)
        settings_obj, _ = TenantSettings.objects.get_or_create(tenant=request.tenant)
        settings_obj.report_excluded_class_types = serializer.validated_data[
            "excluded_class_types"
        ]
        settings_obj.save(update_fields=["report_excluded_class_types"])
        return Response(
            {"excluded_class_types": settings_obj.report_excluded_class_types}
        )
