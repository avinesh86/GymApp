import logging

from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

logger = logging.getLogger(__name__)

from apps.core.mixins import TenantScopedMixin
from apps.core.permissions import IsGymManager, IsTeamLeader
from apps.timetable.models import TimetableEvent

from .models import Absence, CoverOffer, CoverRequest
from .serializers import (
    AbsenceSerializer,
    AcceptCodeSerializer,
    CoverOfferSerializer,
    CoverRequestSerializer,
)
from .services import accept_cover_offer, create_cover_request, send_cover_offers


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
    permission_classes = [IsTeamLeader]
    filterset_fields = ["status", "urgency", "timetable_event"]

    def get_queryset(self):
        return (
            CoverRequest.objects.filter(tenant=self.request.tenant, is_deleted=False)
            .select_related("timetable_event__class_type", "absence__staff")
            .prefetch_related("offers__staff")
            .order_by("-created_at")
        )

    def perform_create(self, serializer):
        event = TimetableEvent.objects.get(
            pk=self.request.data.get("timetable_event"),
            tenant=self.request.tenant,
        )
        absence_id = self.request.data.get("absence")
        absence = None
        if absence_id:
            from .models import Absence
            absence = Absence.objects.get(pk=absence_id, tenant=self.request.tenant)

        cover_request = create_cover_request(
            timetable_event=event,
            absence=absence,
            created_by=self.request.user,
            urgency=self.request.data.get("urgency", CoverRequest.Urgency.HIGH),
            bonus_amount=self.request.data.get("bonus_amount", 0),
        )
        # Overwrite default serializer save with the service-created instance
        serializer.instance = cover_request

        # Automatically dispatch notifications to tier-1 instructors
        try:
            offers = send_cover_offers(cover_request, created_by=self.request.user, tier=1)
            logger.info("perform_create: dispatched %d offers for cover request %s", len(offers), cover_request.pk)
        except Exception:
            logger.exception("perform_create: send_cover_offers failed for cover request %s", cover_request.pk)

    @action(detail=True, methods=["post"], url_path="cancel", permission_classes=[IsGymManager])
    def cancel(self, request, pk=None):
        """
        Cancel an open or offered cover request.
        Requires a non-empty cancellation_reason explaining why it was cancelled.
        """
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

        cover_request.status = CoverRequest.Status.CANCELLED
        cover_request.cancellation_reason = reason
        cover_request.cancelled_at = timezone.now()
        cover_request.cancelled_by = request.user
        cover_request.save(update_fields=[
            "status", "cancellation_reason", "cancelled_at", "cancelled_by", "updated_at"
        ])

        logger.info(
            "Cover request %s cancelled by user %s: %s",
            cover_request.pk,
            request.user.pk,
            reason,
        )

        return Response(CoverRequestSerializer(cover_request).data)

    @action(detail=True, methods=["post"], url_path="send-offers")
    def send_offers(self, request, pk=None):
        cover_request = self.get_object()
        offers = send_cover_offers(cover_request, created_by=request.user)
        return Response(
            {"offers_sent": len(offers)},
            status=status.HTTP_200_OK,
        )


class CoverOfferViewSet(TenantScopedMixin, ModelViewSet):
    serializer_class = CoverOfferSerializer
    permission_classes = [IsTeamLeader]
    filterset_fields = ["status", "cover_request"]

    def get_queryset(self):
        return (
            CoverOffer.objects.filter(
                tenant=self.request.tenant, is_deleted=False
            )
            .select_related("staff", "cover_request__timetable_event")
            .order_by("-offered_at")
        )

    @action(detail=False, methods=["post"], url_path="accept-by-code", permission_classes=[])
    def accept_by_code(self, request):
        """
        Public endpoint — no authentication required.

        The accept_code is a sufficiently unique secret that acts as its own
        auth token.  We resolve the tenant from the offer itself so this works
        even when the middleware cannot resolve a tenant (e.g. the instructor
        clicks the email link without being logged in).
        """
        serializer = AcceptCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data["accept_code"].upper()

        try:
            offer = CoverOffer.objects.select_related(
                "cover_request__tenant"
            ).get(
                accept_code=code,
                status=CoverOffer.Status.PENDING,
            )
        except CoverOffer.DoesNotExist:
            return Response({"detail": "Invalid or expired accept code."}, status=404)

        ip_address = request.META.get("REMOTE_ADDR")
        accepted_by = request.user if request.user.is_authenticated else None
        accept_cover_offer(offer, accepted_by=accepted_by, ip_address=ip_address)
        return Response({"detail": "Cover accepted successfully."})
