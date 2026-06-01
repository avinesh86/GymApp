"""
Tests for the cover offer accept-by-code endpoint.
"""

import pytest
from django.utils import timezone
from datetime import timedelta

from apps.cover.models import CoverOffer, CoverRequest
from apps.cover.services import create_cover_request
from tests.factories import (
    ClassTypeFactory,
    StaffProfileFactory,
    TenantDomainFactory,
    TenantFactory,
    TimetableEventFactory,
    UserFactory,
)


@pytest.fixture
def cover_setup(db):
    """Set up tenant, user, event, and a cover request with a pending offer."""
    tenant = TenantFactory(slug="cover-test")
    TenantDomainFactory(tenant=tenant, domain="cover-test.localhost")
    admin = UserFactory(tenant=tenant, role="admin")
    class_type = ClassTypeFactory(tenant=tenant, name="Boxing")
    instructor = StaffProfileFactory(tenant=tenant, name="Cover Instructor")

    start = timezone.now() + timedelta(days=1)
    event = TimetableEventFactory(
        tenant=tenant,
        class_type=class_type,
        instructor=instructor,
        start_datetime=start,
        end_datetime=start + timedelta(hours=1),
    )

    cover_request = create_cover_request(
        timetable_event=event,
        absence=None,
        created_by=admin,
    )

    offer = CoverOffer.objects.create(
        tenant=tenant,
        cover_request=cover_request,
        staff=instructor,
        status=CoverOffer.Status.PENDING,
        accept_code="TESTCODE1",
        created_by=admin,
        updated_by=admin,
    )

    return {
        "tenant": tenant,
        "admin": admin,
        "offer": offer,
        "cover_request": cover_request,
    }


class TestAcceptByCode:
    """Tests for accept_cover_offer and is_deleted filtering."""

    def test_accept_valid_code(self, cover_setup):
        from apps.cover.services import accept_cover_offer

        offer = cover_setup["offer"]
        accept_cover_offer(offer, accepted_by=None, ip_address="127.0.0.1")

        offer.refresh_from_db()
        assert offer.status == CoverOffer.Status.ACCEPTED

    def test_accepted_offer_updates_cover_request_status(self, cover_setup):
        from apps.cover.services import accept_cover_offer

        offer = cover_setup["offer"]
        accept_cover_offer(offer, accepted_by=None, ip_address="127.0.0.1")

        cover_request = cover_setup["cover_request"]
        cover_request.refresh_from_db()
        assert cover_request.status == CoverRequest.Status.ACCEPTED

    def test_soft_deleted_offer_not_found(self, cover_setup):
        """A soft-deleted offer should not be resolvable by accept_code."""
        offer = cover_setup["offer"]
        offer.is_deleted = True
        offer.save(update_fields=["is_deleted"])

        qs = CoverOffer.objects.filter(
            accept_code="TESTCODE1",
            status=CoverOffer.Status.PENDING,
            is_deleted=False,
        )
        assert not qs.exists()

    def test_already_accepted_offer_not_found(self, cover_setup):
        """An already-accepted offer should not match PENDING status."""
        offer = cover_setup["offer"]
        offer.status = CoverOffer.Status.ACCEPTED
        offer.save(update_fields=["status"])

        qs = CoverOffer.objects.filter(
            accept_code="TESTCODE1",
            status=CoverOffer.Status.PENDING,
            is_deleted=False,
        )
        assert not qs.exists()

    def test_wrong_code_not_found(self, cover_setup):
        qs = CoverOffer.objects.filter(
            accept_code="WRONGCODE",
            status=CoverOffer.Status.PENDING,
            is_deleted=False,
        )
        assert not qs.exists()
