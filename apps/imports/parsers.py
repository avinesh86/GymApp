"""
CSV parsing and row-level validation for each import type.
Each parser returns (rows_ok, rows_failed, error_log).
"""

import csv
import io
import logging
from zoneinfo import ZoneInfo

from apps.core.timezones import tenant_timezone

from django.conf import settings

logger = logging.getLogger(__name__)


# Columns each parser reads, in the order the downloadable CSV template lists
# them. Single source of truth: the template endpoint builds its header from
# here, so a parser change can never drift from the template users download.
TEMPLATE_COLUMNS: dict[str, list[str]] = {
    "staff": ["name", "email", "phone", "role"],
    "timetable": ["class_type", "start_datetime", "instructor_email", "site"],
    "attendance": ["event_id", "count"],
}

# One example row per template so the expected formats (especially the ISO
# datetime) are obvious without reading docs.
TEMPLATE_SAMPLE_ROWS: dict[str, list[str]] = {
    "staff": ["Sarah Mitchell", "sarah@example.com", "+64211234567", "instructor"],
    "timetable": [
        "HIIT Blast",
        "2026-06-08T06:00:00",
        "sarah@example.com",
        "Main Studio",
    ],
    "attendance": ["123", "18"],
}


class RowError(Exception):
    """A row-level failure tied to a specific CSV column."""

    def __init__(self, field: str, message: str):
        super().__init__(message)
        self.field = field


def _row_error(row_number: int, exc: Exception, row: dict) -> dict:
    """Build the error-log entry the frontend error table renders."""
    return {
        "row": row_number,
        "field": getattr(exc, "field", "") or "",
        "message": str(exc),
        "data": row,
    }


def _tenant_timezone(tenant) -> ZoneInfo:
    """Zone that a CSV datetime without an offset is understood to be in.

    Gyms write local wall-clock times in their spreadsheets, so a bare
    "2026-06-08T06:00:00" means 6am at the gym, not 6am UTC.
    """
    return tenant_timezone(tenant)


def _read_csv(file_content: bytes) -> list[dict]:
    text = file_content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    return list(reader)


def import_staff(file_content: bytes, tenant, created_by) -> tuple[int, int, list]:
    from apps.staff.models import StaffProfile
    from apps.staff.services import provision_user

    rows = _read_csv(file_content)
    success = 0
    failed = 0
    errors = []

    for index, row in enumerate(rows, start=2):
        try:
            name = row.get("name", "").strip()
            email = row.get("email", "").strip().lower()
            phone = row.get("phone", "").strip()
            role = row.get("role", "instructor").strip().lower()

            if not name:
                raise RowError("name", "name is required")
            if not email:
                raise RowError("email", "email is required")

            # Provision the login first — StaffProfile.user is required. New
            # accounts get an invite to set their password.
            user, _ = provision_user(
                email=email, name=name, tenant=tenant, role=role, send_invite=True
            )

            profile, _ = StaffProfile.objects.update_or_create(
                tenant=tenant,
                email=email,
                defaults={
                    "name": name,
                    "phone": phone,
                    "role": role,
                    "status": StaffProfile.Status.ACTIVE,
                    "user": user,
                    "created_by": created_by,
                    "updated_by": created_by,
                },
            )

            # Order-independent mapping: a timetable CSV imported before this
            # staff CSV created unfilled events that recorded the wanted
            # instructor in pending_instructor_email. Back-fill them now.
            _backfill_pending_events(tenant, email, profile, created_by)

            success += 1
        except Exception as exc:
            failed += 1
            errors.append(_row_error(index, exc, row))

    return success, failed, errors


def _backfill_pending_events(tenant, email, profile, updated_by) -> int:
    """Assign a newly-imported instructor to events waiting on their email.

    Only touches unfilled events that named this email during a prior timetable
    import. Returns the number of events updated.
    """
    from apps.timetable.models import TimetableEvent

    return (
        TimetableEvent.objects.filter(
            tenant=tenant,
            instructor__isnull=True,
            pending_instructor_email=email,
            status=TimetableEvent.Status.UNFILLED,
        ).update(
            instructor=profile,
            status=TimetableEvent.Status.SCHEDULED,
            pending_instructor_email="",
            updated_by=updated_by,
        )
    )


def import_timetable(file_content: bytes, tenant, created_by) -> tuple[int, int, list]:
    from datetime import datetime, timedelta

    from apps.staff.models import StaffProfile
    from apps.tenants.models import Site
    from apps.timetable.models import ClassType, TimetableEvent

    rows = _read_csv(file_content)
    local_zone = _tenant_timezone(tenant)
    success = 0
    failed = 0
    errors = []

    for index, row in enumerate(rows, start=2):
        try:
            class_type_name = row.get("class_type", "").strip()
            start_str = row.get("start_datetime", "").strip()
            instructor_email = row.get("instructor_email", "").strip().lower()
            site_name = row.get("site", "").strip()

            if not class_type_name:
                raise RowError("class_type", "class_type is required")
            if not start_str:
                raise RowError("start_datetime", "start_datetime is required")

            # Parse before any writes so a malformed row leaves no half-created
            # class type behind.
            try:
                start_dt = datetime.fromisoformat(start_str)
            except ValueError:
                raise RowError(
                    "start_datetime",
                    f"{start_str!r} is not ISO format (e.g. 2026-06-08T06:00:00)",
                )

            # A CSV time without an offset is the gym's local wall-clock time.
            # Django stores it as UTC once it is aware.
            if start_dt.tzinfo is None:
                start_dt = start_dt.replace(tzinfo=local_zone)

            # Auto-create class type if it doesn't exist yet for this tenant.
            # Default duration is 60 minutes — the tenant can adjust it later
            # via settings.
            class_type, _ = ClassType.objects.get_or_create(
                tenant=tenant,
                name=class_type_name,
                defaults={
                    "duration_minutes": 60,
                    "created_by": created_by,
                    "updated_by": created_by,
                },
            )

            end_dt = start_dt + timedelta(minutes=class_type.duration_minutes)

            # Resolve instructor. If an email is provided but no StaffProfile
            # exists yet, create the event as unfilled and remember the email in
            # pending_instructor_email so a later staff import can back-fill it.
            # This makes staff/timetable CSV order irrelevant.
            instructor = None
            pending_email = ""
            if instructor_email:
                instructor = StaffProfile.objects.filter(
                    tenant=tenant, email=instructor_email
                ).first()
                if not instructor:
                    pending_email = instructor_email
                    logger.warning(
                        "Timetable import row %d: no StaffProfile for email %r — "
                        "event created as unfilled, pending staff import.",
                        index,
                        instructor_email,
                    )

            # Auto-create site if a name is provided and it doesn't exist yet.
            # Site is a plain model (no created_by/updated_by).
            site = None
            if site_name:
                site, _ = Site.objects.get_or_create(
                    tenant=tenant,
                    name=site_name,
                    defaults={"address": ""},
                )

            TimetableEvent.objects.create(
                tenant=tenant,
                class_type=class_type,
                site=site,
                instructor=instructor,
                pending_instructor_email=pending_email,
                start_datetime=start_dt,
                end_datetime=end_dt,
                status=(
                    TimetableEvent.Status.SCHEDULED
                    if instructor
                    else TimetableEvent.Status.UNFILLED
                ),
                created_by=created_by,
                updated_by=created_by,
            )
            success += 1
        except Exception as exc:
            failed += 1
            errors.append(_row_error(index, exc, row))

    return success, failed, errors


def import_attendance(file_content: bytes, tenant, created_by) -> tuple[int, int, list]:
    from apps.attendance.models import AttendanceRecord
    from apps.timetable.models import TimetableEvent
    from django.utils import timezone

    rows = _read_csv(file_content)
    success = 0
    failed = 0
    errors = []

    for index, row in enumerate(rows, start=2):
        try:
            event_id = row.get("event_id", "").strip()
            count_str = row.get("count", "0").strip()

            if not event_id:
                raise RowError("event_id", "event_id is required")

            try:
                event = TimetableEvent.objects.get(pk=int(event_id), tenant=tenant)
            except (TimetableEvent.DoesNotExist, ValueError):
                raise RowError("event_id", f"no timetable event with id {event_id!r}")

            try:
                count = int(count_str)
            except ValueError:
                raise RowError("count", f"{count_str!r} is not a whole number")

            AttendanceRecord.objects.update_or_create(
                timetable_event=event,
                defaults={
                    "tenant": tenant,
                    "count": count,
                    "recorded_by": created_by,
                    "recorded_at": timezone.now(),
                    "created_by": created_by,
                    "updated_by": created_by,
                },
            )
            success += 1
        except Exception as exc:
            failed += 1
            errors.append(_row_error(index, exc, row))

    return success, failed, errors
