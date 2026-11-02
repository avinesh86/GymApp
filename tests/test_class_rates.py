"""
Class rates: what an instructor is paid for each class type they teach, set
beside the class on the staff popup's Classes tab, and used on invoices.

- A rate can be per class, per head, or a base plus per head.
- Rates are dated: a new rate starts on its date and the old one ends the
  day before, so classes already taught keep their old rate.
- Each class on an invoice is priced at the rate in force on the day of the
  class (it used to be the first day of the pay period).
- Saving rates re-prices the instructor's draft invoices only.
"""

import datetime as dt
from datetime import date, timedelta
from decimal import Decimal

import pytest
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.attendance.models import AttendanceRecord
from apps.invoices.models import Invoice
from apps.invoices.services import generate_invoice_for_instructor
from apps.staff.class_rates import current_class_rate, set_class_rate
from apps.staff.class_rates_views import ClassRatesView
from apps.staff.models import StaffClassTypeCapability, StaffPayRateOverride
from tests.factories import ClassTypeFactory, StaffPayRateFactory, TimetableEventFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def sprint(tenant):
    return ClassTypeFactory(tenant=tenant, name="Sprint")


@pytest.fixture
def teaches_sprint(tenant, instructor, sprint):
    return StaffClassTypeCapability.objects.create(
        tenant=tenant, staff=instructor, class_type=sprint
    )


def _taught(tenant, instructor, class_type, day: date, count: int):
    start = dt.datetime(day.year, day.month, day.day, 12, 0, tzinfo=dt.timezone.utc)
    event = TimetableEventFactory(
        tenant=tenant,
        class_type=class_type,
        instructor=instructor,
        start_datetime=start,
        end_datetime=start + timedelta(hours=1),
        status="completed",
    )
    AttendanceRecord.objects.create(tenant=tenant, timetable_event=event, count=count)
    return event


def _post(user, tenant, staff, body):
    request = APIRequestFactory().post(
        f"/api/v1/staff/{staff.id}/class-rates/", body, format="json"
    )
    force_authenticate(request, user=user)
    request.tenant = tenant
    return ClassRatesView.as_view()(request, staff_pk=staff.id)


def _get(user, tenant, staff):
    request = APIRequestFactory().get(f"/api/v1/staff/{staff.id}/class-rates/")
    force_authenticate(request, user=user)
    request.tenant = tenant
    return ClassRatesView.as_view()(request, staff_pk=staff.id)


# ---------------------------------------------------------------------------
# Dated rates
# ---------------------------------------------------------------------------


def test_a_new_rate_ends_the_old_one_the_day_before(instructor, sprint):
    june, july = date(2026, 6, 1), date(2026, 7, 1)
    set_class_rate(
        instructor,
        sprint.id,
        rate_type="per_class",
        amount=Decimal("40"),
        per_head_rate=Decimal("0"),
        effective_from=june,
    )
    set_class_rate(
        instructor,
        sprint.id,
        rate_type="per_class",
        amount=Decimal("45"),
        per_head_rate=Decimal("0"),
        effective_from=july,
    )

    assert current_class_rate(
        instructor, sprint.id, date(2026, 6, 30)
    ).amount == Decimal("40")
    assert current_class_rate(instructor, sprint.id, july).amount == Decimal("45")


def test_saving_the_same_rate_again_changes_nothing(instructor, sprint):
    first = set_class_rate(
        instructor,
        sprint.id,
        rate_type="per_class",
        amount=Decimal("40"),
        per_head_rate=Decimal("0"),
        effective_from=date(2026, 6, 1),
    )
    again = set_class_rate(
        instructor,
        sprint.id,
        rate_type="per_class",
        amount=Decimal("40"),
        per_head_rate=Decimal("0"),
        effective_from=date(2026, 7, 1),
    )
    assert again.pk == first.pk
    assert (
        StaffPayRateOverride.objects.filter(staff=instructor, is_deleted=False).count()
        == 1
    )


# ---------------------------------------------------------------------------
# The Classes tab API
# ---------------------------------------------------------------------------


def test_lists_a_rate_slot_for_each_class_taught(
    tenant, admin_user, instructor, teaches_sprint
):
    response = _get(admin_user, tenant, instructor)
    assert response.status_code == 200
    assert response.data["rates"] == [
        {
            "class_type": teaches_sprint.class_type_id,
            "class_type_name": "Sprint",
            "rate": None,
        }
    ]


def test_saves_a_per_head_rate(tenant, admin_user, instructor, sprint, teaches_sprint):
    response = _post(
        admin_user,
        tenant,
        instructor,
        {
            "effective_from": "2026-06-01",
            "rates": [
                {
                    "class_type": sprint.id,
                    "rate_type": "per_head",
                    "amount": "99",
                    "per_head_rate": "2.50",
                }
            ],
        },
    )
    assert response.status_code == 200
    assert response.data["rates"][0]["rate"] == {
        "rate_type": "per_head",
        "amount": "0.00",
        "per_head_rate": "2.50",
        "effective_from": "2026-06-01",
    }


def test_clearing_a_rate_falls_back_to_the_default(
    tenant, admin_user, instructor, sprint, teaches_sprint
):
    set_class_rate(
        instructor,
        sprint.id,
        rate_type="per_class",
        amount=Decimal("40"),
        per_head_rate=Decimal("0"),
        effective_from=date(2026, 6, 1),
    )
    _post(
        admin_user,
        tenant,
        instructor,
        {
            "effective_from": "2026-07-01",
            "rates": [{"class_type": sprint.id, "rate_type": None}],
        },
    )

    assert current_class_rate(
        instructor, sprint.id, date(2026, 6, 30)
    ).amount == Decimal("40")
    assert current_class_rate(instructor, sprint.id, date(2026, 7, 1)) is None


def test_instructors_cannot_set_pay(tenant, instructor_user, instructor, sprint):
    response = _post(
        instructor_user,
        tenant,
        instructor,
        {
            "rates": [
                {"class_type": sprint.id, "rate_type": "per_class", "amount": "100"}
            ]
        },
    )
    assert response.status_code == 403


def test_rejects_another_gyms_class(tenant, other_tenant, admin_user, instructor):
    theirs = ClassTypeFactory(tenant=other_tenant, name="Theirs")
    response = _post(
        admin_user,
        tenant,
        instructor,
        {
            "rates": [
                {"class_type": theirs.id, "rate_type": "per_class", "amount": "10"}
            ]
        },
    )
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# Invoices
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "rate_type, amount, per_head, expected",
    [
        ("per_class", "45", "0", Decimal("45")),
        ("per_head", "0", "3", Decimal("36")),  # 12 people × $3
        ("blended", "20", "1.50", Decimal("38")),  # $20 + 12 × $1.50
    ],
)
def test_invoice_pays_the_class_rate(
    tenant, instructor, sprint, pay_rate, rate_type, amount, per_head, expected
):
    day = date.today() - timedelta(days=3)
    set_class_rate(
        instructor,
        sprint.id,
        rate_type=rate_type,
        amount=Decimal(amount),
        per_head_rate=Decimal(per_head),
        effective_from=day - timedelta(days=30),
    )
    _taught(tenant, instructor, sprint, day, count=12)

    invoice = generate_invoice_for_instructor(
        instructor, day - timedelta(days=1), day + timedelta(days=1)
    )
    assert invoice.total_amount == expected


def test_a_rate_change_mid_period_applies_from_its_day(
    tenant, instructor, sprint, pay_rate
):
    # A class rate that starts partway through the pay period used to be
    # ignored for the whole period, because rates were looked up for the
    # period's first day.
    start = date.today() - timedelta(days=10)
    _taught(
        tenant, instructor, sprint, start + timedelta(days=1), count=10
    )  # default $50
    _taught(
        tenant, instructor, sprint, start + timedelta(days=6), count=10
    )  # new rate $70
    set_class_rate(
        instructor,
        sprint.id,
        rate_type="per_class",
        amount=Decimal("70"),
        per_head_rate=Decimal("0"),
        effective_from=start + timedelta(days=5),
    )

    invoice = generate_invoice_for_instructor(
        instructor, start, start + timedelta(days=8)
    )
    assert sorted(li.amount for li in invoice.line_items.all()) == [
        Decimal("50"),
        Decimal("70"),
    ]


def test_saving_rates_reprices_drafts_but_not_submitted_invoices(
    tenant, admin_user, instructor, sprint, teaches_sprint, pay_rate
):
    day = date.today() - timedelta(days=3)
    _taught(tenant, instructor, sprint, day, count=10)
    draft = generate_invoice_for_instructor(
        instructor, day - timedelta(days=1), day + timedelta(days=1)
    )
    submitted = generate_invoice_for_instructor(
        instructor, day - timedelta(days=2), day + timedelta(days=2)
    )
    Invoice.objects.filter(pk=submitted.pk).update(status=Invoice.Status.SUBMITTED)
    assert draft.total_amount == Decimal("50")

    response = _post(
        admin_user,
        tenant,
        instructor,
        {
            "effective_from": (day - timedelta(days=7)).isoformat(),
            "rates": [
                {"class_type": sprint.id, "rate_type": "per_class", "amount": "65"}
            ],
        },
    )

    assert response.data["drafts_repriced"] == 1
    draft.refresh_from_db()
    submitted.refresh_from_db()
    assert draft.total_amount == Decimal("65")
    assert submitted.total_amount == Decimal("50")


def test_each_instructor_is_paid_their_own_rate(
    tenant, instructor, instructor_b, sprint
):
    # Cover: the class goes on the invoice of whoever taught it, at their rate.
    day = date.today() - timedelta(days=3)
    StaffPayRateFactory(
        tenant=tenant,
        staff=instructor_b,
        rate_type="per_class",
        amount=Decimal("30"),
        effective_from=day - timedelta(days=60),
    )
    set_class_rate(
        instructor,
        sprint.id,
        rate_type="per_class",
        amount=Decimal("45"),
        per_head_rate=Decimal("0"),
        effective_from=day - timedelta(days=30),
    )
    set_class_rate(
        instructor_b,
        sprint.id,
        rate_type="per_class",
        amount=Decimal("55"),
        per_head_rate=Decimal("0"),
        effective_from=day - timedelta(days=30),
    )
    _taught(tenant, instructor_b, sprint, day, count=8)

    period = (day - timedelta(days=1), day + timedelta(days=1))
    assert generate_invoice_for_instructor(instructor, *period).total_amount == Decimal(
        "0"
    )
    assert generate_invoice_for_instructor(
        instructor_b, *period
    ).total_amount == Decimal("55")


def test_a_default_per_head_rate_reaches_the_invoice(tenant, instructor, sprint):
    # Not only class rates: a per-head default pay rate also came out as $0,
    # because the invoice line kept the base rate and recalculated its amount
    # from it.
    day = date.today() - timedelta(days=3)
    StaffPayRateFactory(
        tenant=tenant,
        staff=instructor,
        rate_type="per_head",
        amount=Decimal("0"),
        per_head_rate=Decimal("2.50"),
        effective_from=day - timedelta(days=60),
    )
    _taught(tenant, instructor, sprint, day, count=10)

    invoice = generate_invoice_for_instructor(
        instructor, day - timedelta(days=1), day + timedelta(days=1)
    )
    assert invoice.total_amount == Decimal("25")
