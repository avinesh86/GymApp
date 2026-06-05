"""Membership model: a user belongs to one-or-more gyms with a per-gym role."""

import pytest

from apps.users.models import Membership
from tests.factories import MembershipFactory, TenantFactory, UserFactory

pytestmark = pytest.mark.django_db


def test_userfactory_creates_matching_membership(tenant):
    user = UserFactory(tenant=tenant, role="gym_manager")

    membership = user.memberships.get(tenant=tenant)
    assert membership.role == "gym_manager"
    assert membership.is_active


def test_membership_for_returns_active_membership(tenant, other_tenant):
    user = UserFactory(tenant=tenant, role="owner")
    MembershipFactory(user=user, tenant=other_tenant, role="instructor")

    assert user.membership_for(tenant).role == "owner"
    assert user.membership_for(other_tenant).role == "instructor"


def test_membership_for_ignores_inactive(tenant):
    user = UserFactory(tenant=tenant, role="admin")
    user.memberships.update(is_active=False)

    assert user.membership_for(tenant) is None


def test_user_can_belong_to_multiple_gyms(tenant, other_tenant):
    user = UserFactory(tenant=tenant, role="owner")
    MembershipFactory(user=user, tenant=other_tenant, role="payroll")

    gyms = {m.tenant_id: m.role for m in user.memberships.all()}
    assert gyms == {tenant.id: "owner", other_tenant.id: "payroll"}


def test_membership_unique_per_user_tenant(tenant):
    user = UserFactory(tenant=tenant, role="owner")
    with pytest.raises(Exception):
        Membership.objects.create(user=user, tenant=tenant, role="admin")
