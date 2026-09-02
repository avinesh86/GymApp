"""Serialising a cancelled cover request, and auditing unauthenticated actions."""

import pytest
from django.utils import timezone

from apps.core.audit import log_audit
from apps.cover.models import CoverRequest
from apps.cover.serializers import CoverRequestSerializer
from apps.cover.state import transition
from tests.factories import TenantFactory, TimetableEventFactory, UserFactory


def make_cover_request(tenant, **kwargs):
    """A minimal cover request — there is no factory for these yet."""
    return CoverRequest.objects.create(
        tenant=tenant,
        timetable_event=TimetableEventFactory(tenant=tenant),
        status=kwargs.pop("status", CoverRequest.Status.OPEN),
        **kwargs,
    )


@pytest.fixture
def cancelled_request(db):
    tenant = TenantFactory(slug="cancel-gym")
    actor = UserFactory(tenant=tenant, role="admin", first_name="Ada", last_name="Byron")
    cover_request = make_cover_request(tenant)
    transition(
        cover_request,
        CoverRequest.Status.CANCELLED,
        actor,
        extra_fields={
            "cancellation_reason": "test",
            "cancelled_at": timezone.now(),
            "cancelled_by": actor,
        },
    )
    return cover_request


def test_a_cancelled_request_serialises(cancelled_request):
    """get_cancelled_by_name called get_full_name()/username, neither of which
    users.User has — so any cancelled request 500'd the whole cover list."""
    data = CoverRequestSerializer(cancelled_request).data

    assert data["status"] == "cancelled"
    assert data["cancellation_reason"] == "test"
    assert data["cancelled_by_name"] == "Ada Byron"


def test_cancelled_by_name_falls_back_to_the_email(db):
    tenant = TenantFactory(slug="cancel-gym-2")
    actor = UserFactory(
        tenant=tenant, role="admin", first_name="", last_name="", email="ops@example.com"
    )
    cover_request = make_cover_request(tenant)
    transition(
        cover_request,
        CoverRequest.Status.CANCELLED,
        actor,
        extra_fields={"cancelled_by": actor, "cancelled_at": timezone.now()},
    )

    assert CoverRequestSerializer(cover_request).data["cancelled_by_name"] == "ops@example.com"


def test_an_uncancelled_request_reports_no_canceller(db):
    tenant = TenantFactory(slug="cancel-gym-3")
    cover_request = make_cover_request(tenant)

    assert CoverRequestSerializer(cover_request).data["cancelled_by_name"] is None


def test_audit_attributes_an_anonymous_action_to_the_object_tenant(db):
    """Accepting cover from an emailed link has no authenticated user, and
    log_audit read user.tenant unconditionally."""
    from apps.audit.models import AuditLog

    tenant = TenantFactory(slug="audit-gym")
    cover_request = make_cover_request(tenant)

    log_audit(None, "cover_request.accepted", cover_request)

    entry = AuditLog.objects.get(action="cover_request.accepted")
    assert entry.tenant == tenant
    assert entry.user is None
