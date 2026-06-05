"""
Management command to seed the database with a sample tenant, users,
staff profiles, class types, and timetable events for local development.

Usage:
    python manage.py seed_data
"""

from datetime import date, time, timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = "Seed development database with sample data"

    def handle(self, *args, **options):
        self.stdout.write("Seeding data...")

        tenant = self._create_tenant()
        self._create_branding(tenant)
        self._create_settings(tenant)
        site = self._create_site(tenant)
        users = self._create_users(tenant)
        staff = self._create_staff(tenant, users)
        class_types = self._create_class_types(tenant)
        self._create_capabilities(tenant, staff, class_types)
        self._create_pay_rates(tenant, staff)
        self._create_timetable(tenant, site, class_types, staff)

        self.stdout.write(self.style.SUCCESS("Data seeded successfully."))

    def _create_tenant(self):
        from apps.tenants.models import Tenant, TenantDomain

        tenant, created = Tenant.objects.get_or_create(
            slug="demo-gym",
            defaults={"name": "Demo Gym", "is_active": True, "plan": Tenant.Plan.GROWTH},
        )
        TenantDomain.objects.get_or_create(
            domain="localhost",
            defaults={"tenant": tenant, "is_primary": True, "is_custom": False},
        )
        if created:
            self.stdout.write(f"  Created tenant: {tenant.name}")
        return tenant

    def _create_branding(self, tenant):
        from apps.tenants.models import TenantBranding

        TenantBranding.objects.get_or_create(
            tenant=tenant,
            defaults={
                "app_name": "Demo Gym",
                "primary_color": "#2563EB",
                "secondary_color": "#64748B",
                "currency": "AUD",
            },
        )

    def _create_settings(self, tenant):
        from apps.tenants.models import TenantSettings

        TenantSettings.objects.get_or_create(
            tenant=tenant,
            defaults={
                "invoice_frequency": TenantSettings.InvoiceFrequency.FORTNIGHTLY,
                "payroll_approval_required": True,
                "timezone": "Australia/Sydney",
            },
        )

    def _create_site(self, tenant):
        from apps.tenants.models import Site

        site, _ = Site.objects.get_or_create(
            tenant=tenant,
            name="Main Studio",
            defaults={"address": "123 Fitness Street, Sydney NSW 2000", "is_active": True},
        )
        self.stdout.write(f"  Created site: {site.name}")
        return site

    def _create_users(self, tenant):
        from apps.users.models import Membership, User

        users = {}
        user_data = [
            ("owner@demogym.com", "Owner", "User", "owner"),
            ("admin@demogym.com", "Admin", "User", "admin"),
            ("manager@demogym.com", "Gym", "Manager", "gym_manager"),
            ("payroll@demogym.com", "Payroll", "User", "payroll"),
            ("instructor1@demogym.com", "Jane", "Smith", "instructor"),
            ("instructor2@demogym.com", "John", "Doe", "instructor"),
        ]

        for email, first, last, role in user_data:
            user, created = User.objects.get_or_create(
                tenant=tenant,
                email=email,
                defaults={
                    "first_name": first,
                    "last_name": last,
                    "role": role,
                    "is_active": True,
                },
            )
            if created:
                user.set_password("FitOps2024!")
                user.save(update_fields=["password"])
                self.stdout.write(f"  Created user: {email}")
            Membership.objects.get_or_create(
                user=user,
                tenant=tenant,
                defaults={"role": role, "is_active": True},
            )
            users[role] = user
            users[email] = user

        return users

    def _create_staff(self, tenant, users):
        from apps.staff.models import StaffProfile

        staff_list = []
        profiles = [
            ("Jane Smith", "instructor1@demogym.com", "+61400000001", "instructor"),
            ("John Doe", "instructor2@demogym.com", "+61400000002", "instructor"),
        ]

        for name, email, phone, role in profiles:
            user = users.get(email)
            profile, created = StaffProfile.objects.get_or_create(
                tenant=tenant,
                email=email,
                defaults={
                    "name": name,
                    "phone": phone,
                    "role": role,
                    "status": StaffProfile.Status.ACTIVE,
                    "user": user,
                },
            )
            if created:
                self.stdout.write(f"  Created staff: {name}")
            staff_list.append(profile)

        return staff_list

    def _create_class_types(self, tenant):
        from apps.timetable.models import ClassBonus, ClassType

        class_types = []
        types_data = [
            ("Yoga", 60, 3, 6, 10, 20),
            ("Spin", 45, 5, 10, 15, 25),
            ("HIIT", 30, 4, 8, 12, 20),
        ]

        for name, duration, red, amber, green, purple in types_data:
            ct, created = ClassType.objects.get_or_create(
                tenant=tenant,
                name=name,
                defaults={
                    "duration_minutes": duration,
                    "red_threshold": red,
                    "amber_threshold": amber,
                    "green_threshold": green,
                    "purple_threshold": purple,
                    "is_active": True,
                },
            )
            if created:
                self.stdout.write(f"  Created class type: {name}")
                ClassBonus.objects.create(
                    tenant=tenant,
                    class_type=ct,
                    threshold_type="green",
                    bonus_amount=5,
                    description="Green threshold bonus",
                )
            class_types.append(ct)

        return class_types

    def _create_capabilities(self, tenant, staff, class_types):
        from apps.staff.models import StaffClassTypeCapability

        for staff_member in staff:
            for ct in class_types:
                StaffClassTypeCapability.objects.get_or_create(
                    tenant=tenant,
                    staff=staff_member,
                    class_type=ct,
                    defaults={"is_active": True},
                )

    def _create_pay_rates(self, tenant, staff):
        from apps.staff.models import StaffPayRate

        for staff_member in staff:
            StaffPayRate.objects.get_or_create(
                tenant=tenant,
                staff=staff_member,
                effective_from=date(2024, 1, 1),
                defaults={
                    "rate_type": StaffPayRate.RateType.PER_CLASS,
                    "amount": 50,
                },
            )

    def _create_timetable(self, tenant, site, class_types, staff):
        from apps.timetable.models import TimetableEvent

        today = date.today()
        events_created = 0

        for day_offset in range(7):
            event_date = today + timedelta(days=day_offset)
            for i, ct in enumerate(class_types):
                start_dt = timezone.datetime.combine(
                    event_date, time(7 + i * 2, 0)
                )
                if timezone.is_naive(start_dt):
                    start_dt = timezone.make_aware(start_dt)
                end_dt = start_dt + timedelta(minutes=ct.duration_minutes)

                instructor = staff[i % len(staff)] if staff else None

                TimetableEvent.objects.get_or_create(
                    tenant=tenant,
                    class_type=ct,
                    start_datetime=start_dt,
                    defaults={
                        "site": site,
                        "instructor": instructor,
                        "end_datetime": end_dt,
                        "status": TimetableEvent.Status.SCHEDULED,
                    },
                )
                events_created += 1

        self.stdout.write(f"  Created {events_created} timetable events")
