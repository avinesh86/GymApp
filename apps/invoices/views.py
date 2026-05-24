from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet

from apps.core.mixins import TenantScopedMixin
from apps.core.permissions import IsAdmin, IsGymManager, IsPayroll

from .models import Invoice, InvoiceLineItem, PayrollBatch, PayRun
from .serializers import (
    InvoiceActionSerializer,
    InvoiceLineItemSerializer,
    InvoiceListSerializer,
    InvoiceSerializer,
    PayrollBatchSerializer,
    PayRunSerializer,
)
from .services import (
    approve_invoice,
    generate_invoice_pdf,
    generate_invoice_for_instructor,
    reject_invoice,
    submit_invoice,
)


class InvoiceViewSet(TenantScopedMixin, ModelViewSet):
    permission_classes = [IsGymManager]
    filterset_fields = ["status", "instructor", "period_start", "period_end"]

    def get_serializer_class(self):
        if self.action == "list":
            return InvoiceListSerializer
        return InvoiceSerializer

    def get_queryset(self):
        return (
            Invoice.objects.filter(tenant=self.request.tenant, is_deleted=False)
            .select_related("instructor")
            .prefetch_related("line_items", "approvals__approved_by")
            .order_by("-period_start", "-created_at")
        )

    @action(detail=True, methods=["post"], url_path="submit")
    def submit(self, request, pk=None):
        invoice = self.get_object()
        updated = submit_invoice(invoice, submitted_by=request.user)
        return Response(InvoiceSerializer(updated).data)

    @action(detail=True, methods=["post"], url_path="approve", permission_classes=[IsGymManager])
    def approve(self, request, pk=None):
        invoice = self.get_object()
        serializer = InvoiceActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            updated = approve_invoice(invoice, approved_by=request.user, role=request.user.role)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(InvoiceSerializer(updated).data)

    @action(detail=True, methods=["post"], url_path="reject", permission_classes=[IsGymManager])
    def reject(self, request, pk=None):
        invoice = self.get_object()
        serializer = InvoiceActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data.get("reason") or serializer.validated_data.get("notes", "")
        updated = reject_invoice(invoice, rejected_by=request.user, reason=reason)
        return Response(InvoiceSerializer(updated).data)

    @action(detail=True, methods=["post"], url_path="generate-pdf", permission_classes=[IsAdmin])
    def generate_pdf(self, request, pk=None):
        invoice = self.get_object()
        updated = generate_invoice_pdf(invoice)
        return Response(InvoiceSerializer(updated).data)

    @action(detail=False, methods=["post"], url_path="generate", permission_classes=[IsAdmin])
    def generate(self, request):
        """
        Manually generate a draft invoice for one instructor for a period.
        """
        instructor_id = request.data.get("instructor_id")
        period_start = request.data.get("period_start")
        period_end = request.data.get("period_end")

        if not all([instructor_id, period_start, period_end]):
            return Response(
                {"detail": "instructor_id, period_start, period_end are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.staff.models import StaffProfile
        from datetime import date
        try:
            instructor = StaffProfile.objects.get(pk=instructor_id, tenant=request.tenant)
            start = date.fromisoformat(period_start)
            end = date.fromisoformat(period_end)
        except (StaffProfile.DoesNotExist, ValueError) as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        invoice = generate_invoice_for_instructor(instructor, start, end)
        return Response(InvoiceSerializer(invoice).data, status=status.HTTP_201_CREATED)


class InvoiceLineItemViewSet(TenantScopedMixin, ModelViewSet):
    serializer_class = InvoiceLineItemSerializer
    permission_classes = [IsGymManager]

    def get_queryset(self):
        return InvoiceLineItem.objects.filter(
            tenant=self.request.tenant,
            is_deleted=False,
            invoice_id=self.kwargs.get("invoice_pk"),
        )

    def perform_create(self, serializer):
        invoice = Invoice.objects.get(
            pk=self.kwargs["invoice_pk"], tenant=self.request.tenant
        )
        serializer.save(
            tenant=self.request.tenant,
            invoice=invoice,
            created_by=self.request.user,
            updated_by=self.request.user,
        )
        invoice.recalculate_total()


class PayrollBatchViewSet(TenantScopedMixin, ReadOnlyModelViewSet):
    serializer_class = PayrollBatchSerializer
    permission_classes = [IsPayroll]

    def get_queryset(self):
        return (
            PayrollBatch.objects.filter(tenant=self.request.tenant, is_deleted=False)
            .order_by("-period_start")
        )

    @action(detail=False, methods=["post"], url_path="run", permission_classes=[IsPayroll])
    def run_payroll(self, request):
        period_start = request.data.get("period_start")
        period_end = request.data.get("period_end")
        if not period_start or not period_end:
            return Response(
                {"detail": "period_start and period_end are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from datetime import date
        from .services import generate_payroll_batch
        try:
            start = date.fromisoformat(period_start)
            end = date.fromisoformat(period_end)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        batch = generate_payroll_batch(request.tenant, start, end, request.user)
        return Response(PayrollBatchSerializer(batch).data, status=status.HTTP_201_CREATED)


class PayRunViewSet(TenantScopedMixin, ReadOnlyModelViewSet):
    serializer_class = PayRunSerializer
    permission_classes = [IsPayroll]

    def get_queryset(self):
        return (
            PayRun.objects.filter(tenant=self.request.tenant, is_deleted=False)
            .select_related("invoice__instructor", "payroll_batch")
            .order_by("-created_at")
        )
