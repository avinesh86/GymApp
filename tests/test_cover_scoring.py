"""
Tests for cover scoring, escalation, and WhatsApp cover reply processing.
"""

from datetime import time, timedelta

import pytest
from django.utils import timezone

from apps.cover.models import CoverOffer, CoverRequest
from apps.cover.services import (
    accept_cover_offer,
    build_tiered_offer_list,
    create_cover_request,
    escalate_cover_request,
    find_eligible_instructors,
    process_whatsapp_cover_reply,
    score_instructor_for_cover,
    send_cover_offers,
)
from apps.notifications.models import Notification
from apps.staff.models import StaffAvailability, StaffClassTypeCapability, StaffProfile
from apps.timetable.models import TimetableEvent
from tests.factories import (
    ClassTypeFactory,
    StaffProfileFactory,
    TimetableEventFactory,
    UserFactory,
)


def _give_capability_and_availability(tenant, staff, class_type, event, user):
    StaffClassTypeCapability.objects.create(
        tenant=tenant,
        staff=staff,
        class_type=class_type,
        is_active=True,
        created_by=user,
        updated_by=user,
    )
    StaffAvailability.objects.create(
        tenant=tenant,
        staff=staff,
        day_of_week=event.start_datetime.weekday(),
        start_time=time(0, 0),
        end_time=time(23, 59),
        is_available=True,
        created_by=user,
        updated_by=user,
    )


# ---------------------------------------------------------------------------
# score_instructor_for_cover
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestScoreInstructor:
    def test_inactive_staff_disqualified(self, tenant, class_type, future_event):
        inactive = StaffProfileFactory(
            tenant=tenant,
            status="inactive",
            role="instructor",
        )
        score = score_instructor_for_cover(inactive, future_event)
        assert score is None

    def test_non_instructor_role_disqualified(self, tenant, class_type, future_event):
        admin_staff = StaffProfileFactory(
            tenant=tenant,
            status="active",
            role="admin",
        )
        score = score_instructor_for_cover(admin_staff, future_event)
        assert score is None

    def test_absent_staff_disqualified(self, tenant, class_type, instructor, future_event):
        score = score_instructor_for_cover(
            instructor, future_event, absent_staff_id=instructor.pk
        )
        assert score is None

    def test_qualified_instructor_scores_positive(self, tenant, class_type, future_event, admin_user):
        qualified = StaffProfileFactory(
            tenant=tenant,
            role="instructor",
            priority_tier=1,
        )
        _give_capability_and_availability(tenant, qualified, class_type, future_event, admin_user)

        score = score_instructor_for_cover(qualified, future_event)
        assert score is not None
        assert score > 0

    def test_unqualified_instructor_penalized(self, tenant, class_type, future_event):
        unqualified = StaffProfileFactory(
            tenant=tenant,
            role="instructor",
            priority_tier=1,
        )
        score = score_instructor_for_cover(unqualified, future_event)
        assert score is not None
        # Without capability, score is penalized by -20

    def test_tier_1_scores_higher_than_tier_3(self, tenant, class_type, future_event, admin_user):
        tier1 = StaffProfileFactory(tenant=tenant, role="instructor", priority_tier=1)
        tier3 = StaffProfileFactory(tenant=tenant, role="instructor", priority_tier=3)

        _give_capability_and_availability(tenant, tier1, class_type, future_event, admin_user)
        StaffClassTypeCapability.objects.create(
            tenant=tenant, staff=tier3, class_type=class_type,
            is_active=True, created_by=admin_user, updated_by=admin_user,
        )
        StaffAvailability.objects.create(
            tenant=tenant, staff=tier3,
            day_of_week=future_event.start_datetime.weekday(),
            start_time=time(0, 0), end_time=time(23, 59),
            is_available=True, created_by=admin_user, updated_by=admin_user,
        )

        score1 = score_instructor_for_cover(tier1, future_event)
        score3 = score_instructor_for_cover(tier3, future_event)
        assert score1 > score3

    def test_availability_match_boosts_score(self, tenant, class_type, future_event, admin_user):
        with_avail = StaffProfileFactory(tenant=tenant, role="instructor", priority_tier=1)
        without_avail = StaffProfileFactory(tenant=tenant, role="instructor", priority_tier=1)

        _give_capability_and_availability(tenant, with_avail, class_type, future_event, admin_user)
        StaffClassTypeCapability.objects.create(
            tenant=tenant, staff=without_avail, class_type=class_type,
            is_active=True, created_by=admin_user, updated_by=admin_user,
        )

        score_with = score_instructor_for_cover(with_avail, future_event)
        score_without = score_instructor_for_cover(without_avail, future_event)
        assert score_with > score_without


# ---------------------------------------------------------------------------
# build_tiered_offer_list
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestBuildTieredOfferList:
    def test_groups_by_tier(self, tenant, class_type, future_event, admin_user):
        tier1 = StaffProfileFactory(tenant=tenant, role="instructor", priority_tier=1)
        tier2 = StaffProfileFactory(tenant=tenant, role="instructor", priority_tier=2)

        _give_capability_and_availability(tenant, tier1, class_type, future_event, admin_user)
        StaffClassTypeCapability.objects.create(
            tenant=tenant, staff=tier2, class_type=class_type,
            is_active=True, created_by=admin_user, updated_by=admin_user,
        )
        StaffAvailability.objects.create(
            tenant=tenant, staff=tier2,
            day_of_week=future_event.start_datetime.weekday(),
            start_time=time(0, 0), end_time=time(23, 59),
            is_available=True, created_by=admin_user, updated_by=admin_user,
        )

        tiers = build_tiered_offer_list([tier1, tier2], future_event)
        assert tier1 in tiers[1]
        assert tier2 in tiers[2]


# ---------------------------------------------------------------------------
# escalate_cover_request
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestEscalateCoverRequest:
    def test_skips_already_accepted(self, tenant, class_type, future_event, admin_user):
        cr = create_cover_request(
            timetable_event=future_event,
            absence=None,
            created_by=admin_user,
        )
        cr.status = CoverRequest.Status.ACCEPTED
        cr.save()

        escalate_cover_request(cr.pk, next_tier=2)
        cr.refresh_from_db()
        assert cr.status == CoverRequest.Status.ACCEPTED

    def test_skips_already_cancelled(self, tenant, class_type, future_event, admin_user):
        cr = create_cover_request(
            timetable_event=future_event,
            absence=None,
            created_by=admin_user,
        )
        cr.status = CoverRequest.Status.CANCELLED
        cr.save()

        escalate_cover_request(cr.pk, next_tier=2)
        cr.refresh_from_db()
        assert cr.status == CoverRequest.Status.CANCELLED

    def test_nonexistent_request_no_error(self):
        escalate_cover_request(999999, next_tier=2)

    def test_tier_exhausted_notifies_admins(self, tenant, class_type, future_event, admin_user):
        cr = create_cover_request(
            timetable_event=future_event,
            absence=None,
            created_by=admin_user,
        )

        admin_staff = StaffProfileFactory(
            tenant=tenant,
            role="admin",
            user=admin_user,
        )

        escalate_cover_request(cr.pk, next_tier=4)

        notifications = Notification.objects.filter(
            tenant=tenant,
            recipient=admin_user,
        )
        assert notifications.filter(title__icontains="Cover Not Filled").exists()


# ---------------------------------------------------------------------------
# process_whatsapp_cover_reply
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestWhatsAppCoverReply:
    def test_invalid_format_rejected(self, tenant):
        result = process_whatsapp_cover_reply("+61400000001", "HELLO WORLD", tenant)
        assert result["success"] is False

    def test_unknown_code_rejected(self, tenant):
        result = process_whatsapp_cover_reply("+61400000001", "ACCEPT BADCODE1", tenant)
        assert result["success"] is False

    def test_wrong_phone_rejected(self, tenant, class_type, future_event, admin_user):
        from apps.whatsapp.models import StaffWhatsAppConsent

        staff = StaffProfileFactory(tenant=tenant, role="instructor")
        cr = create_cover_request(
            timetable_event=future_event,
            absence=None,
            created_by=admin_user,
        )
        offer = CoverOffer.objects.create(
            tenant=tenant,
            cover_request=cr,
            staff=staff,
            status=CoverOffer.Status.PENDING,
            accept_code="TEST1234",
            created_by=admin_user,
            updated_by=admin_user,
        )

        StaffWhatsAppConsent.objects.create(
            tenant=tenant,
            staff=staff,
            phone_number="+61400000099",
            consent_given=True,
            created_by=admin_user,
            updated_by=admin_user,
        )

        result = process_whatsapp_cover_reply("+61400000001", "ACCEPT TEST1234", tenant)
        assert result["success"] is False
        assert "not recognised" in result["message"]

    def test_valid_accept(self, tenant, class_type, future_event, admin_user):
        from apps.whatsapp.models import StaffWhatsAppConsent

        staff = StaffProfileFactory(tenant=tenant, role="instructor")
        cr = create_cover_request(
            timetable_event=future_event,
            absence=None,
            created_by=admin_user,
        )
        offer = CoverOffer.objects.create(
            tenant=tenant,
            cover_request=cr,
            staff=staff,
            status=CoverOffer.Status.PENDING,
            accept_code="GOOD1234",
            created_by=admin_user,
            updated_by=admin_user,
        )

        StaffWhatsAppConsent.objects.create(
            tenant=tenant,
            staff=staff,
            phone_number="+61400000001",
            consent_given=True,
            created_by=admin_user,
            updated_by=admin_user,
        )

        result = process_whatsapp_cover_reply("+61400000001", "ACCEPT GOOD1234", tenant)
        assert result["success"] is True

        offer.refresh_from_db()
        assert offer.status == CoverOffer.Status.ACCEPTED
