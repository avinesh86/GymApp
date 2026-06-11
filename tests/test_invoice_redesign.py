"""
Tests for the invoice-workflow redesign: state machine, audit/payment fields,
instructor self-service (own list / generate / edit-flagging / submit), manager
approve/reject, payroll mark-paid, and amend-after-reject.
"""
from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.invoices import services
from apps.invoices.models import Invoice, InvoiceLineItem
from apps.invoices.state import InvalidInvoiceTransition, transition
from apps.invoices.views import InvoiceLineItemViewSet, InvoiceViewSet
from tests.factories import StaffProfileFactory, UserFactory

pytestmark = pytest.mark.django_db
S = Invoice.Status


def _invoice(tenant, instructor, status=S.DRAFT, amount="50.00"):
    inv = Invoice.objects.create(
        tenant=tenant, instructor=instructor,
        period_start=date(2026, 6, 1), period_end=date(2026, 6, 14), status=status,
    )
    InvoiceLineItem.objects.create(
        tenant=tenant, invoice=inv, description="Class", quantity=Decimal("1"),
        rate=Decimal(amount), amount=Decimal(amount),
    )
    inv.recalculate_total()
    return inv


def _post(view, action, tenant, user, pk=None, data=None, **extra_kwargs):
    request = APIRequestFactory().post("/x/", data or {}, format="json")
    force_authenticate(request, user=user)
    request.tenant = tenant
    kwargs = {**extra_kwargs}
    if pk is not None:
        kwargs["pk"] = pk
    return view(request, **kwargs)


# ─── State machine ───────────────────────────────────────────────────────────

class TestInvoiceState:
    def test_invalid_transition_raises(self, tenant, instructor):
        inv = _invoice(tenant, instructor, status=S.PAID)
        with pytest.raises(InvalidInvoiceTransition):
            transition(inv, S.SUBMITTED)


# ─── Services ────────────────────────────────────────────────────────────────

class TestServices:
    def test_submit_allows_draft_and_rejected(self, tenant, instructor, manager_user):
        inv = _invoice(tenant, instructor)
        services.submit_invoice(inv, manager_user)
        assert inv.status == S.SUBMITTED

        services.reject_invoice(inv, manager_user, reason="fix it")
        assert inv.status == S.REJECTED
        assert inv.rejection_reason == "fix it"
        # amend + resubmit allowed from rejected
        services.submit_invoice(inv, manager_user)
        assert inv.status == S.SUBMITTED

    def test_manager_approve_records_approver(self, tenant, instructor, manager_user):
        inv = _invoice(tenant, instructor, status=S.SUBMITTED)
        services.approve_invoice(inv, manager_user, role="gym_manager")
        assert inv.status == S.MANAGER_APPROVED
        assert inv.manager_approver_id == manager_user.id
        assert inv.manager_approved_at is not None

    def test_mark_paid_records_payment(self, tenant, instructor, payroll_user):
        inv = _invoice(tenant, instructor, status=S.MANAGER_APPROVED)
        services.mark_invoice_paid(inv, payroll_user, payment_date=date(2026, 6, 20), payment_reference="TXN-9")
        assert inv.status == S.PAID
        assert inv.payroll_approver_id == payroll_user.id
        assert inv.payment_reference == "TXN-9"
        assert inv.payment_date == date(2026, 6, 20)

    def test_cannot_mark_paid_from_submitted(self, tenant, instructor, payroll_user):
        inv = _invoice(tenant, instructor, status=S.SUBMITTED)
        with pytest.raises(ValueError):
            services.mark_invoice_paid(inv, payroll_user)


# ─── Instructor self-service (views) ─────────────────────────────────────────

class TestInstructorAccess:
    def _instructor_user(self, tenant):
        user = UserFactory(tenant=tenant, role="instructor")
        staff = StaffProfileFactory(tenant=tenant, role="instructor", email="me@t.com", user=user)
        return user, staff

    def test_instructor_sees_only_own_invoices(self, tenant, instructor):
        user, me = self._instructor_user(tenant)
        mine = _invoice(tenant, me)
        _invoice(tenant, instructor)  # someone else's

        request = APIRequestFactory().get("/x/")
        force_authenticate(request, user=user)
        request.tenant = tenant
        resp = InvoiceViewSet.as_view({"get": "list"})(request)
        resp.render()
        rows = resp.data["results"] if isinstance(resp.data, dict) else resp.data
        ids = {r["id"] for r in rows}
        assert mine.id in ids
        assert len(ids) == 1

    def test_instructor_can_generate_own(self, tenant):
        user, me = self._instructor_user(tenant)
        resp = _post(
            InvoiceViewSet.as_view({"post": "generate"}), "generate", tenant, user,
            data={"period_start": "2026-06-01", "period_end": "2026-06-14"},
        )
        assert resp.status_code == 201
        assert Invoice.objects.filter(instructor=me).exists()

    def test_instructor_can_submit_own_but_not_others(self, tenant, instructor):
        user, me = self._instructor_user(tenant)
        mine = _invoice(tenant, me)
        theirs = _invoice(tenant, instructor)

        ok = _post(InvoiceViewSet.as_view({"post": "submit"}), "submit", tenant, user, pk=mine.id)
        assert ok.status_code == 200

        denied = _post(InvoiceViewSet.as_view({"post": "submit"}), "submit", tenant, user, pk=theirs.id)
        assert denied.status_code in (403, 404)

    def test_instructor_edit_flags_line_item(self, tenant):
        user, me = self._instructor_user(tenant)
        inv = _invoice(tenant, me)
        item = inv.line_items.first()

        request = APIRequestFactory().patch("/x/", {"rate": "75.00"}, format="json")
        force_authenticate(request, user=user)
        request.tenant = tenant
        resp = InvoiceLineItemViewSet.as_view({"patch": "partial_update"})(
            request, invoice_pk=inv.id, pk=item.id
        )
        assert resp.status_code == 200
        item.refresh_from_db()
        assert item.is_flagged is True
        assert item.flag_reason == "Edited by instructor"

    def test_instructor_cannot_edit_after_submitted(self, tenant):
        user, me = self._instructor_user(tenant)
        inv = _invoice(tenant, me, status=S.SUBMITTED)
        item = inv.line_items.first()

        request = APIRequestFactory().patch("/x/", {"rate": "75.00"}, format="json")
        force_authenticate(request, user=user)
        request.tenant = tenant
        resp = InvoiceLineItemViewSet.as_view({"patch": "partial_update"})(
            request, invoice_pk=inv.id, pk=item.id
        )
        assert resp.status_code == 403

    def test_instructor_cannot_approve(self, tenant):
        user, me = self._instructor_user(tenant)
        inv = _invoice(tenant, me, status=S.SUBMITTED)
        resp = _post(InvoiceViewSet.as_view({"post": "approve"}), "approve", tenant, user, pk=inv.id)
        assert resp.status_code == 403


# ─── Payroll mark-paid (view) ────────────────────────────────────────────────

class TestPayrollMarkPaid:
    def test_payroll_marks_paid(self, tenant, instructor, payroll_user):
        inv = _invoice(tenant, instructor, status=S.MANAGER_APPROVED)
        resp = _post(
            InvoiceViewSet.as_view({"post": "mark_paid"}), "mark_paid", tenant, payroll_user, pk=inv.id,
            data={"payment_date": "2026-06-20", "payment_reference": "BANK-1"},
        )
        assert resp.status_code == 200
        inv.refresh_from_db()
        assert inv.status == S.PAID
        assert inv.payment_reference == "BANK-1"
