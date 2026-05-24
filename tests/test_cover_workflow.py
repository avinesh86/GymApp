"""
End-to-end tests for the cover request workflow.
"""

from datetime import date, time, timedelta

from django.test import TestCase
from django.utils import timezone

from tests.factories import (
    ClassTypeFactory,
    StaffProfileFactory,
    TenantDomainFactory,
    TenantFactory,
    TimetableEventFactory,
    UserFactory,
)


class CoverWorkflowTest(TestCase):
    def setUp(self):
        self.tenant = TenantFactory()
        TenantDomainFactory(tenant=self.tenant, domain="cover-test.localhost")
        self.manager_user = UserFactory(tenant=self.tenant, role="gym_manager")
        self.class_type = ClassTypeFactory(tenant=self.tenant)

        self.instructor_a = StaffProfileFactory(
            tenant=self.tenant, name="Instructor A", email="a@test.com"
        )
        self.instructor_b = StaffProfileFactory(
            tenant=self.tenant, name="Instructor B", email="b@test.com"
        )

        start = timezone.now() + timedelta(days=1)
        self.event = TimetableEventFactory(
            tenant=self.tenant,
            class_type=self.class_type,
            instructor=self.instructor_a,
            start_datetime=start,
            end_datetime=start + timedelta(hours=1),
            status="scheduled",
        )

        # Give instructor_b the capability and availability
        from apps.staff.models import StaffAvailability, StaffClassTypeCapability

        StaffClassTypeCapability.objects.create(
            tenant=self.tenant,
            staff=self.instructor_b,
            class_type=self.class_type,
            is_active=True,
            created_by=self.manager_user,
            updated_by=self.manager_user,
        )
        StaffAvailability.objects.create(
            tenant=self.tenant,
            staff=self.instructor_b,
            day_of_week=start.weekday(),
            start_time=time(0, 0),
            end_time=time(23, 59),
            is_available=True,
            created_by=self.manager_user,
            updated_by=self.manager_user,
        )

    def test_create_cover_request(self):
        from apps.cover.models import CoverRequest
        from apps.cover.services import create_cover_request
        from apps.timetable.models import TimetableEvent

        cover_request = create_cover_request(
            timetable_event=self.event,
            absence=None,
            created_by=self.manager_user,
            urgency=CoverRequest.Urgency.HIGH,
        )

        self.assertEqual(cover_request.status, CoverRequest.Status.OPEN)
        self.event.refresh_from_db()
        self.assertEqual(self.event.status, TimetableEvent.Status.NEEDS_COVER)

    def test_find_eligible_instructors(self):
        from apps.cover.models import CoverRequest
        from apps.cover.services import create_cover_request, find_eligible_instructors

        cover_request = create_cover_request(
            timetable_event=self.event,
            absence=None,
            created_by=self.manager_user,
        )

        # instructor_a is absent (original instructor), instructor_b should be found
        eligible = find_eligible_instructors(cover_request)
        eligible_ids = [s.pk for s in eligible]
        self.assertIn(self.instructor_b.pk, eligible_ids)

    def test_send_cover_offers(self):
        from apps.cover.models import CoverOffer, CoverRequest
        from apps.cover.services import create_cover_request, send_cover_offers

        cover_request = create_cover_request(
            timetable_event=self.event,
            absence=None,
            created_by=self.manager_user,
        )
        offers = send_cover_offers(cover_request, created_by=self.manager_user)

        self.assertGreater(len(offers), 0)
        cover_request.refresh_from_db()
        self.assertEqual(cover_request.status, CoverRequest.Status.OFFERED)

        for offer in offers:
            self.assertEqual(offer.status, CoverOffer.Status.PENDING)

    def test_accept_cover_offer(self):
        from apps.cover.models import CoverOffer, CoverRequest
        from apps.cover.services import accept_cover_offer, create_cover_request, send_cover_offers
        from apps.timetable.models import TimetableEvent

        cover_request = create_cover_request(
            timetable_event=self.event,
            absence=None,
            created_by=self.manager_user,
        )
        offers = send_cover_offers(cover_request, created_by=self.manager_user)
        self.assertGreater(len(offers), 0)

        offer_to_accept = offers[0]
        accepted = accept_cover_offer(offer_to_accept, accepted_by=self.manager_user)

        self.assertEqual(accepted.status, CoverOffer.Status.ACCEPTED)
        cover_request.refresh_from_db()
        self.assertEqual(cover_request.status, CoverRequest.Status.ACCEPTED)

        self.event.refresh_from_db()
        self.assertEqual(self.event.status, TimetableEvent.Status.SCHEDULED)
        self.assertEqual(self.event.instructor, offer_to_accept.staff)

    def test_other_offers_expired_after_acceptance(self):
        from apps.cover.models import CoverOffer
        from apps.cover.services import accept_cover_offer, create_cover_request, send_cover_offers

        # Create a second eligible instructor
        instructor_c = StaffProfileFactory(
            tenant=self.tenant, name="Instructor C", email="c@test.com"
        )
        from apps.staff.models import StaffAvailability, StaffClassTypeCapability

        StaffClassTypeCapability.objects.create(
            tenant=self.tenant,
            staff=instructor_c,
            class_type=self.class_type,
            is_active=True,
            created_by=self.manager_user,
            updated_by=self.manager_user,
        )
        start = self.event.start_datetime
        StaffAvailability.objects.create(
            tenant=self.tenant,
            staff=instructor_c,
            day_of_week=start.weekday(),
            start_time=time(0, 0),
            end_time=time(23, 59),
            is_available=True,
            created_by=self.manager_user,
            updated_by=self.manager_user,
        )

        cover_request = create_cover_request(
            timetable_event=self.event,
            absence=None,
            created_by=self.manager_user,
        )
        offers = send_cover_offers(cover_request, created_by=self.manager_user)

        if len(offers) >= 2:
            accepted = accept_cover_offer(offers[0], accepted_by=self.manager_user)
            remaining = CoverOffer.objects.filter(
                cover_request=cover_request,
                status=CoverOffer.Status.PENDING,
            )
            self.assertEqual(remaining.count(), 0)

    def test_accept_already_accepted_offer_raises(self):
        from apps.cover.models import CoverOffer
        from apps.cover.services import accept_cover_offer, create_cover_request, send_cover_offers

        cover_request = create_cover_request(
            timetable_event=self.event,
            absence=None,
            created_by=self.manager_user,
        )
        offers = send_cover_offers(cover_request, created_by=self.manager_user)

        if offers:
            accept_cover_offer(offers[0], accepted_by=self.manager_user)
            with self.assertRaises(ValueError):
                accept_cover_offer(offers[0], accepted_by=self.manager_user)
