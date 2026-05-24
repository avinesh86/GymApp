"""
Tests verifying that each role can/cannot access the correct endpoints.
"""

from django.test import TestCase

from tests.factories import TenantDomainFactory, TenantFactory, UserFactory


class PermissionTest(TestCase):
    def setUp(self):
        self.tenant = TenantFactory()
        TenantDomainFactory(tenant=self.tenant, domain="perm-test.localhost")

        self.users = {
            "owner": UserFactory(tenant=self.tenant, role="owner"),
            "admin": UserFactory(tenant=self.tenant, role="admin"),
            "gym_manager": UserFactory(tenant=self.tenant, role="gym_manager"),
            "payroll": UserFactory(tenant=self.tenant, role="payroll"),
            "team_leader": UserFactory(tenant=self.tenant, role="team_leader"),
            "instructor": UserFactory(tenant=self.tenant, role="instructor"),
            "class_count_admin": UserFactory(tenant=self.tenant, role="class_count_admin"),
        }

    def _make_request(self, role):
        class MockRequest:
            pass
        request = MockRequest()
        request.user = self.users[role]
        request.tenant = self.tenant
        return request

    # --- IsAdmin ---

    def test_is_admin_allows_owner(self):
        from apps.core.permissions import IsAdmin
        perm = IsAdmin()
        self.assertTrue(perm.has_permission(self._make_request("owner"), None))

    def test_is_admin_allows_admin(self):
        from apps.core.permissions import IsAdmin
        perm = IsAdmin()
        self.assertTrue(perm.has_permission(self._make_request("admin"), None))

    def test_is_admin_denies_gym_manager(self):
        from apps.core.permissions import IsAdmin
        perm = IsAdmin()
        self.assertFalse(perm.has_permission(self._make_request("gym_manager"), None))

    def test_is_admin_denies_instructor(self):
        from apps.core.permissions import IsAdmin
        perm = IsAdmin()
        self.assertFalse(perm.has_permission(self._make_request("instructor"), None))

    # --- IsGymManager ---

    def test_is_gym_manager_allows_gym_manager(self):
        from apps.core.permissions import IsGymManager
        perm = IsGymManager()
        self.assertTrue(perm.has_permission(self._make_request("gym_manager"), None))

    def test_is_gym_manager_allows_owner(self):
        from apps.core.permissions import IsGymManager
        perm = IsGymManager()
        self.assertTrue(perm.has_permission(self._make_request("owner"), None))

    def test_is_gym_manager_denies_instructor(self):
        from apps.core.permissions import IsGymManager
        perm = IsGymManager()
        self.assertFalse(perm.has_permission(self._make_request("instructor"), None))

    # --- IsPayroll ---

    def test_is_payroll_allows_payroll(self):
        from apps.core.permissions import IsPayroll
        perm = IsPayroll()
        self.assertTrue(perm.has_permission(self._make_request("payroll"), None))

    def test_is_payroll_denies_team_leader(self):
        from apps.core.permissions import IsPayroll
        perm = IsPayroll()
        self.assertFalse(perm.has_permission(self._make_request("team_leader"), None))

    # --- IsTeamLeader ---

    def test_is_team_leader_allows_team_leader(self):
        from apps.core.permissions import IsTeamLeader
        perm = IsTeamLeader()
        self.assertTrue(perm.has_permission(self._make_request("team_leader"), None))

    def test_is_team_leader_denies_instructor(self):
        from apps.core.permissions import IsTeamLeader
        perm = IsTeamLeader()
        self.assertFalse(perm.has_permission(self._make_request("instructor"), None))

    # --- IsClassCountAdmin ---

    def test_is_class_count_admin_allows_class_count_admin(self):
        from apps.core.permissions import IsClassCountAdmin
        perm = IsClassCountAdmin()
        self.assertTrue(perm.has_permission(self._make_request("class_count_admin"), None))

    def test_is_class_count_admin_denies_instructor(self):
        from apps.core.permissions import IsClassCountAdmin
        perm = IsClassCountAdmin()
        self.assertFalse(perm.has_permission(self._make_request("instructor"), None))

    # --- TenantPermission cross-tenant rejection ---

    def test_cross_tenant_user_denied(self):
        from apps.core.permissions import TenantPermission

        other_tenant = TenantFactory()
        other_user = UserFactory(tenant=other_tenant, role="admin")

        perm = TenantPermission()

        class MockRequest:
            user = other_user
            tenant = self.tenant

        self.assertFalse(perm.has_permission(MockRequest(), None))

    # --- has_role factory ---

    def test_has_role_factory(self):
        from apps.core.permissions import has_role

        RolePerm = has_role("gym_manager", "payroll")

        perm = RolePerm()
        self.assertTrue(perm.has_permission(self._make_request("gym_manager"), None))
        self.assertTrue(perm.has_permission(self._make_request("payroll"), None))
        self.assertFalse(perm.has_permission(self._make_request("instructor"), None))
