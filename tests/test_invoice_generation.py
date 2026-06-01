"""
Tests for invoice generation: completed classes → invoice lines → correct amounts.
"""

from datetime import date, timedelta
from decimal import Decimal

import datetime as dt

from django.test import TestCase
from django.utils import timezone

from tests.factories import (
    AttendanceRecordFactory,
    ClassTypeFactory,
    InvoiceFactory,
    StaffPayRateFactory,
    StaffProfileFactory,
    TenantDomainFactory,
    TenantFactory,
    TimetableEventFactory,
    UserFactory,
)


class InvoiceGenerationTest(TestCase):
    def setUp(self):
        self.tenant = TenantFactory()
        TenantDomainFactory(tenant=self.tenant)
        self.admin = UserFactory(tenant=self.tenant, role="admin")
        self.class_type = ClassTypeFactory(tenant=self.tenant, name="Yoga")
        self.instructor = StaffProfileFactory(tenant=self.tenant)

        # Keep period in the recent past so events at +0, +1, +2 days all fall within it
        self.period_start = date.today() - timedelta(days=10)
        self.period_end = self.period_start + timedelta(days=4)

        # Pay rate: $50 per class
        self.pay_rate = StaffPayRateFactory(
            tenant=self.tenant,
            staff=self.instructor,
            rate_type="per_class",
            amount=Decimal("50.00"),
            effective_from=self.period_start - timedelta(days=1),
        )

        # Create 3 completed events — use noon UTC to avoid date shifting across timezones
        self.events = []
        for i in range(3):
            event_date = self.period_start + timedelta(days=i)
            start = dt.datetime(
                event_date.year, event_date.month, event_date.day,
                12, 0, 0,
                tzinfo=dt.timezone.utc,
            )
            event = TimetableEventFactory(
                tenant=self.tenant,
                class_type=self.class_type,
                instructor=self.instructor,
                start_datetime=start,
                end_datetime=start + timedelta(hours=1),
                status="completed",
            )
            self.events.append(event)

    def test_invoice_created_for_instructor(self):
        from apps.invoices.services import generate_invoice_for_instructor

        invoice = generate_invoice_for_instructor(
            self.instructor, self.period_start, self.period_end
        )

        self.assertIsNotNone(invoice)
        self.assertEqual(invoice.status, "draft")
        self.assertEqual(invoice.instructor, self.instructor)

    def test_invoice_has_correct_line_item_count(self):
        from apps.invoices.services import generate_invoice_for_instructor

        invoice = generate_invoice_for_instructor(
            self.instructor, self.period_start, self.period_end
        )

        base_items = invoice.line_items.filter(
            is_deleted=False, is_bonus=False, is_manual_adjustment=False
        ).count()
        self.assertEqual(base_items, 3)

    def test_invoice_line_items_have_correct_rate(self):
        from apps.invoices.services import generate_invoice_for_instructor

        invoice = generate_invoice_for_instructor(
            self.instructor, self.period_start, self.period_end
        )

        for item in invoice.line_items.filter(is_deleted=False, is_bonus=False):
            self.assertEqual(item.rate, Decimal("50.00"))
            self.assertEqual(item.amount, Decimal("50.00"))

    def test_invoice_total_is_correct(self):
        from apps.invoices.services import generate_invoice_for_instructor

        invoice = generate_invoice_for_instructor(
            self.instructor, self.period_start, self.period_end
        )

        expected_total = Decimal("150.00")  # 3 classes x $50
        self.assertEqual(invoice.total_amount, expected_total)

    def test_attendance_bonus_applied(self):
        from apps.timetable.models import ClassBonus

        # Add a green threshold bonus — only fires when attendance >= green threshold (10)
        ClassBonus.objects.create(
            tenant=self.tenant,
            class_type=self.class_type,
            bonus_type=ClassBonus.BonusType.ATTENDANCE_THRESHOLD,
            threshold=10,
            bonus_amount=Decimal("10.00"),
        )

        # Add attendance above green threshold (10) for first event
        AttendanceRecordFactory(
            tenant=self.tenant,
            timetable_event=self.events[0],
            count=12,  # above green threshold of 10
        )

        from apps.invoices.services import generate_invoice_for_instructor

        invoice = generate_invoice_for_instructor(
            self.instructor, self.period_start, self.period_end
        )

        bonus_items = invoice.line_items.filter(is_deleted=False, is_bonus=True)
        self.assertEqual(bonus_items.count(), 1)
        self.assertEqual(bonus_items.first().amount, Decimal("10.00"))

    def test_no_duplicate_invoice_for_same_period(self):
        from apps.invoices.services import generate_invoice_for_instructor

        invoice1 = generate_invoice_for_instructor(
            self.instructor, self.period_start, self.period_end
        )
        invoice2 = generate_invoice_for_instructor(
            self.instructor, self.period_start, self.period_end
        )

        self.assertEqual(invoice1.pk, invoice2.pk)

    def test_submit_invoice_transitions_status(self):
        from apps.invoices.services import generate_invoice_for_instructor, submit_invoice

        invoice = generate_invoice_for_instructor(
            self.instructor, self.period_start, self.period_end
        )
        submitted = submit_invoice(invoice, submitted_by=self.admin)

        self.assertEqual(submitted.status, "submitted")
        self.assertIsNotNone(submitted.submitted_at)

    def test_approve_invoice_workflow(self):
        from apps.invoices.services import (
            approve_invoice,
            generate_invoice_for_instructor,
            submit_invoice,
        )

        invoice = generate_invoice_for_instructor(
            self.instructor, self.period_start, self.period_end
        )
        invoice = submit_invoice(invoice, submitted_by=self.admin)
        invoice = approve_invoice(invoice, approved_by=self.admin, role="gym_manager")
        self.assertEqual(invoice.status, "manager_approved")

        invoice = approve_invoice(invoice, approved_by=self.admin, role="payroll")
        self.assertEqual(invoice.status, "payroll_approved")

    def test_reject_invoice(self):
        from apps.invoices.services import (
            generate_invoice_for_instructor,
            reject_invoice,
            submit_invoice,
        )

        invoice = generate_invoice_for_instructor(
            self.instructor, self.period_start, self.period_end
        )
        invoice = submit_invoice(invoice, submitted_by=self.admin)
        invoice = reject_invoice(invoice, rejected_by=self.admin, reason="Missing attendance data")

        self.assertEqual(invoice.status, "rejected")
        self.assertIn("Missing attendance data", invoice.notes)

    def test_cannot_submit_already_submitted_invoice(self):
        from apps.invoices.services import (
            generate_invoice_for_instructor,
            submit_invoice,
        )

        invoice = generate_invoice_for_instructor(
            self.instructor, self.period_start, self.period_end
        )
        invoice = submit_invoice(invoice, submitted_by=self.admin)

        with self.assertRaises(ValueError):
            submit_invoice(invoice, submitted_by=self.admin)
