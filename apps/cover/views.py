import logging

from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

logger = logging.getLogger(__name__)

from apps.core.mixins import TenantScopedMixin
from apps.core.permissions import IsGymManager, IsInstructorOrAbove, IsTeamLeader
from apps.staff.models import StaffProfile
from apps.timetable.models import TimetableEvent
from apps.users.constants import UserRole

from .models import Absence, CoverOffer, CoverRequest
from .serializers import (
    AbsenceSerializer,
    AcceptCodeSerializer,
    CoverOfferSerializer,
    CoverRequestSerializer,
)
from .services import (
    accept_cover_offer,
    approve_cover_request,
    create_cover_request,
    deny_cover_request,
    dispatch_cover_offers,
    get_cover_candidates,
    initial_status_for_tenant,
    submit_cover_request,
)

MANAGER_ROLES = (UserRole.OWNER, UserRole.ADMIN, UserRole.GYM_MANAGER, UserRole.TEAM_LEADER)


class AbsenceViewSet(TenantScopedMixin, ModelViewSet):
    serializer_class = AbsenceSerializer
    permission_classes = [IsTeamLeader]

    def get_queryset(self):
        return (
            Absence.objects.filter(tenant=self.request.tenant, is_deleted=False)
            .select_related("staff")
            .order_by("-reported_at")
        )


class CoverRequestViewSet(TenantScopedMixin, ModelViewSet):
    serializer_class = CoverRequestSerializer
    # Instructors may raise their own; managers manage everything. Object-level
    # ownership for instructors is enforced in perform_create.
    permission_classes = [IsInstructorOrAbove]
    filterset_fields = ["status", "urgency", "timetable_event"]

    def get_queryset(self):
        return (
            CoverRequest.objects.filter(tenant=self.request.tenant, is_deleted=False)
            .select_related("timetable_event__class_type", "absence__staff")
            .prefetch_related("offers__staff")
            .order_by("-created_at")
        )

    def _user_is_manager(self) -> bool:
        return self.request.user.role in MANAGER_ROLES

    def perform_create(self, serializer):
        event = TimetableEvent.objects.get(
            pk=self.request.data.get("timetable_event"),
            tenant=self.request.tenant,
        )

        # Instructors may only request cover for a class they are assigned to.
        if not self._user_is_manager():
            own_staff_ids = set(
                StaffProfile.objects.filter(
                    user=self.request.user, tenant=self.request.tenant, is_deleted=False
                ).values_list("pk", flat=True)
            )
            if event.instructor_id not in own_staff_ids:
                from rest_framework.exceptions import PermissionDenied

                raise PermissionDenied("You can only request cover for your own classes.")

        absence = None
        absence_id = self.request.data.get("absence")
        if absence_id:
            absence = Absence.objects.get(pk=absence_id, tenant=self.request.tenant)

        cover_request = create_cover_request(
            timetable_event=event,
            absence=absence,
            created_by=self.request.user,
            requested_by=self.request.user,
            urgency=self.request.data.get("urgency"),
            bonus_amount=self.request.data.get("bonus_amount", 0),
            initial_status=initial_status_for_tenant(self.request.tenant),
        )
        serializer.instance = cover_request

        try:
            submit_cover_request(cover_request, actor=self.request.user)
        except Exception:
            logger.exception("perform_create: submit failed for cover request %s", cover_request.pk)

    @action(detail=True, methods=["get"], url_path="candidates", permission_classes=[IsTeamLeader])
    def candidates(self, request, pk=None):
        """Tiered, ranked eligible instructors for the manager review screen."""
        cover_request = self.get_object()
        tiers = get_cover_candidates(cover_request)
        offered_ids = set(
            CoverOffer.objects.filter(cover_request=cover_request).values_list("staff_id", flat=True)
        )
        data = {
            str(tier): [
                {
                    "staff_id": s.pk,
                    "name": s.name,
                    "priority_tier": getattr(s, "priority_tier", 1) or 1,
                    "already_offered": s.pk in offered_ids,
                }
                for s in staff_list
            ]
            for tier, staff_list in tiers.items()
        }
        return Response(data)

    @action(detail=True, methods=["post"], url_path="approve", permission_classes=[IsGymManager])
    def approve(self, request, pk=None):
        cover_request = self.get_object()
        if cover_request.status != CoverRequest.Status.PENDING_APPROVAL:
            return Response(
                {"detail": "Only requests pending approval can be approved."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        approve_cover_request(cover_request, actor=request.user)
        return Response(CoverRequestSerializer(cover_request).data)

    @action(detail=True, methods=["post"], url_path="deny", permission_classes=[IsGymManager])
    def deny(self, request, pk=None):
        cover_request = self.get_object()
        if cover_request.status != CoverRequest.Status.PENDING_APPROVAL:
            return Response(
                {"detail": "Only requests pending approval can be denied."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        reason = (request.data.get("reason") or "").strip()
        deny_cover_request(cover_request, actor=request.user, reason=reason)
        return Response(CoverRequestSerializer(cover_request).data)

    @action(detail=True, methods=["post"], url_path="cancel", permission_classes=[IsGymManager])
    def cancel(self, request, pk=None):
        """Cancel an open/offered/critical request. Requires a reason."""
        cover_request = self.get_object()

        if cover_request.status in (CoverRequest.Status.ACCEPTED, CoverRequest.Status.CANCELLED):
            return Response(
                {"detail": "Cannot cancel a request that is already accepted or cancelled."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reason = (request.data.get("cancellation_reason") or "").strip()
        if not reason:
            return Response(
                {"detail": "A cancellation reason is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from .state import transition

        transition(
            cover_request,
            CoverRequest.Status.CANCELLED,
            request.user,
            extra_fields={
                "cancellation_reason": reason,
                "cancelled_at": timezone.now(),
                "cancelled_by": request.user,
            },
        )
        logger.info("Cover request %s cancelled by %s: %s", cover_request.pk, request.user.pk, reason)
        return Response(CoverRequestSerializer(cover_request).data)

    @action(detail=True, methods=["post"], url_path="send-offers", permission_classes=[IsTeamLeader])
    def send_offers(self, request, pk=None):
        """Manual dispatch: optionally to a chosen set of staff (manual select)."""
        cover_request = self.get_object()
        staff_ids = request.data.get("staff_ids")
        tier = int(request.data.get("tier", 1))
        offers = dispatch_cover_offers(
            cover_request, created_by=request.user, staff_ids=staff_ids, tier=tier
        )
        return Response({"offers_sent": len(offers)}, status=status.HTTP_200_OK)


class CoverOfferViewSet(TenantScopedMixin, ModelViewSet):
    serializer_class = CoverOfferSerializer
    permission_classes = [IsTeamLeader]
    filterset_fields = ["status", "cover_request"]

    def get_queryset(self):
        return (
            CoverOffer.objects.filter(tenant=self.request.tenant, is_deleted=False)
            .select_related("staff", "cover_request__timetable_event")
            .order_by("-offered_at")
        )

    @action(detail=False, methods=["post"], url_path="accept-by-code", permission_classes=[])
    def accept_by_code(self, request):
        """Public endpoint — the accept_code acts as its own auth token."""
        serializer = AcceptCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data["accept_code"].upper()

        try:
            offer = CoverOffer.objects.select_related("cover_request__tenant").get(
                accept_code=code,
                status=CoverOffer.Status.PENDING,
                is_deleted=False,
            )
        except CoverOffer.DoesNotExist:
            return Response({"detail": "Invalid or expired accept code."}, status=404)

        ip_address = request.META.get("REMOTE_ADDR")
        accepted_by = request.user if request.user.is_authenticated else None
        accept_cover_offer(offer, accepted_by=accepted_by, ip_address=ip_address)
        return Response({"detail": "Cover accepted successfully."})
