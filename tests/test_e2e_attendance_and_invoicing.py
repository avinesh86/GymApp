"""End-to-end journeys through the API: attendance capture and invoicing.

These drive real HTTP against real routes rather than calling services
directly. That is deliberate — the bugs that reached production were routes
the frontend called that did not exist, and no service-level test can catch
that.
"""

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.attendance.models import AttendanceRecord
from apps.timetable.models import TimetableEvent
from apps.users.models import Membership
from tests.factories import (
    ClassTypeFactory,
    SiteFactory,
    StaffProfileFactory,
    TenantDomainFactory,
    TenantFactory,
    TimetableEventFactory,
    UserFactory,
)

HOST = "e2e.localhost"


@pytest.fixture
def gym(db):
    tenant = TenantFactory(slug="e2e-gym", name="E2E Gym")
    TenantDomainFactory(tenant=tenant, domain=HOST)
    return tenant


def _client(user, tenant):
    Membership.objects.get_or_create(
        user=user, tenant=tenant, defaults={"role": user.role, "is_active": True}
    )
    client = APIClient()
    client.force_authenticate(user=user)
    client.defaults["HTTP_HOST"] = HOST
    return client


@pytest.fixture
def admin_api(gym):
    return _client(UserFactory(tenant=gym, role="admin"), gym)


@pytest.fixture
def public_api():
    """Unauthenticated — for checking what a signed-out visitor can reach."""
    client = APIClient()
    client.defaults["HTTP_HOST"] = HOST
    return client


@pytest.fixture
def instructor(gym):
    return StaffProfileFactory(tenant=gym, role="instructor", name="Casey Jordan")


@pytest.fixture
def past_class(gym, instructor):
    """A class that has finished, so attendance is due."""
    started = timezone.now() - timezone.timedelta(hours=2)
    return TimetableEventFactory(
        tenant=gym,
        class_type=ClassTypeFactory(tenant=gym, name="Aqua Fit"),
        site=SiteFactory(tenant=gym, name="Silverdale"),
        instructor=instructor,
        start_datetime=started,
        end_datetime=started + timezone.timedelta(hours=1),
        status=TimetableEvent.Status.SCHEDULED,
    )


# ─── Attendance entry ────────────────────────────────────────────────────────


def test_attendance_entry_records_a_count_and_completes_the_class(admin_api, past_class):
    response = admin_api.post(
        "/api/v1/attendance/records/submit-for-event/",
        {"event": past_class.pk, "count": 17},
        format="json",
    )

    assert response.status_code == 201, response.data
    assert response.data["count"] == 17

    record = AttendanceRecord.objects.get(timetable_event=past_class)
    assert record.count == 17
    past_class.refresh_from_db()
    assert past_class.status == TimetableEvent.Status.COMPLETED, (
        "recording attendance should close the class off"
    )


def test_resubmitting_updates_rather_than_duplicating(admin_api, past_class):
    """Managers correct miscounts; a second submission must not create a
    second record, or the class would be counted twice in reports."""
    url = "/api/v1/attendance/records/submit-for-event/"
    admin_api.post(url, {"event": past_class.pk, "count": 17}, format="json")

    second = admin_api.post(url, {"event": past_class.pk, "count": 12}, format="json")

    assert second.status_code == 200
    assert AttendanceRecord.objects.filter(timetable_event=past_class).count() == 1
    assert AttendanceRecord.objects.get(timetable_event=past_class).count == 12


def test_a_missing_count_is_rejected(admin_api, past_class):
    response = admin_api.post(
        "/api/v1/attendance/records/submit-for-event/",
        {"event": past_class.pk},
        format="json",
    )

    assert response.status_code == 400
    assert not AttendanceRecord.objects.filter(timetable_event=past_class).exists()


def test_an_unknown_event_is_rejected(admin_api):
    response = admin_api.post(
        "/api/v1/attendance/records/submit-for-event/",
        {"event": 999999, "count": 5},
        format="json",
    )

    assert response.status_code == 404


def test_the_awaiting_list_drops_a_class_once_counted(admin_api, past_class):
    awaiting = admin_api.get("/api/v1/attendance/records/?awaiting=true")
    assert awaiting.status_code == 200

    admin_api.post(
        "/api/v1/attendance/records/submit-for-event/",
        {"event": past_class.pk, "count": 9},
        format="json",
    )

    after = admin_api.get("/api/v1/attendance/records/?awaiting=true")
    rows = after.data["results"] if "results" in after.data else after.data
    assert past_class.pk not in {
        r.get("timetable_event") for r in rows
    }, "a counted class should leave the awaiting list"


# ─── QR attendance (removed) ─────────────────────────────────────────────────


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/attendance/qr-tokens/",
        "/api/v1/attendance/qr-tokens/info/",
        "/api/v1/attendance/qr-tokens/submit/",
    ],
)
def test_the_qr_attendance_routes_are_gone(path):
    """QR attendance was removed. Its submit and info routes took no login, so
    they must not linger.

    Checked against the URL table rather than by status code: where Django
    also serves the built frontend, a catch-all answers any unknown path with
    the app shell, so a 200 would not mean the API route survived.
    """
    from django.urls import Resolver404, resolve

    try:
        match = resolve(path)
    except Resolver404:
        return
    assert not match.func.__module__.startswith("apps.attendance"), (
        f"{path} is still served by the attendance app"
    )


def test_a_scanned_code_can_no_longer_record_a_count(public_api, past_class):
    response = public_api.post(
        "/api/v1/attendance/qr-tokens/submit/",
        {"token": "anything", "count": 5},
        format="json",
    )

    assert response.status_code not in (200, 201)
    assert not AttendanceRecord.objects.filter(timetable_event=past_class).exists()


def test_recording_a_count_needs_a_login(public_api, past_class):
    """With QR gone, the signed-in Attendance page is the only way in."""
    response = public_api.post(
        "/api/v1/attendance/records/submit-for-event/",
        {"event": past_class.pk, "count": 8},
        format="json",
    )

    assert response.status_code in (401, 403)
    assert not AttendanceRecord.objects.filter(timetable_event=past_class).exists()


def test_the_qr_token_table_is_dropped(db):
    from django.db import connection

    assert "attendance_qr_token" not in connection.introspection.table_names()


# ─── Invoicing ───────────────────────────────────────────────────────────────


@pytest.fixture
def payroll_api(gym):
    return _client(UserFactory(tenant=gym, role="payroll"), gym)


@pytest.fixture
def draft_invoice(gym, instructor, admin_api):
    from datetime import date

    from apps.invoices.models import Invoice

    return Invoice.objects.create(
        tenant=gym,
        instructor=instructor,
        period_start=date(2026, 8, 1),
        period_end=date(2026, 8, 14),
        status=Invoice.Status.DRAFT,
        total_amount=250,
    )


def test_invoice_moves_draft_to_paid_through_the_api(admin_api, payroll_api, draft_invoice):
    """The full approval chain, end to end over HTTP."""
    from apps.invoices.models import Invoice

    submitted = admin_api.post(f"/api/v1/invoices/{draft_invoice.pk}/submit/")
    assert submitted.status_code == 200, submitted.data
    assert submitted.data["status"] == Invoice.Status.SUBMITTED

    approved = admin_api.post(f"/api/v1/invoices/{draft_invoice.pk}/approve/", {}, format="json")
    assert approved.status_code == 200, approved.data
    assert approved.data["status"] in (
        Invoice.Status.MANAGER_APPROVED,
        Invoice.Status.PAYROLL_APPROVED,
    )

    # Both approvals are a manager's: `approve` requires IsGymManager, which
    # excludes the payroll role even for the payroll_approved step. Payroll's
    # only action is mark-paid.
    draft_invoice.refresh_from_db()
    if draft_invoice.status == Invoice.Status.MANAGER_APPROVED:
        second = admin_api.post(
            f"/api/v1/invoices/{draft_invoice.pk}/approve/", {}, format="json"
        )
        assert second.status_code == 200, second.data

    paid = payroll_api.post(
        f"/api/v1/invoices/{draft_invoice.pk}/mark-paid/",
        {"payment_reference": "TXN-001", "payment_date": "2026-08-20"},
        format="json",
    )
    assert paid.status_code == 200, paid.data
    assert paid.data["status"] == Invoice.Status.PAID

    draft_invoice.refresh_from_db()
    assert draft_invoice.status == Invoice.Status.PAID


def test_rejecting_an_invoice_requires_a_reason(admin_api, draft_invoice):
    """A rejection with no reason leaves the instructor guessing."""
    admin_api.post(f"/api/v1/invoices/{draft_invoice.pk}/submit/")

    without = admin_api.post(
        f"/api/v1/invoices/{draft_invoice.pk}/reject/", {"reason": "   "}, format="json"
    )
    assert without.status_code == 400

    with_reason = admin_api.post(
        f"/api/v1/invoices/{draft_invoice.pk}/reject/",
        {"reason": "Hours do not match the timetable"},
        format="json",
    )
    assert with_reason.status_code == 200, with_reason.data
    assert with_reason.data["status"] == "rejected"


def test_a_draft_invoice_cannot_be_marked_paid(payroll_api, draft_invoice):
    """Skipping the approval chain would put money out the door unreviewed."""
    from apps.invoices.models import Invoice

    response = payroll_api.post(
        f"/api/v1/invoices/{draft_invoice.pk}/mark-paid/",
        {"payment_reference": "TXN-002"},
        format="json",
    )

    assert response.status_code == 400
    draft_invoice.refresh_from_db()
    assert draft_invoice.status == Invoice.Status.DRAFT


def test_an_invalid_payment_date_is_rejected(payroll_api, draft_invoice):
    response = payroll_api.post(
        f"/api/v1/invoices/{draft_invoice.pk}/mark-paid/",
        {"payment_date": "20-08-2026"},
        format="json",
    )

    assert response.status_code == 400
    assert "payment_date" in response.data["detail"]


def test_invoices_are_scoped_to_the_gym(admin_api, gym, draft_invoice):
    """A manager in one gym must never see another gym's payroll."""
    from datetime import date

    from apps.invoices.models import Invoice

    other = TenantFactory(slug="other-e2e-gym")
    other_invoice = Invoice.objects.create(
        tenant=other,
        instructor=StaffProfileFactory(tenant=other, role="instructor"),
        period_start=date(2026, 8, 1),
        period_end=date(2026, 8, 14),
        status=Invoice.Status.DRAFT,
    )

    listed = admin_api.get("/api/v1/invoices/")
    rows = listed.data["results"] if "results" in listed.data else listed.data
    ids = {r["id"] for r in rows}

    assert draft_invoice.pk in ids
    assert other_invoice.pk not in ids
    assert admin_api.get(f"/api/v1/invoices/{other_invoice.pk}/").status_code == 404


def test_payroll_cannot_approve_only_pay(payroll_api, admin_api, draft_invoice):
    """Documents the current split: `approve` is IsGymManager, `mark-paid` is
    IsPayroll. Worth revisiting — the second approval sets payroll_approver
    yet the payroll role cannot perform it."""
    admin_api.post(f"/api/v1/invoices/{draft_invoice.pk}/submit/")

    response = payroll_api.post(
        f"/api/v1/invoices/{draft_invoice.pk}/approve/", {}, format="json"
    )

    assert response.status_code == 403
