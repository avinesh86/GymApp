from rest_framework.viewsets import ReadOnlyModelViewSet

from apps.core.permissions import IsAdmin

from .models import AuditLog
from .serializers import AuditLogSerializer


class AuditLogViewSet(ReadOnlyModelViewSet):
    serializer_class = AuditLogSerializer
    permission_classes = [IsAdmin]
    filterset_fields = ["action", "object_type", "user"]

    def get_queryset(self):
        return (
            AuditLog.objects.filter(tenant=self.request.tenant)
            .select_related("user")
            .order_by("-created_at")
        )
