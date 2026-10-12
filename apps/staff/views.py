from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.core.mixins import TenantScopedMixin
from apps.core.permissions import IsAdmin, IsGymManager
from apps.users.constants import UserRole

from .models import (
    PaymentDetails,
    StaffAvailability,
    StaffClassTypeCapability,
    StaffPayRate,
    StaffPayRateOverride,
    StaffProfile,
    StaffQualification,
)
from .permissions import IsGymManagerOrSelf
from .services import provision_user, sync_membership_role
from .serializers import (
    PaymentDetailsSerializer,
    StaffAvailabilitySerializer,
    StaffClassTypeCapabilitySerializer,
    StaffPayRateOverrideSerializer,
    StaffPayRateSerializer,
    StaffProfileListSerializer,
    StaffProfileSerializer,
    StaffQualificationSerializer,
    StaffSelfSerializer,
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

    def _check_may_grant(self, role):
        """Nobody hands out more access than they hold themselves.

        Adding a staff member creates their login with this role. Owners and
        gym managers have full access and can add anyone, admins included; an
        admin can add anyone except an owner.
        """
        granted = UserRole.from_staff_role(role)
        if granted == UserRole.OWNER and self.request.user.role not in UserRole.FULL_ACCESS_ROLES:
            raise PermissionDenied("Only an owner or gym manager can give someone the owner role.")

    def perform_create(self, serializer):
        data = serializer.validated_data
        self._check_may_grant(data.get("role", ""))
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

    def perform_update(self, serializer):
        was_active = serializer.instance.status == StaffProfile.Status.ACTIVE
        old_role = serializer.instance.role
        new_role = serializer.validated_data.get("role", old_role)
        if new_role != old_role:
            # The role decides what the person can do in this gym. Owners,
            # gym managers and admins can change it; ownership is only handed
            # out or taken away by someone with full access.
            actor_role = self.request.user.role
            if UserRole.OWNER in (old_role, new_role) and actor_role not in UserRole.FULL_ACCESS_ROLES:
                raise PermissionDenied("Only an owner or gym manager can change the owner role.")

        staff = serializer.save(updated_by=self.request.user)
        if staff.role != old_role:
            # Permissions read the gym membership, not the profile. Without
            # this the new role showed on the staff card but changed nothing.
            sync_membership_role(staff.user, staff.tenant, staff.role)
        if was_active and staff.status != StaffProfile.Status.ACTIVE:
            # Inactive staff get no cover notices — including for offers that
            # were already out when they were made inactive.
            from apps.cover.services import withdraw_pending_offers

            withdraw_pending_offers(staff, self.request.user)

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
            # Self-service: contact details only. The full serializer would let
            # anyone change their own role, status or priority tier.
            serializer = StaffSelfSerializer(staff, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save(updated_by=request.user)
            return Response(serializer.data)

        return Response(StaffProfileSerializer(staff).data)

    @action(
        detail=True,
        methods=["get", "put", "patch"],
        url_path="payment-details",
        permission_classes=[IsGymManagerOrSelf],
    )
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
    # Instructors tick the class types they teach on My Profile; managers can
    # do it for anyone.
    permission_classes = [IsGymManagerOrSelf]

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
        class_type = serializer.validated_data["class_type"]

        # unique_together("staff", "class_type") ignores is_deleted, so a
        # capability that was toggled off (soft-deleted) still occupies the
        # row. Re-toggling it on would INSERT a duplicate and raise an
        # IntegrityError, surfacing as a generic "Failed" toast. Revive the
        # existing row instead, making the toggle idempotent.
        existing = (
            StaffClassTypeCapability.objects.filter(
                tenant=self.request.tenant,
                staff=staff,
                class_type=class_type,
            ).first()
        )
        if existing is not None:
            existing.is_deleted = False
            existing.is_active = serializer.validated_data.get("is_active", True)
            existing.updated_by = self.request.user
            existing.save(
                update_fields=["is_deleted", "is_active", "updated_by", "updated_at"]
            )
            serializer.instance = existing
            return

        serializer.save(
            tenant=self.request.tenant,
            staff=staff,
            created_by=self.request.user,
            updated_by=self.request.user,
        )


class StaffAvailabilityViewSet(TenantScopedMixin, ModelViewSet):
    serializer_class = StaffAvailabilitySerializer
    permission_classes = [IsGymManagerOrSelf]

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
