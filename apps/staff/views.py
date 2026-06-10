from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.core.mixins import TenantScopedMixin
from apps.core.permissions import IsAdmin, IsGymManager

from .models import (
    PaymentDetails,
    StaffAvailability,
    StaffClassTypeCapability,
    StaffPayRate,
    StaffPayRateOverride,
    StaffProfile,
    StaffQualification,
)
from .services import provision_user
from .serializers import (
    PaymentDetailsSerializer,
    StaffAvailabilitySerializer,
    StaffClassTypeCapabilitySerializer,
    StaffPayRateOverrideSerializer,
    StaffPayRateSerializer,
    StaffProfileListSerializer,
    StaffProfileSerializer,
    StaffQualificationSerializer,
)


class StaffProfileViewSet(TenantScopedMixin, ModelViewSet):
    permission_classes = [IsGymManager]

    def get_serializer_class(self):
        if self.action == "list":
            return StaffProfileListSerializer
        return StaffProfileSerializer

    def get_queryset(self):
        qs = StaffProfile.objects.filter(
            tenant=self.request.tenant, is_deleted=False
        ).select_related("user").prefetch_related("qualifications", "capabilities__class_type")
        params = self.request.query_params

        status_filter = params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        role_filter = params.get("role")
        if role_filter:
            qs = qs.filter(role=role_filter)

        # Class type the member can teach (via active capability).
        class_type = params.get("class_type")
        if class_type:
            qs = qs.filter(
                capabilities__class_type_id=class_type,
                capabilities__is_deleted=False,
            )
        # Day of week the member has availability for (0=Mon .. 6=Sun).
        day = params.get("day")
        if day:
            qs = qs.filter(
                availability__day_of_week=day,
                availability__is_deleted=False,
            )
        # Pay rate type (per_class, per_head, blended, hourly, flat).
        rate_type = params.get("rate_type")
        if rate_type:
            qs = qs.filter(
                pay_rates__rate_type=rate_type,
                pay_rates__is_deleted=False,
            )

        # Joins above can fan out rows — collapse back to distinct members.
        qs = qs.distinct()

        # Sort A-Z / Z-A by name; default A-Z.
        ordering = params.get("ordering")
        if ordering not in ("name", "-name"):
            ordering = "name"
        return qs.order_by(ordering)

    def perform_create(self, serializer):
        data = serializer.validated_data
        # StaffProfile.user is required and managed here (the field is read-only
        # on the serializer): provision/reuse the global login from the email,
        # ensure a membership in this gym, then save the profile linked to it.
        # New accounts get a set-password invite.
        user, _ = provision_user(
            email=data.get("email", ""),
            name=data.get("name", ""),
            tenant=self.request.tenant,
            role=data.get("role", ""),
            send_invite=True,
        )
        serializer.save(
            tenant=self.request.tenant,
            user=user,
            created_by=self.request.user,
            updated_by=self.request.user,
        )

    @action(detail=False, methods=["get", "patch"], url_path="me", permission_classes=[])
    def me(self, request):
        """Returns the StaffProfile for the currently authenticated user."""
        if not request.user or not request.user.is_authenticated:
            return Response({"detail": "Authentication required."}, status=401)
        try:
            staff = StaffProfile.objects.get(
                user=request.user,
                tenant=request.tenant,
                is_deleted=False,
            )
        except StaffProfile.DoesNotExist:
            return Response({"detail": "Staff profile not found."}, status=404)

        if request.method == "PATCH":
            serializer = StaffProfileSerializer(staff, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save(updated_by=request.user)
            return Response(serializer.data)

        return Response(StaffProfileSerializer(staff).data)

    @action(detail=True, methods=["get", "put", "patch"], url_path="payment-details")
    def payment_details(self, request, pk=None):
        staff = self.get_object()
        details, _ = PaymentDetails.objects.get_or_create(
            staff=staff,
            defaults={"tenant": request.tenant, "created_by": request.user},
        )
        if request.method == "GET":
            return Response(PaymentDetailsSerializer(details).data)
        serializer = PaymentDetailsSerializer(details, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class StaffQualificationViewSet(TenantScopedMixin, ModelViewSet):
    serializer_class = StaffQualificationSerializer
    permission_classes = [IsGymManager]

    def get_queryset(self):
        return StaffQualification.objects.filter(
            tenant=self.request.tenant,
            is_deleted=False,
            staff_id=self.kwargs.get("staff_pk"),
        )

    def perform_create(self, serializer):
        staff = StaffProfile.objects.get(
            pk=self.kwargs["staff_pk"], tenant=self.request.tenant
        )
        serializer.save(
            tenant=self.request.tenant,
            staff=staff,
            created_by=self.request.user,
            updated_by=self.request.user,
        )


class StaffCapabilityViewSet(TenantScopedMixin, ModelViewSet):
    serializer_class = StaffClassTypeCapabilitySerializer
    permission_classes = [IsGymManager]

    def get_queryset(self):
        return StaffClassTypeCapability.objects.filter(
            tenant=self.request.tenant,
            is_deleted=False,
            staff_id=self.kwargs.get("staff_pk"),
        ).select_related("class_type")

    def perform_create(self, serializer):
        staff = StaffProfile.objects.get(
            pk=self.kwargs["staff_pk"], tenant=self.request.tenant
        )
        serializer.save(
            tenant=self.request.tenant,
            staff=staff,
            created_by=self.request.user,
            updated_by=self.request.user,
        )


class StaffAvailabilityViewSet(TenantScopedMixin, ModelViewSet):
    serializer_class = StaffAvailabilitySerializer
    permission_classes = [IsGymManager]

    def get_queryset(self):
        return StaffAvailability.objects.filter(
            tenant=self.request.tenant,
            is_deleted=False,
            staff_id=self.kwargs.get("staff_pk"),
        )

    def perform_create(self, serializer):
        staff = StaffProfile.objects.get(
            pk=self.kwargs["staff_pk"], tenant=self.request.tenant
        )
        serializer.save(
            tenant=self.request.tenant,
            staff=staff,
            created_by=self.request.user,
            updated_by=self.request.user,
        )


class StaffPayRateViewSet(TenantScopedMixin, ModelViewSet):
    serializer_class = StaffPayRateSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        return StaffPayRate.objects.filter(
            tenant=self.request.tenant,
            is_deleted=False,
            staff_id=self.kwargs.get("staff_pk"),
        ).order_by("-effective_from")

    def perform_create(self, serializer):
        staff = StaffProfile.objects.get(
            pk=self.kwargs["staff_pk"], tenant=self.request.tenant
        )
        serializer.save(
            tenant=self.request.tenant,
            staff=staff,
            created_by=self.request.user,
            updated_by=self.request.user,
        )


class StaffPayRateOverrideViewSet(TenantScopedMixin, ModelViewSet):
    serializer_class = StaffPayRateOverrideSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        return StaffPayRateOverride.objects.filter(
            tenant=self.request.tenant,
            is_deleted=False,
            staff_id=self.kwargs.get("staff_pk"),
        )

    def perform_create(self, serializer):
        staff = StaffProfile.objects.get(
            pk=self.kwargs["staff_pk"], tenant=self.request.tenant
        )
        serializer.save(
            tenant=self.request.tenant,
            staff=staff,
            created_by=self.request.user,
            updated_by=self.request.user,
        )
