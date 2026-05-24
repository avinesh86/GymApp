from rest_framework import serializers

from .models import Invoice, InvoiceApproval, InvoiceLineItem, PayrollBatch, PayRun


class InvoiceLineItemSerializer(serializers.ModelSerializer):
    class_name = serializers.SerializerMethodField()
    event_date = serializers.SerializerMethodField()
    duration_minutes = serializers.SerializerMethodField()
    rate_per_hour = serializers.DecimalField(source="rate", max_digits=10, decimal_places=2, read_only=True)
    has_bonus = serializers.BooleanField(source="is_bonus", read_only=True)
    has_adjustment = serializers.BooleanField(source="is_manual_adjustment", read_only=True)

    def get_class_name(self, obj):
        if obj.timetable_event and obj.timetable_event.class_type:
            return obj.timetable_event.class_type.name
        return obj.description

    def get_event_date(self, obj):
        if obj.timetable_event:
            return obj.timetable_event.start_datetime.date().isoformat()
        return None

    def get_duration_minutes(self, obj):
        if obj.timetable_event:
            delta = obj.timetable_event.end_datetime - obj.timetable_event.start_datetime
            return int(delta.total_seconds() / 60)
        return None

    class Meta:
        model = InvoiceLineItem
        fields = [
            "id", "timetable_event", "description", "quantity", "rate", "amount",
            "class_name", "event_date", "duration_minutes", "rate_per_hour",
            "is_bonus", "is_manual_adjustment", "is_flagged", "flag_reason",
            "has_bonus", "has_adjustment",
        ]
        read_only_fields = ["id", "amount", "class_name", "event_date", "duration_minutes",
                            "rate_per_hour", "has_bonus", "has_adjustment"]


class InvoiceApprovalSerializer(serializers.ModelSerializer):
    approved_by_email = serializers.CharField(source="approved_by.email", read_only=True)
    actor_name = serializers.SerializerMethodField()
    timestamp = serializers.DateTimeField(source="approved_at", read_only=True)

    def get_actor_name(self, obj):
        if obj.approved_by:
            name = f"{obj.approved_by.first_name} {obj.approved_by.last_name}".strip()
            return name or obj.approved_by.email
        return "Unknown"

    class Meta:
        model = InvoiceApproval
        fields = [
            "id", "approved_by", "approved_by_email", "actor_name",
            "role", "action", "notes", "approved_at", "timestamp",
        ]
        read_only_fields = fields


class InvoiceSerializer(serializers.ModelSerializer):
    line_items = InvoiceLineItemSerializer(many=True, read_only=True)
    approvals = InvoiceApprovalSerializer(many=True, read_only=True)
    approval_history = InvoiceApprovalSerializer(source="approvals", many=True, read_only=True)
    instructor_name = serializers.CharField(source="instructor.name", read_only=True)
    class_count = serializers.SerializerMethodField()

    def get_class_count(self, obj):
        return obj.line_items.filter(is_deleted=False).count()

    class Meta:
        model = Invoice
        fields = [
            "id", "invoice_number", "instructor", "instructor_name",
            "period_start", "period_end", "status", "submitted_at",
            "total_amount", "notes", "pdf_file", "class_count",
            "line_items", "approvals", "approval_history",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "invoice_number", "status", "submitted_at",
            "total_amount", "pdf_file", "class_count",
            "approvals", "approval_history", "created_at", "updated_at",
        ]


class InvoiceListSerializer(serializers.ModelSerializer):
    instructor_name = serializers.CharField(source="instructor.name", read_only=True)

    class Meta:
        model = Invoice
        fields = [
            "id", "invoice_number", "instructor", "instructor_name",
            "period_start", "period_end", "status", "total_amount", "submitted_at",
        ]
        read_only_fields = fields


class InvoiceActionSerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    reason = serializers.CharField(required=False, allow_blank=True, default="")


class PayrollBatchSerializer(serializers.ModelSerializer):
    class Meta:
        model = PayrollBatch
        fields = [
            "id", "period_start", "period_end", "status", "completed_at", "created_at",
        ]
        read_only_fields = fields


class PayRunSerializer(serializers.ModelSerializer):
    invoice_number = serializers.CharField(source="invoice.invoice_number", read_only=True)

    class Meta:
        model = PayRun
        fields = [
            "id", "payroll_batch", "invoice", "invoice_number",
            "amount_paid", "payment_date", "payment_reference",
        ]
        read_only_fields = fields
