from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet

from apps.core.mixins import TenantScopedMixin
from apps.core.permissions import IsAdmin, TenantPermission

from .models import Notification, NotificationPreference
from .serializers import MarkReadSerializer, NotificationPreferenceSerializer, NotificationSerializer


class NotificationViewSet(TenantScopedMixin, ReadOnlyModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [TenantPermission]

    def get_queryset(self):
        return (
            Notification.objects.filter(
                tenant=self.request.tenant,
                recipient=self.request.user,
                is_deleted=False,
            )
            .order_by("-created_at")
        )

    @action(detail=False, methods=["post"], url_path="mark-read")
    def mark_read(self, request):
        serializer = MarkReadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ids = serializer.validated_data["notification_ids"]

        now = timezone.now()
        updated = Notification.objects.filter(
            pk__in=ids,
            tenant=request.tenant,
            recipient=request.user,
            is_read=False,
        ).update(is_read=True, read_at=now)

        return Response({"marked_read": updated})

    @action(detail=False, methods=["post"], url_path="mark-all-read")
    def mark_all_read(self, request):
        now = timezone.now()
        updated = Notification.objects.filter(
            tenant=request.tenant,
            recipient=request.user,
            is_read=False,
        ).update(is_read=True, read_at=now)
        return Response({"marked_read": updated})

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        count = Notification.objects.filter(
            tenant=request.tenant,
            recipient=request.user,
            is_read=False,
            is_deleted=False,
        ).count()
        return Response({"unread_count": count})

    @action(detail=True, methods=["post"], url_path="accept-cover")
    def accept_cover(self, request, pk=None):
        """
        Authenticated in-app endpoint.  Accepts the cover offer linked to this
        notification and marks the notification as read.
        """
        notification = self.get_object()

        if notification.action_type != "accept_cover":
            return Response(
                {"detail": "This notification does not have a cover accept action."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        accept_code = notification.action_payload.get("accept_code")
        if not accept_code:
            return Response(
                {"detail": "Notification payload missing accept code."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.cover.models import CoverOffer
        from apps.cover.services import accept_cover_offer

        try:
            offer = CoverOffer.objects.select_related("cover_request__tenant").get(
                accept_code=accept_code,
                cover_request__tenant=request.tenant,
                status=CoverOffer.Status.PENDING,
            )
        except CoverOffer.DoesNotExist:
            return Response(
                {"detail": "This cover slot has already been filled or the offer has expired."},
                status=status.HTTP_409_CONFLICT,
            )

        ip_address = request.META.get("REMOTE_ADDR")
        accept_cover_offer(offer, accepted_by=request.user, ip_address=ip_address)

        # Mark the notification as read
        now = timezone.now()
        notification.is_read = True
        notification.read_at = now
        notification.save(update_fields=["is_read", "read_at", "updated_at"])

        return Response({"detail": "Cover accepted successfully."})


class NotificationPreferenceViewSet(TenantScopedMixin, ModelViewSet):
    serializer_class = NotificationPreferenceSerializer
    permission_classes = [TenantPermission]

    def get_queryset(self):
        return NotificationPreference.objects.filter(
            tenant=self.request.tenant,
            is_deleted=False,
        )
