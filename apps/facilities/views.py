from datetime import timedelta

from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.mixins import TenantScopedMixin
from apps.core.permissions import TenantPermission
from apps.tenants.models import Site

from .models import Equipment, FaultReport
from .permissions import CanManageFacilities, EquipmentEnabled, FaultReportingEnabled, MaintenanceEnabled
from .serializers import EquipmentSerializer, FaultBoardSerializer, FaultReportSerializer
from .services import apply_status_change, can_manage_facilities, get_config, notify_fault_reported, sync_equipment_status

# How long a fixed fault stays on the staff board, so people can see it was done.
RECENTLY_FIXED_DAYS = 14


def _filter_site(qs, request):
    site = request.query_params.get("site")
    if site and site.isdigit():
        # A gym-wide record (no site) belongs to every site.
        qs = qs.filter(Q(site_id=int(site)) | Q(site__isnull=True))
    return qs


class FacilitiesConfigView(APIView):
    """Which parts of Facilities are on, for every signed-in staff member —
    the menu, dashboard and fault button all depend on it."""

    permission_classes = [TenantPermission]

    def get(self, request):
        config = get_config(request.tenant)
        sites = Site.objects.filter(tenant=request.tenant, is_active=True).order_by("name")
        return Response({
            "equipment_enabled": config.equipment_enabled,
            "maintenance_enabled": config.maintenance_enabled,
            "fault_reporting_enabled": config.fault_reporting_enabled,
            "can_manage": can_manage_facilities(request.user),
            "is_alert_recipient": request.user.role in config.alert_roles,
            "sites": [{"id": s.id, "name": s.name} for s in sites],
        })


class EquipmentViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    serializer_class = EquipmentSerializer
    permission_classes = [CanManageFacilities, EquipmentEnabled]
    queryset = Equipment.objects.all()
    filterset_fields = ["status", "category"]
    search_fields = ["name", "location", "serial_number", "asset_tag", "manufacturer"]

    def get_queryset(self):
        qs = super().get_queryset().select_related("site").annotate(
            open_faults=Count(
                "faults",
                filter=Q(faults__is_deleted=False, faults__status__in=FaultReport.OPEN_STATUSES),
            )
        ).order_by("name", "id")
        return _filter_site(qs, self.request)


class FaultReportViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    """Maintenance tracking: the facilities team works faults through to fixed."""

    serializer_class = FaultReportSerializer
    permission_classes = [CanManageFacilities, MaintenanceEnabled]
    queryset = FaultReport.objects.all()
    filterset_fields = ["severity", "equipment"]
    search_fields = ["title", "description", "location", "equipment__name"]

    def get_queryset(self):
        qs = (
            super().get_queryset()
            .select_related("site", "equipment", "reported_by", "resolved_by")
            .order_by("-created_at", "-id")
        )
        status = self.request.query_params.get("status")
        if status == "open":
            qs = qs.filter(status__in=FaultReport.OPEN_STATUSES)
        elif status:
            qs = qs.filter(status=status)
        return _filter_site(qs, self.request)

    @transaction.atomic
    def perform_create(self, serializer):
        fault = serializer.save(
            tenant=self.request.tenant,
            created_by=self.request.user,
            updated_by=self.request.user,
            reported_by=self.request.user,
        )
        sync_equipment_status(fault.equipment)
        transaction.on_commit(lambda: notify_fault_reported(fault))

    @transaction.atomic
    def perform_update(self, serializer):
        previous_equipment = serializer.instance.equipment
        fault = serializer.save(updated_by=self.request.user)
        apply_status_change(fault, self.request.user)
        fault.save(update_fields=["resolved_at", "resolved_by"])
        sync_equipment_status(fault.equipment)
        if previous_equipment and previous_equipment != fault.equipment:
            sync_equipment_status(previous_equipment)

    @transaction.atomic
    def perform_destroy(self, instance):
        super().perform_destroy(instance)
        sync_equipment_status(instance.equipment)


class FaultBoardViewSet(
    mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet
):
    """Every staff member: see what's already reported (and its progress)
    before reporting something new."""

    serializer_class = FaultBoardSerializer
    permission_classes = [TenantPermission, FaultReportingEnabled]
    pagination_class = None

    def get_queryset(self):
        cutoff = timezone.now() - timedelta(days=RECENTLY_FIXED_DAYS)
        qs = (
            FaultReport.objects.filter(tenant=self.request.tenant, is_deleted=False)
            .filter(Q(status__in=FaultReport.OPEN_STATUSES) | Q(resolved_at__gte=cutoff))
            .select_related("site", "equipment")
            .order_by("-created_at")
        )
        return _filter_site(qs, self.request)

    @transaction.atomic
    def perform_create(self, serializer):
        fault = serializer.save(
            tenant=self.request.tenant,
            created_by=self.request.user,
            updated_by=self.request.user,
            reported_by=self.request.user,
        )
        sync_equipment_status(fault.equipment)
        transaction.on_commit(lambda: notify_fault_reported(fault))

    @action(detail=False, methods=["get"])
    def equipment(self, request):
        """Machines to pick from when reporting — names and places only."""
        if not get_config(request.tenant).equipment_enabled:
            return Response([])
        qs = Equipment.objects.filter(tenant=request.tenant, is_deleted=False).exclude(
            status=Equipment.Status.RETIRED
        ).select_related("site").order_by("name")
        qs = _filter_site(qs, request)
        return Response([
            {
                "id": e.id,
                "name": e.name,
                "location": e.location,
                "site": e.site_id,
                "site_name": e.site.name if e.site else "",
                "status": e.status,
            }
            for e in qs
        ])


class FacilitiesSummaryView(APIView):
    """Open-fault counts for the dashboard card."""

    permission_classes = [CanManageFacilities, MaintenanceEnabled]

    def get(self, request):
        qs = _filter_site(
            FaultReport.objects.filter(
                tenant=request.tenant, is_deleted=False, status__in=FaultReport.OPEN_STATUSES
            ),
            request,
        )
        latest = qs.select_related("equipment", "site").order_by("-created_at")[:5]
        return Response({
            "open_faults": qs.count(),
            "out_of_use": qs.filter(severity=FaultReport.Severity.OUT_OF_USE).count(),
            "latest": [
                {
                    "id": f.id,
                    "title": f.title,
                    "equipment_name": f.equipment.name if f.equipment else "",
                    "location": f.location,
                    "site_name": f.site.name if f.site else "",
                    "severity": f.severity,
                    "status": f.status,
                    "created_at": f.created_at,
                }
                for f in latest
            ],
        })
