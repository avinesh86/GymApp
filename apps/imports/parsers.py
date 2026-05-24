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
    from apps.users.constants import UserRole
    from apps.users.models import User

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

            StaffProfile.objects.update_or_create(
                tenant=tenant,
                email=email,
                defaults={
                    "name": name,
                    "phone": phone,
                    "role": role,
                    "status": StaffProfile.Status.ACTIVE,
                    "created_by": created_by,
                    "updated_by": created_by,
                },
            )
            success += 1
        except Exception as exc:
            failed += 1
            errors.append({"row": index, "error": str(exc), "data": row})

    return success, failed, errors


def import_timetable(file_content: bytes, tenant, created_by) -> tuple[int, int, list]:
    from datetime import datetime

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
            instructor_email = row.get("instructor_email", "").strip()
            site_name = row.get("site", "").strip()

            if not class_type_name or not start_str:
                raise ValueError("class_type and start_datetime are required")

            class_type = ClassType.objects.get(tenant=tenant, name=class_type_name)
            start_dt = datetime.fromisoformat(start_str)
            end_dt = start_dt.replace(
                hour=start_dt.hour, minute=start_dt.minute
            )
            from datetime import timedelta
            end_dt = start_dt + timedelta(minutes=class_type.duration_minutes)

            instructor = None
            if instructor_email:
                instructor = StaffProfile.objects.filter(
                    tenant=tenant, email=instructor_email
                ).first()

            site = None
            if site_name:
                site = Site.objects.filter(tenant=tenant, name=site_name).first()

            TimetableEvent.objects.create(
                tenant=tenant,
                class_type=class_type,
                site=site,
                instructor=instructor,
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
