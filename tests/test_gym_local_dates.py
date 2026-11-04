"""
"Today", a day and a period mean the gym's local calendar, not UTC's.

Every case uses an Auckland gym (UTC+13 in November/December) at a moment when
it is already the 1st of December there but still 30 November in UTC:
20:30 UTC on 30 Nov is 9:30am on 1 Dec in Auckland.
"""

from datetime import date, datetime, time, timedelta
from unittest import mock
from zoneinfo import ZoneInfo

import pytest
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.invoices.models import Invoice
from apps.invoices.services import generate_invoice_for_instructor
from apps.invoices.tasks import auto_generate_invoices
from apps.staff.models import StaffQualification
from apps.tenants.views import GymLocaleView
from apps.timetable.models import RecurringTimetableRule, TimetableEvent
from apps.timetable.tasks import check_unfilled_classes, generate_upcoming_recurring_events
from apps.timetable.views import TimetableEventViewSet
from tests.factories import (
    ClassTypeFactory,
    StaffPayRateFactory,
    StaffProfileFactory,
    TenantFactory,
    TenantSettingsFactory,
    TimetableEventFactory,
    UserFactory,
)

NZ = ZoneInfo("Pacific/Auckland")
UTC = ZoneInfo("UTC")
# 9:30am Mon 1 Dec 2025 in Auckland; still Sun 30 Nov in UTC.
NZ_MORNING_ON_THE_1ST = datetime(2025, 11, 30, 20, 30, tzinfo=UTC)


def _at(moment):
    return mock.patch("django.utils.timezone.now", return_value=moment)


@pytest.fixture
def nz_gym(db):
    tenant = TenantFactory(slug="nz-gym")
    TenantSettingsFactory(tenant=tenant, timezone="Pacific/Auckland", invoice_frequency="monthly")
    return tenant


@pytest.fixture
def nz_instructor(nz_gym):
    staff = StaffProfileFactory(tenant=nz_gym, name="Kiri")
    StaffPayRateFactory(tenant=nz_gym, staff=staff, effective_from=date(2025, 1, 1))
    return staff


@pytest.fixture
def nz_class_type(nz_gym):
    return ClassTypeFactory(tenant=nz_gym, name="Spin")


def _nz_class(tenant, class_type, instructor, local_start, status="completed"):
    start = local_start.replace(tzinfo=NZ)
    return TimetableEventFactory(
        tenant=tenant,
        class_type=class_type,
        instructor=instructor,
        start_datetime=start,
        end_datetime=start + timedelta(hours=1),
        status=status,
    )


@pytest.mark.django_db
class TestInvoices:
    def test_period_includes_9am_class_on_the_1st(self, nz_gym, nz_instructor, nz_class_type):
        # 9am 1 Dec in Auckland = 20:00 UTC 30 Nov.
        _nz_class(nz_gym, nz_class_type, nz_instructor, datetime(2025, 12, 1, 9, 0))

        december = generate_invoice_for_instructor(nz_instructor, date(2025, 12, 1), date(2025, 12, 31))
        november = generate_invoice_for_instructor(nz_instructor, date(2025, 11, 1), date(2025, 11, 30))

        assert december.line_items.count() == 1
        assert november.line_items.count() == 0

    def test_auto_generate_uses_the_gyms_month(self, nz_gym, nz_instructor):
        with _at(NZ_MORNING_ON_THE_1ST):
            auto_generate_invoices()

        invoice = Invoice.objects.get(tenant=nz_gym, instructor=nz_instructor)
        assert (invoice.period_start, invoice.period_end) == (date(2025, 12, 1), date(2025, 12, 31))

    def test_invoice_number_is_dated_by_the_gyms_today(self, nz_gym, nz_instructor):
        with _at(NZ_MORNING_ON_THE_1ST):
            invoice = Invoice.objects.create(
                tenant=nz_gym, instructor=nz_instructor,
                period_start=date(2025, 12, 1), period_end=date(2025, 12, 31),
            )

        assert invoice.invoice_number.startswith("INV-20251201-")

    def test_explicit_invoice_number_is_kept(self, nz_gym, nz_instructor):
        invoice = Invoice.objects.create(
            tenant=nz_gym, instructor=nz_instructor, invoice_number="INV-CUSTOM-1",
            period_start=date(2025, 12, 1), period_end=date(2025, 12, 31),
        )
        assert invoice.invoice_number == "INV-CUSTOM-1"


@pytest.mark.django_db
def test_qualification_expired_from_the_gyms_next_day(nz_gym, nz_instructor):
    qualification = StaffQualification.objects.create(
        tenant=nz_gym, staff=nz_instructor, name="First Aid", expires_at=date(2025, 11, 30),
    )
    with _at(NZ_MORNING_ON_THE_1ST):
        assert qualification.is_expired is True
    with _at(datetime(2025, 11, 30, 9, 0, tzinfo=UTC)):  # 10pm 30 Nov in Auckland
        assert qualification.is_expired is False


@pytest.mark.django_db
class TestTimetableTasks:
    def test_recurring_events_generated_from_the_gyms_today(self, nz_gym, nz_class_type, nz_instructor):
        # A Monday 6am class. 1 Dec 2025 is a Monday — today in Auckland.
        rule = RecurringTimetableRule.objects.create(
            tenant=nz_gym, class_type=nz_class_type, instructor=nz_instructor,
            day_of_week=0, start_time=time(6, 0), valid_from=date(2025, 1, 1),
        )

        with _at(NZ_MORNING_ON_THE_1ST):
            generate_upcoming_recurring_events()

        starts = sorted(
            e.start_datetime.astimezone(NZ).date()
            for e in TimetableEvent.objects.filter(recurring_rule=rule)
        )
        assert starts[0] == date(2025, 12, 1)
        assert starts[-1] == date(2025, 12, 29)

    def test_check_unfilled_includes_earlier_class_today(self, nz_gym, nz_class_type):
        # 6am 1 Dec in Auckland (17:00 UTC 30 Nov) has no instructor.
        event = _nz_class(nz_gym, nz_class_type, None, datetime(2025, 12, 1, 6, 0), status="scheduled")
        yesterday = _nz_class(nz_gym, nz_class_type, None, datetime(2025, 11, 30, 18, 0), status="scheduled")

        with _at(NZ_MORNING_ON_THE_1ST):
            check_unfilled_classes()

        event.refresh_from_db()
        yesterday.refresh_from_db()
        assert event.status == TimetableEvent.Status.UNFILLED
        assert yesterday.status == TimetableEvent.Status.SCHEDULED


@pytest.mark.django_db
class TestViews:
    def _get(self, view, url, tenant):
        request = APIRequestFactory().get(url)
        force_authenticate(request, user=UserFactory(tenant=tenant, role="gym_manager"))
        request.tenant = tenant
        response = view(request)
        assert response.status_code == 200, response.data
        return response.data

    def test_week_defaults_to_the_gyms_today(self, nz_gym, nz_class_type, nz_instructor):
        _nz_class(nz_gym, nz_class_type, nz_instructor, datetime(2025, 12, 1, 9, 0), status="scheduled")

        with _at(NZ_MORNING_ON_THE_1ST):
            data = self._get(
                TimetableEventViewSet.as_view({"get": "week"}), "/api/v1/timetable/events/week/", nz_gym,
            )

        assert [e["date"] for e in data] == ["2025-12-01"]

    def test_locale_returns_the_gyms_timezone(self, nz_gym):
        data = self._get(GymLocaleView.as_view(), "/api/v1/tenants/locale/", nz_gym)
        assert data == {"timezone": "Pacific/Auckland"}
