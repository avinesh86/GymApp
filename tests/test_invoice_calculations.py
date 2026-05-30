"""
Tests for invoice calculation logic: _calculate_amount, apply_pay_rates,
generate_payroll_batch, and ClassBonus application per bonus type.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.attendance.models import AttendanceRecord
from apps.invoices.models import Invoice, InvoiceLineItem, PayrollBatch, PayRun
from apps.invoices.services import (
    _apply_bonus_rules,
    _calculate_amount,
    _resolve_pay_rate,
    apply_pay_rates,
    approve_invoice,
    generate_invoice_for_instructor,
    generate_payroll_batch,
    submit_invoice,
)
from apps.staff.models import StaffPayRate, StaffPayRateOverride
from apps.timetable.models import ClassBonus, TimetableEvent
from tests.factories import (
    AttendanceRecordFactory,
    StaffPayRateFactory,
    StaffProfileFactory,
    TimetableEventFactory,
)


# ---------------------------------------------------------------------------
# _calculate_amount
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestCalculateAmount:
    def test_per_class_ignores_attendance(self):
        amount = _calculate_amount("per_class", Decimal("50.00"), Decimal("0"), 20)
        assert amount == Decimal("50.00")

    def test_per_head_uses_attendance(self):
        amount = _calculate_amount("per_head", Decimal("0"), Decimal("3.00"), 15)
        assert amount == Decimal("45.00")

    def test_blended_base_plus_per_head(self):
        amount = _calculate_amount("blended", Decimal("30.00"), Decimal("2.00"), 10)
        assert amount == Decimal("50.00")

    def test_flat_rate(self):
        amount = _calculate_amount("flat", Decimal("100.00"), Decimal("0"), 0)
        assert amount == Decimal("100.00")

    def test_hourly_rate(self):
        amount = _calculate_amount("hourly", Decimal("25.00"), Decimal("0"), 0)
        assert amount == Decimal("25.00")

    def test_per_head_zero_attendance(self):
        amount = _calculate_amount("per_head", Decimal("0"), Decimal("5.00"), 0)
        assert amount == Decimal("0")

    def test_blended_zero_attendance(self):
        amount = _calculate_amount("blended", Decimal("30.00"), Decimal("2.00"), 0)
        assert amount == Decimal("30.00")


# ---------------------------------------------------------------------------
# _resolve_pay_rate
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestResolvePayRate:
    def test_default_pay_rate(self, tenant, instructor, class_type, pay_rate):
        start = timezone.now() - timedelta(hours=2)
        event = TimetableEventFactory(
            tenant=tenant,
            class_type=class_type,
            instructor=instructor,
            start_datetime=start,
            end_datetime=start + timedelta(hours=1),
            status="completed",
        )

        rate, rate_type, amount = _resolve_pay_rate(instructor, event, date.today())
        assert rate == Decimal("50.00")
        assert rate_type == "per_class"

    def test_class_type_override_takes_priority(self, tenant, instructor, class_type, pay_rate):
        StaffPayRateOverride.objects.create(
            tenant=tenant,
            staff=instructor,
            class_type=class_type,
            amount=Decimal("75.00"),
            effective_from=date.today() - timedelta(days=10),
        )

        start = timezone.now() - timedelta(hours=2)
        event = TimetableEventFactory(
            tenant=tenant,
            class_type=class_type,
            instructor=instructor,
            start_datetime=start,
            end_datetime=start + timedelta(hours=1),
            status="completed",
        )

        rate, rate_type, amount = _resolve_pay_rate(instructor, event, date.today())
        assert rate == Decimal("75.00")
        assert rate_type == "override"

    def test_no_pay_rate_returns_zero(self, tenant, class_type):
        no_rate_instructor = StaffProfileFactory(tenant=tenant, email="norate@test.com")

        start = timezone.now() - timedelta(hours=2)
        event = TimetableEventFactory(
            tenant=tenant,
            class_type=class_type,
            instructor=no_rate_instructor,
            start_datetime=start,
            end_datetime=start + timedelta(hours=1),
            status="completed",
        )

        rate, rate_type, amount = _resolve_pay_rate(no_rate_instructor, event, date.today())
        assert rate == Decimal("0")
        assert rate_type == "none"

    def test_expired_pay_rate_not_used(self, tenant, instructor, class_type):
        StaffPayRateFactory(
            tenant=tenant,
            staff=instructor,
            rate_type="per_class",
            amount=Decimal("40.00"),
            effective_from=date.today() - timedelta(days=60),
            effective_to=date.today() - timedelta(days=31),
        )

        start = timezone.now() - timedelta(hours=2)
        event = TimetableEventFactory(
            tenant=tenant,
            class_type=class_type,
            instructor=instructor,
            start_datetime=start,
            end_datetime=start + timedelta(hours=1),
            status="completed",
        )

        rate, rate_type, amount = _resolve_pay_rate(instructor, event, date.today())
        assert rate == Decimal("0")
        assert rate_type == "none"


# ---------------------------------------------------------------------------
# ClassBonus application
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestClassBonusApplication:
    def _make_invoice_and_event(self, tenant, instructor, class_type, attendance_count=0):
        start = timezone.now() - timedelta(hours=2)
        event = TimetableEventFactory(
            tenant=tenant,
            class_type=class_type,
            instructor=instructor,
            start_datetime=start,
            end_datetime=start + timedelta(hours=1),
            status="completed",
        )
        if attendance_count > 0:
            AttendanceRecord.objects.create(
                tenant=tenant,
                timetable_event=event,
                count=attendance_count,
            )
        invoice = Invoice.objects.create(
            tenant=tenant,
            instructor=instructor,
            period_start=date.today().replace(day=1),
            period_end=date.today(),
            status=Invoice.Status.DRAFT,
        )
        return invoice, event

    def test_flat_bonus_always_applied(self, tenant, instructor, class_type):
        ClassBonus.objects.create(
            tenant=tenant,
            class_type=class_type,
            bonus_type=ClassBonus.BonusType.FLAT_BONUS,
            bonus_amount=Decimal("15.00"),
        )
        invoice, event = self._make_invoice_and_event(tenant, instructor, class_type)
        _apply_bonus_rules(invoice, event, 0)

        bonus_items = invoice.line_items.filter(is_bonus=True)
        assert bonus_items.count() == 1
        assert bonus_items.first().rate == Decimal("15.00")

    def test_attendance_threshold_met(self, tenant, instructor, class_type):
        ClassBonus.objects.create(
            tenant=tenant,
            class_type=class_type,
            bonus_type=ClassBonus.BonusType.ATTENDANCE_THRESHOLD,
            threshold=10,
            bonus_amount=Decimal("20.00"),
        )
        invoice, event = self._make_invoice_and_event(tenant, instructor, class_type)
        _apply_bonus_rules(invoice, event, 12)

        bonus_items = invoice.line_items.filter(is_bonus=True)
        assert bonus_items.count() == 1

    def test_attendance_threshold_not_met(self, tenant, instructor, class_type):
        ClassBonus.objects.create(
            tenant=tenant,
            class_type=class_type,
            bonus_type=ClassBonus.BonusType.ATTENDANCE_THRESHOLD,
            threshold=10,
            bonus_amount=Decimal("20.00"),
        )
        invoice, event = self._make_invoice_and_event(tenant, instructor, class_type)
        _apply_bonus_rules(invoice, event, 5)

        bonus_items = invoice.line_items.filter(is_bonus=True)
        assert bonus_items.count() == 0

    def test_per_head_above_threshold(self, tenant, instructor, class_type):
        ClassBonus.objects.create(
            tenant=tenant,
            class_type=class_type,
            bonus_type=ClassBonus.BonusType.PER_HEAD_ABOVE,
            threshold=10,
            bonus_amount=Decimal("3.00"),
        )
        invoice, event = self._make_invoice_and_event(tenant, instructor, class_type)
        _apply_bonus_rules(invoice, event, 15)

        bonus_items = invoice.line_items.filter(is_bonus=True)
        assert bonus_items.count() == 1
        assert bonus_items.first().rate == Decimal("15.00")  # 5 excess * $3

    def test_per_head_above_at_threshold_no_bonus(self, tenant, instructor, class_type):
        ClassBonus.objects.create(
            tenant=tenant,
            class_type=class_type,
            bonus_type=ClassBonus.BonusType.PER_HEAD_ABOVE,
            threshold=10,
            bonus_amount=Decimal("3.00"),
        )
        invoice, event = self._make_invoice_and_event(tenant, instructor, class_type)
        _apply_bonus_rules(invoice, event, 10)

        bonus_items = invoice.line_items.filter(is_bonus=True)
        assert bonus_items.count() == 0


# ---------------------------------------------------------------------------
# apply_pay_rates
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestApplyPayRates:
    def test_reapply_updates_line_items(self, tenant, instructor, class_type, pay_rate):
        period_start = date.today().replace(day=1)
        period_end = date.today()

        invoice = generate_invoice_for_instructor(instructor, period_start, period_end)

        pay_rate.amount = Decimal("60.00")
        pay_rate.save()

        updated = apply_pay_rates(invoice)
        for item in updated.line_items.filter(is_bonus=False, is_manual_adjustment=False, is_deleted=False):
            assert item.rate == Decimal("60.00")

    def test_cannot_reapply_on_submitted_invoice(self, tenant, instructor, class_type, pay_rate, admin_user):
        period_start = date.today().replace(day=1)
        period_end = date.today()

        start = timezone.now() - timedelta(hours=2)
        TimetableEventFactory(
            tenant=tenant,
            class_type=class_type,
            instructor=instructor,
            start_datetime=start,
            end_datetime=start + timedelta(hours=1),
            status="completed",
        )

        invoice = generate_invoice_for_instructor(instructor, period_start, period_end)
        submit_invoice(invoice, submitted_by=admin_user)

        with pytest.raises(ValueError, match="draft"):
            apply_pay_rates(invoice)


# ---------------------------------------------------------------------------
# generate_payroll_batch
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestGeneratePayrollBatch:
    def test_creates_pay_runs_for_approved_invoices(self, tenant, instructor, class_type, pay_rate, admin_user):
        period_start = date.today().replace(day=1)
        period_end = date.today()

        start = timezone.now() - timedelta(hours=2)
        TimetableEventFactory(
            tenant=tenant,
            class_type=class_type,
            instructor=instructor,
            start_datetime=start,
            end_datetime=start + timedelta(hours=1),
            status="completed",
        )

        invoice = generate_invoice_for_instructor(instructor, period_start, period_end)
        submit_invoice(invoice, submitted_by=admin_user)
        approve_invoice(invoice, approved_by=admin_user, role="gym_manager")
        approve_invoice(invoice, approved_by=admin_user, role="payroll")

        assert invoice.status == Invoice.Status.PAYROLL_APPROVED

        batch = generate_payroll_batch(tenant, period_start, period_end, admin_user)

        assert batch.status == PayrollBatch.Status.COMPLETE
        assert batch.completed_at is not None
        assert PayRun.objects.filter(payroll_batch=batch).count() == 1

        invoice.refresh_from_db()
        assert invoice.status == Invoice.Status.PAID

    def test_ignores_non_approved_invoices(self, tenant, instructor, class_type, pay_rate, admin_user):
        period_start = date.today().replace(day=1)
        period_end = date.today()

        start = timezone.now() - timedelta(hours=2)
        TimetableEventFactory(
            tenant=tenant,
            class_type=class_type,
            instructor=instructor,
            start_datetime=start,
            end_datetime=start + timedelta(hours=1),
            status="completed",
        )

        invoice = generate_invoice_for_instructor(instructor, period_start, period_end)

        batch = generate_payroll_batch(tenant, period_start, period_end, admin_user)

        assert PayRun.objects.filter(payroll_batch=batch).count() == 0
        invoice.refresh_from_db()
        assert invoice.status == Invoice.Status.DRAFT
