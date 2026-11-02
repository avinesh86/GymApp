"""
GET/POST /api/v1/staff/{id}/class-rates/

The pay rate beside each class an instructor teaches, on the staff popup's
Classes tab. Saving re-prices that instructor's draft invoices; submitted,
approved and paid invoices are never touched.
"""

from datetime import timedelta

from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsAdmin
from apps.core.timezones import local_today
from apps.invoices.services import reprice_draft_invoices
from apps.timetable.models import ClassType

from .class_rates import end_class_rate, ongoing_class_rate, set_class_rate
from .models import StaffClassTypeCapability, StaffPayRateOverride, StaffProfile


class ClassRateSerializer(serializers.Serializer):
    class_type = serializers.IntegerField()
    # Omitting rate_type (or sending null) clears the rate: the instructor's
    # default pay rate applies to that class from the start date.
    rate_type = serializers.ChoiceField(
        choices=StaffPayRateOverride.RateType.choices, allow_null=True, required=False
    )
    amount = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=0, required=False, default=0
    )
    per_head_rate = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=0, required=False, default=0
    )

    def validate(self, attrs):
        rate_type = attrs.get("rate_type")
        if rate_type == StaffPayRateOverride.RateType.PER_HEAD:
            attrs["amount"] = 0
        elif rate_type == StaffPayRateOverride.RateType.PER_CLASS:
            attrs["per_head_rate"] = 0
        return attrs


class SaveClassRatesSerializer(serializers.Serializer):
    effective_from = serializers.DateField(required=False)
    rates = ClassRateSerializer(many=True)

    def validate_rates(self, rates):
        tenant = self.context["tenant"]
        ids = [r["class_type"] for r in rates]
        known = set(
            ClassType.objects.filter(tenant=tenant, id__in=ids).values_list(
                "id", flat=True
            )
        )
        unknown = sorted(set(ids) - known)
        if unknown:
            raise serializers.ValidationError(f"Unknown class types: {unknown}")
        return rates


def _rate_data(rate: StaffPayRateOverride | None):
    if rate is None:
        return None
    return {
        "rate_type": rate.rate_type,
        "amount": str(rate.amount),
        "per_head_rate": str(rate.per_head_rate),
        "effective_from": rate.effective_from.isoformat(),
    }


class ClassRatesView(APIView):
    permission_classes = [IsAdmin]

    def _staff(self, request, staff_pk):
        return get_object_or_404(
            StaffProfile, pk=staff_pk, tenant=request.tenant, is_deleted=False
        )

    def _rows(self, staff):
        capabilities = (
            StaffClassTypeCapability.objects.filter(
                tenant=staff.tenant, staff=staff, is_deleted=False
            )
            .select_related("class_type")
            .order_by("class_type__name")
        )
        return [
            {
                "class_type": cap.class_type_id,
                "class_type_name": cap.class_type.name,
                "rate": _rate_data(ongoing_class_rate(staff, cap.class_type_id)),
            }
            for cap in capabilities
        ]

    def get(self, request, staff_pk):
        return Response({"rates": self._rows(self._staff(request, staff_pk))})

    def post(self, request, staff_pk):
        staff = self._staff(request, staff_pk)
        serializer = SaveClassRatesSerializer(
            data=request.data, context={"tenant": request.tenant}
        )
        serializer.is_valid(raise_exception=True)
        start = serializer.validated_data.get("effective_from") or local_today(
            staff.tenant
        )

        for rate in serializer.validated_data["rates"]:
            if rate.get("rate_type"):
                set_class_rate(
                    staff,
                    rate["class_type"],
                    rate_type=rate["rate_type"],
                    amount=rate["amount"],
                    per_head_rate=rate["per_head_rate"],
                    effective_from=start,
                    user=request.user,
                )
            else:
                end_class_rate(
                    staff,
                    rate["class_type"],
                    last_day=start - timedelta(days=1),
                    user=request.user,
                )

        repriced = reprice_draft_invoices(staff)
        return Response({"rates": self._rows(staff), "drafts_repriced": repriced})
