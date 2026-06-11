"""
Tests for the cover-workflow redesign: state machine, auto urgency, eligibility
hard-gate, approval gate + dispatch modes, accept enrichment (SUB retention),
PA-safe scheduler (critical + escalation), and instructor self-service.
"""
from datetime import time, timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.cover.models import CoverOffer, CoverRequest
from apps.cover import services
from apps.cover.state import InvalidTransition, transition
from apps.cover.tasks import advance_cover_requests
from apps.cover.views import CoverRequestViewSet
from apps.staff.models import StaffAvailability, StaffClassTypeCapability, StaffProfile
from apps.timetable.models import TimetableEvent
from tests.factories import (
    ClassTypeFactory,
    StaffProfileFactory,
    TenantSettingsFactory,
    TimetableEventFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db
S = CoverRequest.Status


def _capable(tenant, staff, class_type, event, *, tier=1):
    StaffClassTypeCapability.objects.create(
        tenant=tenant, staff=staff, class_type=class_type, is_active=True
    )
    StaffAvailability.objects.create(
        tenant=tenant, staff=staff, day_of_week=event.start_datetime.weekday(),
        start_time=time(0, 0), end_time=time(23, 59), is_available=True,
    )


def _event(tenant, class_type, instructor, *, hours_ahead=48):
    start = timezone.now() + timedelta(hours=hours_ahead)
    return TimetableEventFactory(
        tenant=tenant, class_type=class_type, instructor=instructor,
        start_datetime=start, end_datetime=start + timedelta(hours=1), status="scheduled",
    )


def _create_view(tenant, user, data):
    request = APIRequestFactory().post("/api/v1/cover/requests/", data, format="json")
    force_authenticate(request, user=user)
    request.tenant = tenant
    return CoverRequestViewSet.as_view({"post": "create"})(request)


# ─── State machine ──────────────────────────────────────────────────────────

class TestStateMachine:
    def test_valid_transition(self, tenant, class_type, instructor, admin_user):
        cr = services.create_cover_request(_event(tenant, class_type, instructor), None, admin_user)
        transition(cr, S.OFFERED, admin_user)
        cr.refresh_from_db()
        assert cr.status == S.OFFERED

    def test_invalid_transition_raises(self, tenant, class_type, instructor, admin_user):
        cr = services.create_cover_request(_event(tenant, class_type, instructor), None, admin_user)
        transition(cr, S.ACCEPTED, admin_user)
        with pytest.raises(InvalidTransition):
            transition(cr, S.OFFERED, admin_user)  # ACCEPTED is terminal


# ─── Auto urgency ────────────────────────────────────────────────────────────

class TestAutoUrgency:
    def test_critical_when_close(self, tenant, class_type, instructor, admin_user):
        TenantSettingsFactory(tenant=tenant, cover_critical_threshold_hours=4)
        cr = services.create_cover_request(_event(tenant, class_type, instructor, hours_ahead=2), None, admin_user)
        assert cr.urgency == CoverRequest.Urgency.CRITICAL

    def test_low_when_far(self, tenant, class_type, instructor, admin_user):
        TenantSettingsFactory(tenant=tenant, cover_critical_threshold_hours=4)
        cr = services.create_cover_request(_event(tenant, class_type, instructor, hours_ahead=240), None, admin_user)
        assert cr.urgency == CoverRequest.Urgency.LOW


# ─── Eligibility hard gate ───────────────────────────────────────────────────

class TestEligibilityGate:
    def test_unqualified_excluded_from_offers(self, tenant, class_type, instructor, admin_user):
        event = _event(tenant, class_type, instructor)
        unqualified = StaffProfileFactory(tenant=tenant, role="instructor", email="u@t.com")
        # availability only, no capability
        StaffAvailability.objects.create(
            tenant=tenant, staff=unqualified, day_of_week=event.start_datetime.weekday(),
            start_time=time(0, 0), end_time=time(23, 59), is_available=True,
        )
        cr = services.create_cover_request(event, None, admin_user)
        offers = services.send_cover_offers(cr, created_by=admin_user, tier=1)
        assert offers == []  # nobody qualified

    def test_qualified_included(self, tenant, class_type, instructor, admin_user):
        event = _event(tenant, class_type, instructor)
        cover = StaffProfileFactory(tenant=tenant, role="instructor", email="c@t.com", priority_tier=1)
        _capable(tenant, cover, class_type, event)
        cr = services.create_cover_request(event, None, admin_user)
        offers = services.send_cover_offers(cr, created_by=admin_user, tier=1)
        assert [o.staff_id for o in offers] == [cover.pk]


# ─── Approval gate + dispatch modes ──────────────────────────────────────────

class TestApprovalGate:
    def test_gated_tenant_creates_pending(self, tenant, class_type, instructor, manager_user):
        TenantSettingsFactory(tenant=tenant, cover_auto_dispatch=False)
        event = _event(tenant, class_type, instructor)
        cover = StaffProfileFactory(tenant=tenant, role="instructor", email="c@t.com")
        _capable(tenant, cover, class_type, event)

        resp = _create_view(tenant, manager_user, {"timetable_event": event.id})
        assert resp.status_code == 201
        cr = CoverRequest.objects.get(timetable_event=event)
        assert cr.status == S.PENDING_APPROVAL
        assert cr.offers.count() == 0  # no offers until approved

    def test_approve_opens_and_dispatches(self, tenant, class_type, instructor, manager_user):
        TenantSettingsFactory(tenant=tenant, cover_auto_dispatch=False)
        event = _event(tenant, class_type, instructor)
        cover = StaffProfileFactory(tenant=tenant, role="instructor", email="c@t.com")
        _capable(tenant, cover, class_type, event)
        _create_view(tenant, manager_user, {"timetable_event": event.id})
        cr = CoverRequest.objects.get(timetable_event=event)

        services.approve_cover_request(cr, manager_user)
        cr.refresh_from_db()
        assert cr.status == S.OFFERED
        assert cr.approved_by_id == manager_user.id
        assert cr.offers.count() == 1

    def test_deny_sets_denied(self, tenant, class_type, instructor, manager_user):
        TenantSettingsFactory(tenant=tenant, cover_auto_dispatch=False)
        event = _event(tenant, class_type, instructor)
        _create_view(tenant, manager_user, {"timetable_event": event.id})
        cr = CoverRequest.objects.get(timetable_event=event)

        services.deny_cover_request(cr, manager_user, reason="Instructor will teach after all")
        cr.refresh_from_db()
        assert cr.status == S.DENIED

    def test_auto_dispatch_tenant_opens_and_offers(self, tenant, class_type, instructor, manager_user):
        TenantSettingsFactory(tenant=tenant, cover_auto_dispatch=True)
        event = _event(tenant, class_type, instructor)
        cover = StaffProfileFactory(tenant=tenant, role="instructor", email="c@t.com")
        _capable(tenant, cover, class_type, event)

        _create_view(tenant, manager_user, {"timetable_event": event.id})
        cr = CoverRequest.objects.get(timetable_event=event)
        assert cr.status == S.OFFERED
        assert cr.offers.count() == 1


# ─── Accept enrichment ───────────────────────────────────────────────────────

class TestAcceptEnrichment:
    def test_retains_original_and_records_acceptance(self, tenant, class_type, instructor, manager_user):
        event = _event(tenant, class_type, instructor)
        cover = StaffProfileFactory(tenant=tenant, role="instructor", email="c@t.com")
        _capable(tenant, cover, class_type, event)
        cr = services.create_cover_request(event, None, manager_user)
        offers = services.send_cover_offers(cr, created_by=manager_user, tier=1)

        services.accept_cover_offer(offers[0], accepted_by=manager_user)

        event.refresh_from_db()
        cr.refresh_from_db()
        assert event.original_instructor_id == instructor.pk  # SUB retained
        assert event.instructor_id == cover.pk
        assert cr.status == S.ACCEPTED
        assert cr.accepted_by_id == cover.pk
        assert cr.accepted_at is not None


# ─── PA-safe scheduler ───────────────────────────────────────────────────────

class TestAdvanceCoverRequests:
    def test_marks_critical_once(self, tenant, class_type, instructor, admin_user):
        TenantSettingsFactory(tenant=tenant, cover_critical_threshold_hours=4)
        event = _event(tenant, class_type, instructor, hours_ahead=2)
        cover = StaffProfileFactory(tenant=tenant, role="instructor", email="c@t.com")
        _capable(tenant, cover, class_type, event)
        cr = services.create_cover_request(event, None, admin_user, urgency=CoverRequest.Urgency.HIGH)
        services.send_cover_offers(cr, created_by=admin_user, tier=1)  # OFFERED

        advance_cover_requests()
        cr.refresh_from_db()
        assert cr.status == S.CRITICAL
        assert cr.critical_notified_at is not None

        first = cr.critical_notified_at
        advance_cover_requests()  # idempotent — does not re-fire
        cr.refresh_from_db()
        assert cr.critical_notified_at == first

    def test_escalates_to_next_tier_when_exhausted(self, tenant, class_type, instructor, admin_user):
        event = _event(tenant, class_type, instructor)
        t1 = StaffProfileFactory(tenant=tenant, role="instructor", email="t1@t.com", priority_tier=1)
        t2 = StaffProfileFactory(tenant=tenant, role="instructor", email="t2@t.com", priority_tier=2)
        _capable(tenant, t1, class_type, event)
        _capable(tenant, t2, class_type, event)
        cr = services.create_cover_request(event, None, admin_user)
        services.send_cover_offers(cr, created_by=admin_user, tier=1)  # offers t1

        # Tier-1 offer declines/expires.
        CoverOffer.objects.filter(cover_request=cr).update(status=CoverOffer.Status.EXPIRED)

        advance_cover_requests()
        offered_ids = set(CoverOffer.objects.filter(cover_request=cr).values_list("staff_id", flat=True))
        assert t2.pk in offered_ids  # escalated to tier 2


# ─── Instructor self-service ─────────────────────────────────────────────────

class TestInstructorSelfService:
    def test_instructor_can_request_own_class(self, tenant, class_type):
        user = UserFactory(tenant=tenant, role="instructor")
        me = StaffProfileFactory(tenant=tenant, role="instructor", email="me@t.com", user=user)
        event = _event(tenant, class_type, me)

        resp = _create_view(tenant, user, {"timetable_event": event.id})
        assert resp.status_code == 201
        assert CoverRequest.objects.filter(timetable_event=event).exists()

    def test_instructor_cannot_request_others_class(self, tenant, class_type, instructor):
        user = UserFactory(tenant=tenant, role="instructor")
        StaffProfileFactory(tenant=tenant, role="instructor", email="me@t.com", user=user)
        other_event = _event(tenant, class_type, instructor)  # someone else's class

        resp = _create_view(tenant, user, {"timetable_event": other_event.id})
        assert resp.status_code == 403
        assert not CoverRequest.objects.filter(timetable_event=other_event).exists()


# ─── Candidates endpoint ─────────────────────────────────────────────────────

class TestInstructorTimetableAccess:
    """My Calendar: instructors can read their own classes + cover opportunities,
    but not the whole timetable, and cannot mutate."""

    def _list(self, tenant, user, **params):
        from apps.timetable.views import TimetableEventViewSet

        request = APIRequestFactory().get("/api/v1/timetable/events/", params)
        force_authenticate(request, user=user)
        request.tenant = tenant
        resp = TimetableEventViewSet.as_view({"get": "list"})(request)
        resp.render()
        return resp

    def _ids(self, resp):
        rows = resp.data["results"] if isinstance(resp.data, dict) else resp.data
        return {r["id"] for r in rows}

    def test_instructor_sees_own_and_cover_not_others(self, tenant, class_type, instructor):
        user = UserFactory(tenant=tenant, role="instructor")
        me = StaffProfileFactory(tenant=tenant, role="instructor", email="me@t.com", user=user)

        mine = _event(tenant, class_type, me)
        others = _event(tenant, class_type, instructor)  # someone else's scheduled class
        cover = _event(tenant, class_type, instructor)
        cover.status = "needs_cover"
        cover.save(update_fields=["status"])

        resp = self._list(tenant, user)
        assert resp.status_code == 200
        ids = self._ids(resp)
        assert mine.id in ids          # own class
        assert cover.id in ids         # cover opportunity
        assert others.id not in ids    # not other people's classes

    def test_instructor_cannot_create_event(self, tenant, class_type):
        from apps.timetable.views import TimetableEventViewSet

        user = UserFactory(tenant=tenant, role="instructor")
        request = APIRequestFactory().post("/api/v1/timetable/events/", {}, format="json")
        force_authenticate(request, user=user)
        request.tenant = tenant
        resp = TimetableEventViewSet.as_view({"post": "create"})(request)
        assert resp.status_code == 403


class TestCandidatesEndpoint:
    def test_returns_tiered_eligible(self, tenant, class_type, instructor, manager_user):
        event = _event(tenant, class_type, instructor)
        cover = StaffProfileFactory(tenant=tenant, role="instructor", email="c@t.com", priority_tier=1)
        _capable(tenant, cover, class_type, event)
        cr = services.create_cover_request(event, None, manager_user)

        request = APIRequestFactory().get(f"/api/v1/cover/requests/{cr.id}/candidates/")
        force_authenticate(request, user=manager_user)
        request.tenant = tenant
        resp = CoverRequestViewSet.as_view({"get": "candidates"})(request, pk=cr.id)

        assert resp.status_code == 200
        tier1 = resp.data.get("1", [])
        assert any(c["staff_id"] == cover.pk for c in tier1)
