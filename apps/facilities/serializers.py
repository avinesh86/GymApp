from rest_framework import serializers

from apps.tenants.models import Site

from .models import Equipment, FaultReport


def _person(user) -> str:
    if not user:
        return ""
    return user.full_name or user.email


class _TenantScopedRelations:
    """Refuse a site or machine from another gym."""

    def _tenant(self):
        return self.context["request"].tenant

    def validate_site(self, site):
        if site is not None and site.tenant_id != self._tenant().id:
            raise serializers.ValidationError("Unknown site.")
        return site

    def validate_equipment(self, equipment):
        if equipment is not None and (equipment.tenant_id != self._tenant().id or equipment.is_deleted):
            raise serializers.ValidationError("Unknown equipment.")
        return equipment


class EquipmentSerializer(_TenantScopedRelations, serializers.ModelSerializer):
    site = serializers.PrimaryKeyRelatedField(queryset=Site.objects.all(), allow_null=True, required=False)
    site_name = serializers.CharField(source="site.name", read_only=True, default="")
    open_fault_count = serializers.SerializerMethodField()

    class Meta:
        model = Equipment
        fields = [
            "id", "site", "site_name", "name", "category", "location", "manufacturer",
            "model_number", "serial_number", "asset_tag", "supplier", "purchase_date",
            "purchase_cost", "warranty_expires", "status", "notes", "photo",
            "open_fault_count", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "site_name", "open_fault_count", "created_at", "updated_at"]

    def get_open_fault_count(self, obj) -> int:
        annotated = getattr(obj, "open_faults", None)
        if annotated is not None:
            return annotated
        return obj.faults.filter(is_deleted=False, status__in=FaultReport.OPEN_STATUSES).count()


class FaultReportSerializer(_TenantScopedRelations, serializers.ModelSerializer):
    """The full record, for the facilities team."""

    site = serializers.PrimaryKeyRelatedField(queryset=Site.objects.all(), allow_null=True, required=False)
    equipment = serializers.PrimaryKeyRelatedField(
        queryset=Equipment.objects.all(), allow_null=True, required=False
    )
    site_name = serializers.CharField(source="site.name", read_only=True, default="")
    equipment_name = serializers.CharField(source="equipment.name", read_only=True, default="")
    reported_by_name = serializers.SerializerMethodField()
    resolved_by_name = serializers.SerializerMethodField()

    class Meta:
        model = FaultReport
        fields = [
            "id", "site", "site_name", "equipment", "equipment_name", "title", "description",
            "location", "severity", "status", "status_note", "internal_notes", "assigned_to",
            "repair_cost", "reported_by_name", "resolved_at",
            "resolved_by_name", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "site_name", "equipment_name", "reported_by_name",
            "resolved_at", "resolved_by_name", "created_at", "updated_at",
        ]

    def get_reported_by_name(self, obj) -> str:
        return _person(obj.reported_by)

    def get_resolved_by_name(self, obj) -> str:
        return _person(obj.resolved_by)

    def validate(self, attrs):
        equipment = attrs.get("equipment", getattr(self.instance, "equipment", None))
        # A fault on a machine is at that machine's site.
        if equipment is not None and "site" not in attrs and equipment.site_id:
            attrs["site"] = equipment.site
        return attrs


class FaultBoardSerializer(_TenantScopedRelations, serializers.ModelSerializer):
    """What every staff member sees and can send: no costs and no internal
    notes. Enough to tell whether a fault is already known and how it's going."""

    site = serializers.PrimaryKeyRelatedField(queryset=Site.objects.all(), allow_null=True, required=False)
    equipment = serializers.PrimaryKeyRelatedField(
        queryset=Equipment.objects.all(), allow_null=True, required=False
    )
    site_name = serializers.CharField(source="site.name", read_only=True, default="")
    equipment_name = serializers.CharField(source="equipment.name", read_only=True, default="")
    # Who logged it: always the signed-in user who sent the report.
    reported_by_name = serializers.SerializerMethodField()

    class Meta:
        model = FaultReport
        fields = [
            "id", "site", "site_name", "equipment", "equipment_name", "title", "description",
            "location", "severity", "status", "status_note",
            "reported_by_name", "resolved_at", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "site_name", "equipment_name", "status", "status_note",
            "reported_by_name", "resolved_at", "created_at", "updated_at",
        ]

    def get_reported_by_name(self, obj) -> str:
        return _person(obj.reported_by)

    def validate(self, attrs):
        equipment = attrs.get("equipment")
        if equipment is None and not attrs.get("location", "").strip():
            raise serializers.ValidationError(
                {"location": "Say where the fault is, or pick the piece of equipment."}
            )
        if equipment is not None and "site" not in attrs and equipment.site_id:
            attrs["site"] = equipment.site
        return attrs
