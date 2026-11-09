from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.tenants.models import Site

from .checklists import can_do, checklist_roles, open_overdue_filter, run_status
from .models import (
    ChecklistAnswer,
    ChecklistItem,
    ChecklistRun,
    ChecklistTemplate,
    Equipment,
    FaultReport,
    Licence,
    Subscription,
)
from .renewals import (
    clean_reminder_days,
    licence_status,
    monthly_cost,
    subscription_deadline,
    subscription_status,
)


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


# ─── Checklists ──────────────────────────────────────────────────────────────


class ChecklistItemSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)
    equipment = serializers.PrimaryKeyRelatedField(
        queryset=Equipment.objects.all(), allow_null=True, required=False
    )
    equipment_name = serializers.CharField(source="equipment.name", read_only=True, default="")

    class Meta:
        model = ChecklistItem
        fields = ["id", "text", "equipment", "equipment_name"]


class ChecklistTemplateSerializer(_TenantScopedRelations, serializers.ModelSerializer):
    site = serializers.PrimaryKeyRelatedField(queryset=Site.objects.all(), allow_null=True, required=False)
    equipment = serializers.PrimaryKeyRelatedField(
        queryset=Equipment.objects.all(), allow_null=True, required=False
    )
    site_name = serializers.CharField(source="site.name", read_only=True, default="")
    equipment_name = serializers.CharField(source="equipment.name", read_only=True, default="")
    items = ChecklistItemSerializer(many=True)
    # Checks past their due time and not done. Pausing the checklist takes
    # them off the dashboard and out of overdue alerts, so the edit form warns
    # before a pause when this is above zero.
    open_overdue_count = serializers.SerializerMethodField()

    class Meta:
        model = ChecklistTemplate
        fields = [
            "id", "site", "site_name", "name", "category", "description", "equipment",
            "equipment_name", "frequency", "weekdays", "interval_days", "start_date",
            "due_time", "assigned_roles", "is_active", "items", "open_overdue_count",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "site_name", "equipment_name", "open_overdue_count", "created_at", "updated_at"]

    def get_open_overdue_count(self, obj) -> int:
        # The list annotates it in one query (ChecklistTemplateViewSet);
        # a freshly created or updated checklist is counted here.
        counted = getattr(obj, "open_overdue_count", None)
        if counted is not None:
            return counted
        return obj.runs.filter(open_overdue_filter()).count()

    def validate_weekdays(self, value):
        if not isinstance(value, list) or any(not isinstance(d, int) or not 0 <= d <= 6 for d in value):
            raise serializers.ValidationError("Days are 0 (Monday) to 6 (Sunday).")
        return sorted(set(value))

    def validate_interval_days(self, value):
        if not 1 <= value <= 365:
            raise serializers.ValidationError("Between 1 and 365 days.")
        return value

    def validate_assigned_roles(self, value):
        allowed = set(checklist_roles(self._tenant()))
        if not isinstance(value, list) or any(r not in allowed for r in value):
            raise serializers.ValidationError("Choose from the roles that do checklists (Settings → Facilities).")
        return list(dict.fromkeys(value))

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("Add at least one item to check.")
        for item in value:
            if not (item.get("text") or "").strip():
                raise serializers.ValidationError("Every item needs some text.")
            self.validate_equipment(item.get("equipment"))
        return value

    def validate(self, attrs):
        freq = attrs.get("frequency", getattr(self.instance, "frequency", None))
        weekdays = attrs.get("weekdays", getattr(self.instance, "weekdays", []))
        if freq == ChecklistTemplate.Frequency.WEEKLY and not weekdays:
            raise serializers.ValidationError({"weekdays": "Pick at least one day."})
        return attrs

    def _save_items(self, template, items):
        keep = []
        for order, data in enumerate(items):
            item_id = data.pop("id", None)
            fields = {"order": order, "text": data["text"].strip(), "equipment": data.get("equipment")}
            item = template.items.filter(pk=item_id).first() if item_id else None
            if item:
                for k, v in fields.items():
                    setattr(item, k, v)
                item.save()
            else:
                item = ChecklistItem.objects.create(template=template, **fields)
            keep.append(item.pk)
        template.items.exclude(pk__in=keep).delete()

    def create(self, validated_data):
        items = validated_data.pop("items")
        template = super().create(validated_data)
        self._save_items(template, items)
        return template

    def update(self, instance, validated_data):
        items = validated_data.pop("items", None)
        template = super().update(instance, validated_data)
        if items is not None:
            self._save_items(template, items)
        return template


class ChecklistAnswerSerializer(serializers.ModelSerializer):
    equipment_name = serializers.CharField(source="equipment.name", read_only=True, default="")
    fault_status = serializers.CharField(source="fault.status", read_only=True, default="")

    class Meta:
        model = ChecklistAnswer
        fields = [
            "id", "item", "item_text", "equipment", "equipment_name", "passed", "note",
            "photo", "fault", "fault_status",
        ]
        read_only_fields = fields


class ChecklistRunSerializer(serializers.ModelSerializer):
    template_name = serializers.CharField(source="template.name", read_only=True)
    category = serializers.CharField(source="template.category", read_only=True)
    site_name = serializers.CharField(source="site.name", read_only=True, default="")
    status = serializers.SerializerMethodField()
    completed_by_name = serializers.SerializerMethodField()
    can_complete = serializers.SerializerMethodField()
    items = serializers.SerializerMethodField()
    answers = ChecklistAnswerSerializer(many=True, read_only=True)
    failed_count = serializers.SerializerMethodField()

    class Meta:
        model = ChecklistRun
        fields = [
            "id", "template", "template_name", "category", "site", "site_name", "due_date",
            "due_at", "status", "completed_at", "completed_by_name", "notes", "can_complete",
            "items", "answers", "failed_count",
        ]
        read_only_fields = fields

    def get_status(self, obj) -> str:
        return run_status(obj)

    def get_completed_by_name(self, obj) -> str:
        return _person(obj.completed_by)

    def get_can_complete(self, obj) -> bool:
        if obj.completed_at:
            return False
        roles = self.context.get("checklist_roles")
        return can_do(obj.template, self.context["request"].user, roles)

    def get_items(self, obj):
        return ChecklistItemSerializer(obj.template.items.all(), many=True).data

    def get_failed_count(self, obj) -> int:
        return sum(1 for a in obj.answers.all() if not a.passed)


class CompleteRunSerializer(serializers.Serializer):
    answers = serializers.ListField(child=serializers.DictField(), allow_empty=False)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000)



# ─── Licences and subscriptions ──────────────────────────────────────────────


class _RenewalRecord(_TenantScopedRelations, serializers.ModelSerializer):
    """Shared by licences and subscriptions: site, responsible person,
    reminder days and the attached document."""

    site = serializers.PrimaryKeyRelatedField(queryset=Site.objects.all(), allow_null=True, required=False)
    site_name = serializers.CharField(source="site.name", read_only=True, default="")
    responsible_name = serializers.SerializerMethodField()
    document_url = serializers.SerializerMethodField()
    document_name = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()

    def get_responsible_name(self, obj) -> str:
        return _person(obj.responsible)

    def get_document_url(self, obj):
        if not obj.document:
            return None
        return self.context["request"].build_absolute_uri(obj.document.url)

    def get_document_name(self, obj) -> str:
        return obj.document.name.rsplit("/", 1)[-1] if obj.document else ""

    def validate_responsible(self, user):
        if user is None:
            return user
        from .services import FACILITIES_ROLES

        member = user.memberships.filter(tenant=self._tenant(), is_active=True).first()
        if member is None or member.role not in FACILITIES_ROLES:
            raise serializers.ValidationError("Choose someone with Facilities access at this gym.")
        return user

    def validate_reminder_days(self, value):
        try:
            return clean_reminder_days(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc))

    def update(self, instance, validated_data):
        # A new date, or new reminder days, starts the reminders again.
        watched = self.Meta.reminder_reset_fields
        if any(f in validated_data and validated_data[f] != getattr(instance, f) for f in watched):
            validated_data["reminders_sent"] = []
        return super().update(instance, validated_data)

    def _today(self):
        from apps.core.timezones import local_today

        return local_today(self._tenant())


class LicenceSerializer(_RenewalRecord):
    responsible = serializers.PrimaryKeyRelatedField(
        queryset=get_user_model().objects.all(), allow_null=True, required=False
    )
    days_left = serializers.SerializerMethodField()

    class Meta:
        model = Licence
        fields = [
            "id", "site", "site_name", "name", "kind", "issuer", "number", "issued_on",
            "expires_on", "cost", "responsible", "responsible_name", "document_url",
            "document_name", "notes", "reminder_days", "status", "days_left",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "site_name", "responsible_name", "document_url", "document_name",
            "status", "days_left", "created_at", "updated_at",
        ]
        reminder_reset_fields = ("expires_on", "reminder_days")

    def get_status(self, obj) -> str:
        return licence_status(obj, self._today())

    def get_days_left(self, obj):
        return (obj.expires_on - self._today()).days if obj.expires_on else None

    def validate(self, attrs):
        issued = attrs.get("issued_on", getattr(self.instance, "issued_on", None))
        expires = attrs.get("expires_on", getattr(self.instance, "expires_on", None))
        if issued and expires and expires < issued:
            raise serializers.ValidationError({"expires_on": "Expiry can't be before the issue date."})
        return attrs


class SubscriptionSerializer(_RenewalRecord):
    responsible = serializers.PrimaryKeyRelatedField(
        queryset=get_user_model().objects.all(), allow_null=True, required=False
    )
    monthly_cost = serializers.SerializerMethodField()
    act_by = serializers.SerializerMethodField()

    class Meta:
        model = Subscription
        fields = [
            "id", "site", "site_name", "name", "provider", "category", "cost", "billing_cycle",
            "next_renewal", "auto_renew", "notice_days", "act_by", "responsible",
            "responsible_name", "document_url", "document_name", "notes", "is_active",
            "reminder_days", "status", "monthly_cost", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "site_name", "act_by", "responsible_name", "document_url", "document_name",
            "status", "monthly_cost", "created_at", "updated_at",
        ]
        reminder_reset_fields = ("next_renewal", "notice_days", "reminder_days", "is_active")

    def get_status(self, obj) -> str:
        return subscription_status(obj, self._today())

    def get_monthly_cost(self, obj) -> str:
        return str(monthly_cost(obj))

    def get_act_by(self, obj):
        deadline = subscription_deadline(obj)
        return deadline.isoformat() if deadline else None

    # Unless chosen, reminders suit the cycle: a monthly subscription that
    # reminded 30 days out would remind every month.
    DEFAULT_REMINDERS = {"monthly": [], "quarterly": [14], "yearly": [30, 7]}

    def create(self, validated_data):
        if "reminder_days" not in validated_data:
            cycle = validated_data.get("billing_cycle", Subscription.Cycle.MONTHLY)
            validated_data["reminder_days"] = list(self.DEFAULT_REMINDERS[cycle])
        return super().create(validated_data)

    def validate_notice_days(self, value):
        if value > 365:
            raise serializers.ValidationError("At most 365 days.")
        return value
