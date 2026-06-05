"""
CSV parsing and row-level validation for each import type.
Each parser returns (rows_ok, rows_failed, error_log).
"""

import csv
import io
import logging
from datetime import date

logger = logging.getLogger(__name__)


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

            if not name or not email:
                raise ValueError("name and email are required")

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
            errors.append({"row": index, "error": str(exc), "data": row})

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
    success = 0
    failed = 0
    errors = []

    for index, row in enumerate(rows, start=2):
        try:
            class_type_name = row.get("class_type", "").strip()
            start_str = row.get("start_datetime", "").strip()
            instructor_email = row.get("instructor_email", "").strip().lower()
            site_name = row.get("site", "").strip()

            if not class_type_name or not start_str:
                raise ValueError("class_type and start_datetime are required")

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

            start_dt = datetime.fromisoformat(start_str)
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
            errors.append({"row": index, "error": str(exc), "data": row})

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
                raise ValueError("event_id is required")

            event = TimetableEvent.objects.get(pk=int(event_id), tenant=tenant)
            count = int(count_str)

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
            errors.append({"row": index, "error": str(exc), "data": row})

    return success, failed, errors
