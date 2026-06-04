"""
Factory Boy factories for test data creation.
"""

import factory
from django.utils import timezone


class TenantFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "tenants.Tenant"

    name = factory.Sequence(lambda n: f"Test Gym {n}")
    slug = factory.Sequence(lambda n: f"test-gym-{n}")
    is_active = True
    plan = "starter"


class TenantDomainFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "tenants.TenantDomain"

    tenant = factory.SubFactory(TenantFactory)
    domain = factory.Sequence(lambda n: f"gym{n}.localhost")
    is_primary = True
    is_custom = False


class TenantSettingsFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "tenants.TenantSettings"

    tenant = factory.SubFactory(TenantFactory)
    invoice_frequency = "fortnightly"
    payroll_approval_required = True
    timezone = "Australia/Sydney"


class SiteFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "tenants.Site"

    tenant = factory.SubFactory(TenantFactory)
    name = factory.Sequence(lambda n: f"Site {n}")
    is_active = True


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "users.User"

    tenant = factory.SubFactory(TenantFactory)
    email = factory.Sequence(lambda n: f"user{n}@test.com")
    first_name = "Test"
    last_name = "User"
    role = "instructor"
    is_active = True

    @classmethod
    def _create(cls, model_class, *args, **kwargs):
        password = kwargs.pop("password", "testpass123!")
        obj = model_class(*args, **kwargs)
        obj.set_password(password)
        obj.save()
        # Mirror the user's tenant/role into a Membership so multi-tenant auth
        # works in tests, matching the production invariant.
        from apps.users.models import Membership

        Membership.objects.get_or_create(
            user=obj,
            tenant=obj.tenant,
            defaults={"role": obj.role, "is_active": True},
        )
        return obj


class AdminUserFactory(UserFactory):
    role = "admin"


class MembershipFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "users.Membership"

    user = factory.SubFactory(UserFactory)
    tenant = factory.SubFactory(TenantFactory)
    role = "instructor"
    is_active = True


class StaffProfileFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "staff.StaffProfile"

    tenant = factory.SubFactory(TenantFactory)
    name = factory.Sequence(lambda n: f"Staff Member {n}")
    email = factory.Sequence(lambda n: f"staff{n}@test.com")
    phone = "+61400000000"
    role = "instructor"
    status = "active"


class ClassTypeFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "timetable.ClassType"

    tenant = factory.SubFactory(TenantFactory)
    name = factory.Sequence(lambda n: f"Class Type {n}")
    duration_minutes = 60
    red_threshold = 3
    amber_threshold = 6
    green_threshold = 10
    purple_threshold = 20
    is_active = True


class TimetableEventFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "timetable.TimetableEvent"

    tenant = factory.SubFactory(TenantFactory)
    class_type = factory.SubFactory(ClassTypeFactory, tenant=factory.SelfAttribute("..tenant"))
    start_datetime = factory.LazyFunction(timezone.now)
    end_datetime = factory.LazyFunction(lambda: timezone.now() + timezone.timedelta(hours=1))
    status = "scheduled"


class AttendanceRecordFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "attendance.AttendanceRecord"

    tenant = factory.SubFactory(TenantFactory)
    timetable_event = factory.SubFactory(TimetableEventFactory, tenant=factory.SelfAttribute("..tenant"))
    count = 10
    recorded_at = factory.LazyFunction(timezone.now)


class StaffPayRateFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "staff.StaffPayRate"

    tenant = factory.SubFactory(TenantFactory)
    staff = factory.SubFactory(StaffProfileFactory, tenant=factory.SelfAttribute("..tenant"))
    rate_type = "per_class"
    amount = 50
    effective_from = factory.LazyFunction(lambda: timezone.now().date())


class InvoiceFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "invoices.Invoice"

    tenant = factory.SubFactory(TenantFactory)
    instructor = factory.SubFactory(StaffProfileFactory, tenant=factory.SelfAttribute("..tenant"))
    period_start = factory.LazyFunction(lambda: timezone.now().date().replace(day=1))
    period_end = factory.LazyFunction(lambda: timezone.now().date())
    status = "draft"
    total_amount = 0


class WhatsAppAccountFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "whatsapp.WhatsAppAccount"

    tenant = factory.SubFactory(TenantFactory)
    phone_number_id = factory.Sequence(lambda n: f"phone_id_{n}")
    waba_id = factory.Sequence(lambda n: f"waba_id_{n}")
    _access_token_encrypted = "test_token"
    webhook_verify_token = "test_verify_token"
    is_active = True
    display_name = "Test Account"
