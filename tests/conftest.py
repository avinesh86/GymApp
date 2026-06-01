"""
Shared pytest fixtures for the FitOps test suite.
"""

from datetime import date, time, timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from tests.factories import (
    ClassTypeFactory,
    StaffPayRateFactory,
    StaffProfileFactory,
    TenantDomainFactory,
    TenantFactory,
    TimetableEventFactory,
    UserFactory,
)


@pytest.fixture
def tenant(db):
    t = TenantFactory(slug="test-tenant")
    TenantDomainFactory(tenant=t, domain="test.localhost")
    return t


@pytest.fixture
def other_tenant(db):
    t = TenantFactory(slug="other-tenant")
    TenantDomainFactory(tenant=t, domain="other.localhost")
    return t


@pytest.fixture
def admin_user(tenant):
    return UserFactory(tenant=tenant, role="admin")


@pytest.fixture
def owner_user(tenant):
    return UserFactory(tenant=tenant, role="owner")


@pytest.fixture
def manager_user(tenant):
    return UserFactory(tenant=tenant, role="gym_manager")


@pytest.fixture
def payroll_user(tenant):
    return UserFactory(tenant=tenant, role="payroll")


@pytest.fixture
def team_leader_user(tenant):
    return UserFactory(tenant=tenant, role="team_leader")


@pytest.fixture
def instructor_user(tenant):
    return UserFactory(tenant=tenant, role="instructor")


@pytest.fixture
def class_count_admin_user(tenant):
    return UserFactory(tenant=tenant, role="class_count_admin")


@pytest.fixture
def class_type(tenant):
    return ClassTypeFactory(
        tenant=tenant,
        name="Yoga",
        duration_minutes=60,
        red_threshold=3,
        amber_threshold=6,
        green_threshold=10,
        purple_threshold=20,
    )


@pytest.fixture
def instructor(tenant):
    return StaffProfileFactory(
        tenant=tenant,
        name="Test Instructor",
        email="instructor@test.com",
        role="instructor",
    )


@pytest.fixture
def instructor_b(tenant):
    return StaffProfileFactory(
        tenant=tenant,
        name="Instructor B",
        email="instructor-b@test.com",
        role="instructor",
    )


@pytest.fixture
def pay_rate(tenant, instructor):
    return StaffPayRateFactory(
        tenant=tenant,
        staff=instructor,
        rate_type="per_class",
        amount=Decimal("50.00"),
        effective_from=date.today() - timedelta(days=30),
    )


@pytest.fixture
def future_event(tenant, class_type, instructor):
    start = timezone.now() + timedelta(days=1)
    return TimetableEventFactory(
        tenant=tenant,
        class_type=class_type,
        instructor=instructor,
        start_datetime=start,
        end_datetime=start + timedelta(hours=1),
        status="scheduled",
    )


@pytest.fixture
def past_event(tenant, class_type, instructor):
    start = timezone.now() - timedelta(hours=3)
    return TimetableEventFactory(
        tenant=tenant,
        class_type=class_type,
        instructor=instructor,
        start_datetime=start,
        end_datetime=start + timedelta(hours=1),
        status="scheduled",
    )


@pytest.fixture
def completed_event(tenant, class_type, instructor):
    start = timezone.now() - timedelta(hours=3)
    return TimetableEventFactory(
        tenant=tenant,
        class_type=class_type,
        instructor=instructor,
        start_datetime=start,
        end_datetime=start + timedelta(hours=1),
        status="completed",
    )


@pytest.fixture
def mock_request(tenant, admin_user):
    """Returns a factory function for creating mock requests."""

    def _make(user=None, t=None):
        class MockRequest:
            pass

        request = MockRequest()
        request.user = user or admin_user
        request.tenant = t or tenant
        return request

    return _make
