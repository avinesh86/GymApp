import uuid
from datetime import timedelta

from django.core.files import File
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from django.utils.dateparse import parse_date
from PIL import Image
from rest_framework.exceptions import ValidationError
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.mixins import TenantScopedMixin
from apps.core.permissions import TenantPermission
from apps.core.timezones import local_today
from apps.tenants.models import Site

from .checklists import ChecklistError, can_do, checklist_roles, complete_run, create_due_runs, due_at, is_due_on
from .models import ChecklistAnswer, ChecklistRun, ChecklistTemplate, Equipment, FaultReport
from .permissions import (
    CanManageChecklists,
    CanManageFacilities,
    ChecklistsEnabled,
    EquipmentEnabled,
    FaultReportingEnabled,
    MaintenanceEnabled,
)
from .serializers import (
    ChecklistRunSerializer,
    ChecklistTemplateSerializer,
    CompleteRunSerializer,
    EquipmentSerializer,
    FaultBoardSerializer,
    FaultReportSerializer,
)
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
        can_manage = can_manage_facilities(request.user)
        roles = checklist_roles(request.tenant)
        can_do_checklists = config.checklists_enabled and can_manage and request.user.role in roles
        active_checklists = (
            list(
                ChecklistTemplate.objects.filter(tenant=request.tenant, is_active=True, is_deleted=False).only(
                    "id", "assigned_roles"
                )
            )
            if config.checklists_enabled
            else []
        )
        return Response({
            "equipment_enabled": config.equipment_enabled,
            "maintenance_enabled": config.maintenance_enabled,
            "fault_reporting_enabled": config.fault_reporting_enabled,
            "checklists_enabled": config.checklists_enabled,
            # Only roles that can open Facilities ever do checklists.
            "can_do_checklists": can_do_checklists,
            "can_manage_checklists": request.user.role in ("owner", "admin", "gym_manager"),
            # The gym has set up at least one checklist (the Checklists tab
            # opens on its list until then).
            "has_checklists": bool(active_checklists),
            # ...and at least one of them is this person's to do. The
            # dashboard's checks card waits for this, so nobody is told "All
            # checks done" about checklists that don't exist or aren't theirs.
            "has_my_checklists": can_do_checklists
            and any(can_do(t, request.user, roles) for t in active_checklists),
            "can_manage": can_manage,
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

    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        """Everything that has happened to this machine, newest first:
        faults and their repairs, and every checklist line about it."""
        equipment = self.get_object()
        events = []
        for f in equipment.faults.filter(is_deleted=False).select_related("reported_by", "resolved_by"):
            events.append({
                "kind": "fault",
                "id": f.id,
                "at": f.created_at,
                "title": f.title,
                "status": f.status,
                "severity": f.severity,
                "detail": f.description,
                "status_note": f.status_note,
                "by": f.reported_by.full_name if f.reported_by else "",
                "resolved_at": f.resolved_at,
                "resolved_by": f.resolved_by.full_name if f.resolved_by else "",
                "repair_cost": f.repair_cost,
            })
        answers = (
            ChecklistAnswer.objects.filter(run__tenant=request.tenant, run__is_deleted=False)
            .filter(Q(equipment=equipment) | Q(run__template__equipment=equipment))
            .select_related("run__template", "run__completed_by")
            .order_by("run_id", "id")
        )
        runs = {}
        for a in answers:
            entry = runs.setdefault(a.run_id, {
                "kind": "check",
                "id": a.run_id,
                "at": a.run.completed_at,
                "title": a.run.template.name,
                "by": a.run.completed_by.full_name if a.run.completed_by else "",
                "lines": [],
            })
            entry["lines"].append({
                "text": a.item_text,
                "passed": a.passed,
                "note": a.note,
                "photo": request.build_absolute_uri(a.photo.url) if a.photo else None,
            })
        events.extend(runs.values())
        events.sort(key=lambda e: e["at"] or timezone.now(), reverse=True)
        return Response({
            "equipment": EquipmentSerializer(equipment, context={"request": request}).data,
            "events": events,
        })


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


class EquipmentScanView(APIView):
    """What scanning a machine's QR label shows anyone signed in at the gym:
    its status and open faults. Facilities roles also get its full history
    from EquipmentViewSet.history."""

    permission_classes = [TenantPermission, EquipmentEnabled]

    def get(self, request, pk):
        equipment = (
            Equipment.objects.filter(tenant=request.tenant, is_deleted=False, pk=pk)
            .select_related("site")
            .first()
        )
        if equipment is None:
            return Response({"detail": "No such equipment."}, status=404)
        config = get_config(request.tenant)
        open_faults = (
            equipment.faults.filter(is_deleted=False, status__in=FaultReport.OPEN_STATUSES)
            .select_related("site", "equipment", "reported_by")
            .order_by("-created_at")
        )
        return Response({
            "id": equipment.id,
            "name": equipment.name,
            "location": equipment.location,
            "site_name": equipment.site.name if equipment.site else "",
            "asset_tag": equipment.asset_tag,
            "status": equipment.status,
            "open_faults": FaultBoardSerializer(open_faults, many=True, context={"request": request}).data,
            "can_report": config.fault_reporting_enabled,
            "can_see_history": can_manage_facilities(request.user),
        })


# ─── Checklists ──────────────────────────────────────────────────────────────


class ChecklistTemplateViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    """Setting checklists up: owner, admin and gym manager. Other Facilities
    roles can read them."""

    serializer_class = ChecklistTemplateSerializer
    permission_classes = [CanManageChecklists, ChecklistsEnabled]
    queryset = ChecklistTemplate.objects.all()
    filterset_fields = ["category", "is_active", "frequency"]
    search_fields = ["name"]

    def get_queryset(self):
        qs = super().get_queryset().select_related("site", "equipment").prefetch_related("items__equipment")
        return _filter_site(qs.order_by("name", "id"), self.request)

    def perform_create(self, serializer):
        super().perform_create(serializer)
        create_due_runs(self.request.tenant)

    @transaction.atomic
    def perform_update(self, serializer):
        before = {f: getattr(serializer.instance, f) for f in ChecklistTemplate.SCHEDULE_FIELDS}
        template = serializer.save(updated_by=self.request.user)
        after = {f: getattr(template, f) for f in ChecklistTemplate.SCHEDULE_FIELDS}
        if template.is_active and before != after:
            # Switched back on or rescheduled: no catching up on (or alerting
            # about) checks from before now.
            template.schedule_from = timezone.now()
            template.save(update_fields=["schedule_from", "updated_at"])
        # Checks not yet done take the new time and site; ones no longer due
        # under the new schedule go.
        today = local_today(self.request.tenant)
        for run in template.runs.filter(completed_at__isnull=True, due_date__gte=today):
            if not template.is_active or not is_due_on(template, run.due_date):
                run.delete()
                continue
            run.due_at = due_at(template, run.due_date, self.request.tenant)
            run.site = template.site
            run.save(update_fields=["due_at", "site", "updated_at"])
        create_due_runs(self.request.tenant)

    def perform_destroy(self, instance):
        super().perform_destroy(instance)
        instance.runs.filter(completed_at__isnull=True).delete()


class ChecklistRunViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Due, overdue and done checks. Anyone with Facilities access can look;
    the gym's checklist roles do them."""

    serializer_class = ChecklistRunSerializer
    permission_classes = [CanManageFacilities, ChecklistsEnabled]

    def get_queryset(self):
        qs = (
            ChecklistRun.objects.filter(
                tenant=self.request.tenant, is_deleted=False, template__is_deleted=False
            )
            .select_related("template", "site", "completed_by")
            .prefetch_related("template__items__equipment", "answers__equipment", "answers__fault")
        )
        params = self.request.query_params
        now = timezone.now()
        state = params.get("state")
        if state == "open":
            qs = qs.filter(completed_at__isnull=True)
        elif state == "overdue":
            qs = qs.filter(completed_at__isnull=True, due_at__lt=now)
        elif state == "done":
            qs = qs.filter(completed_at__isnull=False)
        if params.get("template", "").isascii() and params.get("template", "").isdigit():
            qs = qs.filter(template_id=int(params["template"]))
        for param, lookup in (("from", "due_date__gte"), ("to", "due_date__lte")):
            if params.get(param):
                day = _parse_day(params[param])
                if day is None:
                    raise ValidationError({param: "Use a date like 2026-11-30."})
                qs = qs.filter(**{lookup: day})
        qs = qs.order_by("due_at" if state in ("open", "overdue") else "-due_at", "id")
        return _filter_site(qs, self.request)

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        if getattr(self.request, "tenant", None) is not None:
            ctx["checklist_roles"] = checklist_roles(self.request.tenant)
        return ctx

    @action(detail=False, methods=["get"])
    def mine(self, request):
        """Checks this person should do now: due today and anything overdue."""
        create_due_runs(request.tenant)
        roles = checklist_roles(request.tenant)
        today = local_today(request.tenant)
        runs = [
            run
            for run in self.get_queryset().filter(
                completed_at__isnull=True, due_date__lte=today, template__is_active=True
            )
            if can_do(run.template, request.user, roles)
        ]
        runs.sort(key=lambda r: r.due_at)
        return Response(self.get_serializer(runs, many=True).data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        run = self.get_object()
        if not can_do(run.template, request.user):
            return Response({"detail": "This check isn't one of yours to do."}, status=403)
        body = CompleteRunSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            run = complete_run(
                run, request.user, body.validated_data["answers"], body.validated_data.get("notes", "")
            )
        except ChecklistError as exc:
            return Response({"detail": str(exc)}, status=400)
        run = self.get_queryset().get(pk=run.pk)
        return Response(self.get_serializer(run).data)


# MPO is how Pillow reports a JPEG carrying extra images (many phone cameras).
PHOTO_FORMATS = {"JPEG": "jpg", "MPO": "jpg", "PNG": "png", "WEBP": "webp"}


def _image_extension(upload) -> str | None:
    """The extension for an upload that really is a JPEG, PNG or WebP image
    (checked by decoding it, not by the type the browser claims), else None."""
    try:
        upload.seek(0)
        # Only these decoders run (MPO comes through the JPEG one).
        with Image.open(upload, formats=["JPEG", "PNG", "WEBP"]) as image:
            fmt = image.format
            image.verify()
    except Exception:
        return None
    return PHOTO_FORMATS.get(fmt)


def _parse_day(value):
    try:
        return parse_date(value)
    except ValueError:
        return None


class ChecklistAnswerPhotoView(APIView):
    """A photo for a failed item, added by whoever did the check."""

    permission_classes = [CanManageFacilities, ChecklistsEnabled]

    def post(self, request, pk):
        answer = (
            ChecklistAnswer.objects.filter(pk=pk, run__tenant=request.tenant, run__is_deleted=False)
            .select_related("run")
            .first()
        )
        if answer is None:
            return Response({"detail": "No such answer."}, status=404)
        if answer.run.completed_by_id != request.user.id:
            return Response({"detail": "Only the person who did the check can add photos."}, status=403)
        photo = request.FILES.get("photo")
        if photo is None:
            return Response({"detail": "Choose a photo."}, status=400)
        if photo.size > 10 * 1024 * 1024:
            return Response({"detail": "Photos must be under 10 MB."}, status=400)
        ext = _image_extension(photo)
        if ext is None:
            return Response({"detail": "That file isn't a JPEG, PNG or WebP photo."}, status=400)
        # Never keep the uploader's name or extension: media is served by
        # extension, so "x.html" would be served as a web page.
        photo.seek(0)
        answer.photo.save(f"{uuid.uuid4().hex}.{ext}", File(photo), save=False)
        answer.save(update_fields=["photo"])
        return Response({"id": answer.id, "photo": request.build_absolute_uri(answer.photo.url)})
