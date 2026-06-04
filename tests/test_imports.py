"""
CSV import tests for staff + timetable.

Focus: staff and timetable CSVs must map instructors to classes regardless of
upload order. A timetable imported before its staff creates unfilled events that
remember the wanted instructor email; the later staff import back-fills them.

Parallel-safe: every row uses a nanosecond-timestamped suffix so emails/names
never collide, even across pytest-xdist workers sharing a database. Each test
runs inside the pytest-django transaction (rolled back on teardown), and the
`clear_import_data` fixture below also hard-deletes anything created, so the
suite leaves no residue even if run against a persistent DB.
"""

import io
import time

import pytest

from apps.imports.parsers import import_staff, import_timetable
from apps.staff.models import StaffProfile
from apps.tenants.models import Site
from apps.timetable.models import ClassType, TimetableEvent

pytestmark = pytest.mark.django_db


def _suffix() -> str:
    """Unique, monotonic-enough token for parallel runs."""
    return str(time.time_ns())


@pytest.fixture
def sample(tenant):
    """Timestamped staff + timetable CSV pair sharing the same instructor emails."""
    token = _suffix()

    instructors = [
        {"name": "Sarah Mitchell", "email": f"sarah.{token}@testgym.com"},
        {"name": "James Thornton", "email": f"james.{token}@testgym.com"},
        {"name": "Priya Sharma", "email": f"priya.{token}@testgym.com"},
    ]

    staff_lines = ["name,email,phone,role"]
    for i, person in enumerate(instructors, start=1):
        staff_lines.append(f"{person['name']},{person['email']},+642100000{i},instructor")
    staff_csv = ("\n".join(staff_lines) + "\n").encode("utf-8")

    timetable_lines = ["class_type,start_datetime,instructor_email,site"]
    timetable_rows = [
        ("HIIT Blast", "2026-06-08T06:00:00", instructors[0]["email"], "Main Studio"),
        ("Yoga Flow", "2026-06-08T09:00:00", instructors[2]["email"], "Wellness Room"),
        ("Spin Class", "2026-06-08T17:30:00", instructors[1]["email"], "Cycle Studio"),
    ]
    for class_type, start, email, site in timetable_rows:
        timetable_lines.append(f"{class_type},{start},{email},{site}")
    timetable_csv = ("\n".join(timetable_lines) + "\n").encode("utf-8")

    return {
        "token": token,
        "emails": [p["email"] for p in instructors],
        "staff_csv": staff_csv,
        "timetable_csv": timetable_csv,
        "class_types": ["HIIT Blast", "Yoga Flow", "Spin Class"],
        "sites": ["Main Studio", "Wellness Room", "Cycle Studio"],
    }


@pytest.fixture(autouse=True)
def clear_import_data(tenant):
    """Belt-and-braces cleanup: drop every row this tenant created after each test."""
    yield
    TimetableEvent.objects.filter(tenant=tenant).delete()
    StaffProfile.objects.filter(tenant=tenant).delete()
    ClassType.objects.filter(tenant=tenant).delete()
    Site.objects.filter(tenant=tenant).delete()


def _events_by_class_type(tenant, names):
    return {
        ev.class_type.name: ev
        for ev in TimetableEvent.objects.filter(
            tenant=tenant, class_type__name__in=names
        ).select_related("class_type", "instructor", "site")
    }


# --------------------------------------------------------------------------- #
# Staff import
# --------------------------------------------------------------------------- #


def test_staff_import_creates_profiles(tenant, admin_user, sample):
    ok, failed, errors = import_staff(sample["staff_csv"], tenant, admin_user)

    assert (ok, failed, errors) == (3, 0, [])
    for email in sample["emails"]:
        assert StaffProfile.objects.filter(tenant=tenant, email=email).exists()


def test_staff_reimport_is_idempotent(tenant, admin_user, sample):
    import_staff(sample["staff_csv"], tenant, admin_user)
    import_staff(sample["staff_csv"], tenant, admin_user)

    # update_or_create on (tenant, email) means no duplicates on re-run.
    assert StaffProfile.objects.filter(
        tenant=tenant, email__in=sample["emails"]
    ).count() == 3


# --------------------------------------------------------------------------- #
# Order independence — the core fix
# --------------------------------------------------------------------------- #


def test_staff_first_then_timetable_maps_instructors(tenant, admin_user, sample):
    import_staff(sample["staff_csv"], tenant, admin_user)
    ok, failed, _ = import_timetable(sample["timetable_csv"], tenant, admin_user)

    assert (ok, failed) == (3, 0)
    events = _events_by_class_type(tenant, sample["class_types"])
    for ev in events.values():
        assert ev.instructor is not None
        assert ev.status == TimetableEvent.Status.SCHEDULED
        assert ev.pending_instructor_email == ""

    # Each class maps to the right person.
    assert events["HIIT Blast"].instructor.email == sample["emails"][0]
    assert events["Yoga Flow"].instructor.email == sample["emails"][2]
    assert events["Spin Class"].instructor.email == sample["emails"][1]


def test_timetable_first_then_staff_backfills_instructors(tenant, admin_user, sample):
    # Timetable imported BEFORE staff — the previously-broken order.
    ok, failed, _ = import_timetable(sample["timetable_csv"], tenant, admin_user)
    assert (ok, failed) == (3, 0)

    # With no staff yet, events are unfilled but remember their wanted instructor.
    events = _events_by_class_type(tenant, sample["class_types"])
    for ev in events.values():
        assert ev.instructor is None
        assert ev.status == TimetableEvent.Status.UNFILLED
        assert ev.pending_instructor_email in sample["emails"]

    # Importing staff back-fills every pending event.
    import_staff(sample["staff_csv"], tenant, admin_user)

    events = _events_by_class_type(tenant, sample["class_types"])
    for ev in events.values():
        assert ev.instructor is not None
        assert ev.status == TimetableEvent.Status.SCHEDULED
        assert ev.pending_instructor_email == ""

    assert events["HIIT Blast"].instructor.email == sample["emails"][0]
    assert events["Yoga Flow"].instructor.email == sample["emails"][2]
    assert events["Spin Class"].instructor.email == sample["emails"][1]


def test_instructor_email_case_insensitive(tenant, admin_user, sample):
    # Staff import lowercases emails; timetable must match regardless of the
    # case used in the timetable CSV. Upper-case only the email column, leaving
    # the header and other values intact.
    lines = sample["timetable_csv"].decode().splitlines()
    header, *rows = lines
    upper_rows = []
    for row in rows:
        class_type, start, email, site = row.split(",")
        upper_rows.append(",".join([class_type, start, email.upper(), site]))
    upper_csv = ("\n".join([header, *upper_rows]) + "\n").encode("utf-8")

    import_staff(sample["staff_csv"], tenant, admin_user)
    import_timetable(upper_csv, tenant, admin_user)

    events = TimetableEvent.objects.filter(tenant=tenant)
    assert events.count() == 3
    assert all(ev.instructor is not None for ev in events)


# --------------------------------------------------------------------------- #
# Auto-creation + lenient unknown instructor
# --------------------------------------------------------------------------- #


def test_class_type_and_site_autocreated(tenant, admin_user, sample):
    import_timetable(sample["timetable_csv"], tenant, admin_user)

    for name in sample["class_types"]:
        assert ClassType.objects.filter(tenant=tenant, name=name).exists()
    for name in sample["sites"]:
        assert Site.objects.filter(tenant=tenant, name=name).exists()


def test_unknown_instructor_stays_unfilled_without_backfill(tenant, admin_user, sample):
    ghost = f"ghost.{sample['token']}@testgym.com"
    csv = (
        "class_type,start_datetime,instructor_email,site\n"
        f"Boxing,2026-06-08T10:00:00,{ghost},Functional Zone\n"
    ).encode("utf-8")

    ok, failed, _ = import_timetable(csv, tenant, admin_user)
    assert (ok, failed) == (1, 0)

    ev = TimetableEvent.objects.get(tenant=tenant, class_type__name="Boxing")
    assert ev.instructor is None
    assert ev.status == TimetableEvent.Status.UNFILLED
    assert ev.pending_instructor_email == ghost

    # Importing unrelated staff must NOT touch this event.
    import_staff(sample["staff_csv"], tenant, admin_user)
    ev.refresh_from_db()
    assert ev.instructor is None
    assert ev.status == TimetableEvent.Status.UNFILLED


def test_backfill_is_tenant_scoped(tenant, other_tenant, admin_user, sample):
    # Event waiting in `other_tenant`; staff imported into `tenant` must not touch it.
    import_timetable(sample["timetable_csv"], other_tenant, admin_user)
    import_staff(sample["staff_csv"], tenant, admin_user)

    other_events = TimetableEvent.objects.filter(tenant=other_tenant)
    assert other_events.count() == 3
    assert all(ev.instructor is None for ev in other_events)
    assert all(
        ev.status == TimetableEvent.Status.UNFILLED for ev in other_events
    )
    # Clean up the other tenant's rows (autouse fixture only covers `tenant`).
    other_events.delete()
    ClassType.objects.filter(tenant=other_tenant).delete()
    Site.objects.filter(tenant=other_tenant).delete()
