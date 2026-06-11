from datetime import date

from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet

from apps.core.mixins import TenantScopedMixin
from apps.core.permissions import (
    IsAdmin,
    IsGymManager,
    IsInvoiceParticipant,
    IsPayroll,
)
from apps.staff.models import StaffProfile
from apps.users.constants import UserRole

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
    flag_line_item_edited,
    generate_invoice_for_instructor,
    generate_invoice_pdf,
    mark_invoice_paid,
    reject_invoice,
    submit_invoice,
)
from .state import EDITABLE_STATUSES

MANAGER_ROLES = (UserRole.OWNER, UserRole.ADMIN, UserRole.GYM_MANAGER, UserRole.TEAM_LEADER)


def _own_staff_ids(request):
    return set(
        StaffProfile.objects.filter(
            user=request.user, tenant=request.tenant, is_deleted=False
        ).values_list("pk", flat=True)
    )


class InvoiceViewSet(TenantScopedMixin, ModelViewSet):
    filterset_fields = ["status", "instructor", "period_start", "period_end"]

    def get_serializer_class(self):
        if self.action == "list":
            return InvoiceListSerializer
        return InvoiceSerializer

    def get_permissions(self):
        current = getattr(self, "action", None)
        if current in ("approve", "reject"):
            return [IsGymManager()]
        if current == "mark_paid":
            return [IsPayroll()]
        if current == "generate_pdf":
            return [IsAdmin()]
        if current in ("create", "destroy"):
            return [IsGymManager()]
        # list / retrieve / partial_update / submit / generate
        return [IsInvoiceParticipant()]

    def _is_manager_or_payroll(self) -> bool:
        return self.request.user.role in (*MANAGER_ROLES, UserRole.PAYROLL)

    def get_queryset(self):
        qs = (
            Invoice.objects.filter(tenant=self.request.tenant, is_deleted=False)
            .select_related("instructor")
            .prefetch_related("line_items", "approvals__approved_by")
            .order_by("-period_start", "-created_at")
        )
        # Instructors only ever see their own invoices.
        if not self._is_manager_or_payroll():
            qs = qs.filter(instructor_id__in=_own_staff_ids(self.request))
        return qs

    def _require_owner_if_instructor(self, invoice):
        if not self._is_manager_or_payroll():
            if invoice.instructor_id not in _own_staff_ids(self.request):
                raise PermissionDenied("You can only act on your own invoices.")

    def perform_update(self, serializer):
        invoice = self.get_object()
        self._require_owner_if_instructor(invoice)
        if self.request.user.role not in MANAGER_ROLES and invoice.status not in EDITABLE_STATUSES:
            raise PermissionDenied("This invoice can no longer be edited.")
        serializer.save(updated_by=self.request.user)

    @action(detail=True, methods=["post"], url_path="submit")
    def submit(self, request, pk=None):
        invoice = self.get_object()
        self._require_owner_if_instructor(invoice)
        try:
            updated = submit_invoice(invoice, submitted_by=request.user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(InvoiceSerializer(updated).data)

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        invoice = self.get_object()
        serializer = InvoiceActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            updated = approve_invoice(invoice, approved_by=request.user, role=request.user.role)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(InvoiceSerializer(updated).data)

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        invoice = self.get_object()
        serializer = InvoiceActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data.get("reason") or serializer.validated_data.get("notes", "")
        if not reason.strip():
            return Response({"detail": "A rejection reason is required."}, status=status.HTTP_400_BAD_REQUEST)
        updated = reject_invoice(invoice, rejected_by=request.user, reason=reason)
        return Response(InvoiceSerializer(updated).data)

    @action(detail=True, methods=["post"], url_path="mark-paid")
    def mark_paid(self, request, pk=None):
        invoice = self.get_object()
        payment_reference = (request.data.get("payment_reference") or "").strip()
        payment_date = None
        raw_date = request.data.get("payment_date")
        if raw_date:
            try:
                payment_date = date.fromisoformat(raw_date)
            except ValueError:
                return Response({"detail": "Invalid payment_date."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            updated = mark_invoice_paid(
                invoice, paid_by=request.user,
                payment_date=payment_date, payment_reference=payment_reference,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(InvoiceSerializer(updated).data)

    @action(detail=True, methods=["post"], url_path="generate-pdf")
    def generate_pdf(self, request, pk=None):
        invoice = self.get_object()
        updated = generate_invoice_pdf(invoice)
        return Response(InvoiceSerializer(updated).data)

    @action(detail=True, methods=["get"], url_path="pdf")
    def pdf(self, request, pk=None):
        """Download the invoice PDF (generated on demand if not yet built).
        Scoped via get_queryset — instructors get their own only."""
        from django.http import FileResponse

        invoice = self.get_object()
        if not invoice.pdf_file:
            generate_invoice_pdf(invoice)
            invoice.refresh_from_db()
        return FileResponse(
            invoice.pdf_file.open("rb"),
            content_type="application/pdf",
            filename=f"{invoice.invoice_number}.pdf",
        )

    @action(detail=False, methods=["post"], url_path="generate")
    def generate(self, request):
        """Generate a draft invoice for a period. Instructors generate their own;
        managers may generate for any instructor via instructor_id."""
        period_start = request.data.get("period_start")
        period_end = request.data.get("period_end")
        if not (period_start and period_end):
            return Response(
                {"detail": "period_start and period_end are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            start = date.fromisoformat(period_start)
            end = date.fromisoformat(period_end)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        if request.user.role in MANAGER_ROLES:
            instructor_id = request.data.get("instructor_id")
            if not instructor_id:
                return Response({"detail": "instructor_id is required."}, status=status.HTTP_400_BAD_REQUEST)
            try:
                instructor = StaffProfile.objects.get(pk=instructor_id, tenant=request.tenant)
            except StaffProfile.DoesNotExist:
                return Response({"detail": "Instructor not found."}, status=status.HTTP_404_NOT_FOUND)
        else:
            instructor = StaffProfile.objects.filter(
                user=request.user, tenant=request.tenant, is_deleted=False
            ).first()
            if instructor is None:
                return Response({"detail": "No staff profile for this user."}, status=status.HTTP_404_NOT_FOUND)

        invoice = generate_invoice_for_instructor(instructor, start, end)
        return Response(InvoiceSerializer(invoice).data, status=status.HTTP_201_CREATED)


class InvoiceLineItemViewSet(TenantScopedMixin, ModelViewSet):
    serializer_class = InvoiceLineItemSerializer
    permission_classes = [IsInvoiceParticipant]

    def _invoice(self):
        return Invoice.objects.get(pk=self.kwargs["invoice_pk"], tenant=self.request.tenant)

    def _check_editable(self, invoice):
        if self.request.user.role not in MANAGER_ROLES:
            if invoice.instructor_id not in _own_staff_ids(self.request):
                raise PermissionDenied("You can only edit your own invoice.")
        if invoice.status not in EDITABLE_STATUSES:
            raise PermissionDenied("This invoice can no longer be edited.")

    def get_queryset(self):
        qs = InvoiceLineItem.objects.filter(
            tenant=self.request.tenant,
            is_deleted=False,
            invoice_id=self.kwargs.get("invoice_pk"),
        )
        if self.request.user.role not in (*MANAGER_ROLES, UserRole.PAYROLL):
            qs = qs.filter(invoice__instructor_id__in=_own_staff_ids(self.request))
        return qs

    def perform_create(self, serializer):
        invoice = self._invoice()
        self._check_editable(invoice)
        is_instructor = self.request.user.role not in MANAGER_ROLES
        line_item = serializer.save(
            tenant=self.request.tenant,
            invoice=invoice,
            is_manual_adjustment=is_instructor,
            created_by=self.request.user,
            updated_by=self.request.user,
        )
        if is_instructor:
            flag_line_item_edited(line_item)
        invoice.recalculate_total()

    def perform_update(self, serializer):
        invoice = self._invoice()
        self._check_editable(invoice)
        line_item = serializer.save(updated_by=self.request.user)
        if self.request.user.role not in MANAGER_ROLES:
            flag_line_item_edited(line_item)
        invoice.recalculate_total()

    def perform_destroy(self, instance):
        invoice = self._invoice()
        self._check_editable(invoice)
        instance.soft_delete(deleted_by=self.request.user)
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
