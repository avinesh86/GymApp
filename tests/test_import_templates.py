"""
CSV template download, upload, and the error-log contract the import UI renders.

The round-trip tests are the important ones: a template is only useful if the
matching parser accepts it unchanged, so each template is downloaded and fed
straight back into its parser.
"""

import csv
import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.imports.models import ImportJob
from apps.imports.parsers import (
    TEMPLATE_COLUMNS,
    import_attendance,
    import_staff,
    import_timetable,
)
from apps.imports.views import ImportJobViewSet

pytestmark = pytest.mark.django_db


def _download_template(import_type, user, tenant):
    factory = APIRequestFactory()
    request = factory.get(f"/api/v1/imports/templates/{import_type}/")
    force_authenticate(request, user=user)
    request.tenant = tenant

    view = ImportJobViewSet.as_view({"get": "template"})
    return view(request, import_type=import_type)


def _rows(response) -> list[list[str]]:
    text = b"".join(response.streaming_content).decode() if response.streaming else \
        response.content.decode()
    return list(csv.reader(io.StringIO(text)))


# --------------------------------------------------------------------------- #
# Template download
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize("import_type", sorted(TEMPLATE_COLUMNS))
def test_template_returns_csv_attachment(import_type, tenant, admin_user):
    response = _download_template(import_type, admin_user, tenant)

    assert response.status_code == 200
    assert response["Content-Type"] == "text/csv"
    assert response["Content-Disposition"] == (
        f'attachment; filename="{import_type}-template.csv"'
    )


@pytest.mark.parametrize("import_type", sorted(TEMPLATE_COLUMNS))
def test_template_header_matches_parser_columns(import_type, tenant, admin_user):
    response = _download_template(import_type, admin_user, tenant)
    header, sample_row = _rows(response)

    assert header == TEMPLATE_COLUMNS[import_type]
    assert len(sample_row) == len(header)


def test_unknown_import_type_is_404(tenant, admin_user):
    response = _download_template("memberships", admin_user, tenant)

    assert response.status_code == 404


def test_instructor_cannot_download_template(tenant, instructor_user):
    response = _download_template("staff", instructor_user, tenant)

    assert response.status_code == 403


# --------------------------------------------------------------------------- #
# Round trip: the downloaded template imports without edits
# --------------------------------------------------------------------------- #


def test_staff_template_imports_cleanly(tenant, admin_user):
    from apps.staff.models import StaffProfile

    response = _download_template("staff", admin_user, tenant)
    ok, failed, errors = import_staff(response.content, tenant, admin_user)

    assert (ok, failed, errors) == (1, 0, [])
    assert StaffProfile.objects.filter(tenant=tenant, email="sarah@example.com").exists()


def test_timetable_template_imports_cleanly(tenant, admin_user):
    from apps.timetable.models import TimetableEvent

    response = _download_template("timetable", admin_user, tenant)
    ok, failed, errors = import_timetable(response.content, tenant, admin_user)

    assert (ok, failed, errors) == (1, 0, [])
    event = TimetableEvent.objects.get(tenant=tenant, class_type__name="HIIT Blast")
    # No matching staff yet, so the event waits for a later staff import.
    assert event.status == TimetableEvent.Status.UNFILLED
    assert event.pending_instructor_email == "sarah@example.com"


def test_attendance_template_row_reports_missing_event(tenant, admin_user):
    # The attendance template's example event_id (123) will not exist for a
    # fresh tenant — the row must fail with a field-level error, not a crash.
    response = _download_template("attendance", admin_user, tenant)
    ok, failed, errors = import_attendance(response.content, tenant, admin_user)

    assert (ok, failed) == (0, 1)
    assert errors[0]["field"] == "event_id"


def test_attendance_template_imports_against_a_real_event(
    tenant, admin_user, past_event
):
    from apps.attendance.models import AttendanceRecord

    csv_bytes = f"event_id,count\n{past_event.pk},18\n".encode()
    ok, failed, errors = import_attendance(csv_bytes, tenant, admin_user)

    assert (ok, failed, errors) == (1, 0, [])
    assert AttendanceRecord.objects.get(timetable_event=past_event).count == 18


# --------------------------------------------------------------------------- #
# Upload: template downloaded → uploaded → job processed
# --------------------------------------------------------------------------- #


def _upload_csv(import_type, csv_bytes, user, tenant, monkeypatch) -> ImportJob:
    """POST a CSV the way the page does, then run the queued task inline."""
    from apps.imports import tasks

    queued: list[int] = []
    monkeypatch.setattr(tasks.run_import_job, "delay", queued.append)

    factory = APIRequestFactory()
    request = factory.post(
        "/api/v1/imports/",
        {
            "import_type": import_type,
            "file": SimpleUploadedFile(
                f"{import_type}.csv", csv_bytes, content_type="text/csv"
            ),
        },
        format="multipart",
    )
    force_authenticate(request, user=user)
    request.tenant = tenant

    response = ImportJobViewSet.as_view({"post": "create"})(request)
    assert response.status_code == 201, response.data
    assert queued == [response.data["id"]]

    tasks.run_import_job(response.data["id"])
    return ImportJob.objects.get(pk=response.data["id"])


def test_uploading_the_staff_template_completes(
    tenant, admin_user, monkeypatch, settings, tmp_path
):
    settings.MEDIA_ROOT = str(tmp_path)
    template = _download_template("staff", admin_user, tenant)

    job = _upload_csv("staff", template.content, admin_user, tenant, monkeypatch)

    assert job.status == ImportJob.Status.COMPLETE
    assert (job.rows_total, job.rows_success, job.rows_failed) == (1, 1, 0)
    assert job.error_log == []
    assert job.completed_at is not None


def test_uploading_a_bad_row_records_a_field_level_error(
    tenant, admin_user, monkeypatch, settings, tmp_path
):
    settings.MEDIA_ROOT = str(tmp_path)
    csv_bytes = (
        b"name,email,phone,role\n"
        b"Valid Person,valid@example.com,+64211234567,instructor\n"
        b"No Email,,+64211234568,instructor\n"
    )

    job = _upload_csv("staff", csv_bytes, admin_user, tenant, monkeypatch)

    assert job.status == ImportJob.Status.COMPLETE
    assert (job.rows_total, job.rows_success, job.rows_failed) == (2, 1, 1)
    assert job.error_log[0]["row"] == 3
    assert job.error_log[0]["field"] == "email"


def test_upload_without_a_file_is_rejected(tenant, admin_user):
    factory = APIRequestFactory()
    request = factory.post("/api/v1/imports/", {"import_type": "staff"}, format="multipart")
    force_authenticate(request, user=admin_user)
    request.tenant = tenant

    response = ImportJobViewSet.as_view({"post": "create"})(request)

    assert response.status_code == 400


# --------------------------------------------------------------------------- #
# Timezone — a CSV time with no offset is the gym's local wall-clock time
# --------------------------------------------------------------------------- #


def test_naive_csv_time_is_read_in_the_tenant_timezone(tenant, admin_user):
    from apps.tenants.models import TenantSettings
    from apps.timetable.models import TimetableEvent

    TenantSettings.objects.update_or_create(
        tenant=tenant, defaults={"timezone": "Pacific/Auckland"}
    )
    csv_bytes = (
        b"class_type,start_datetime,instructor_email,site\n"
        b"Dawn Spin,2026-06-08T06:00:00,,Main Studio\n"
    )

    ok, failed, errors = import_timetable(csv_bytes, tenant, admin_user)

    assert (ok, failed, errors) == (1, 0, [])
    event = TimetableEvent.objects.get(tenant=tenant, class_type__name="Dawn Spin")
    # June = NZST (UTC+12), so 06:00 local is 18:00 UTC the previous day.
    assert event.start_datetime.isoformat() == "2026-06-07T18:00:00+00:00"


def test_csv_time_with_explicit_offset_is_respected(tenant, admin_user):
    from apps.tenants.models import TenantSettings
    from apps.timetable.models import TimetableEvent

    TenantSettings.objects.update_or_create(
        tenant=tenant, defaults={"timezone": "Pacific/Auckland"}
    )
    csv_bytes = (
        b"class_type,start_datetime,instructor_email,site\n"
        b"Offset Class,2026-06-08T06:00:00+00:00,,Main Studio\n"
    )

    ok, failed, _ = import_timetable(csv_bytes, tenant, admin_user)

    assert (ok, failed) == (1, 0)
    event = TimetableEvent.objects.get(tenant=tenant, class_type__name="Offset Class")
    assert event.start_datetime.isoformat() == "2026-06-08T06:00:00+00:00"


# --------------------------------------------------------------------------- #
# Error-log shape — the UI table reads row / field / message
# --------------------------------------------------------------------------- #


def test_missing_required_staff_field_names_the_column(tenant, admin_user):
    csv_bytes = b"name,email,phone,role\nNo Email,,+64211234567,instructor\n"
    ok, failed, errors = import_staff(csv_bytes, tenant, admin_user)

    assert (ok, failed) == (0, 1)
    assert errors[0]["row"] == 2
    assert errors[0]["field"] == "email"
    assert errors[0]["message"] == "email is required"
    assert errors[0]["data"]["name"] == "No Email"


def test_bad_timetable_datetime_names_the_column(tenant, admin_user):
    from apps.timetable.models import ClassType

    csv_bytes = (
        b"class_type,start_datetime,instructor_email,site\n"
        b"Bad Time Class,08/06/2026 6am,,Main Studio\n"
    )
    ok, failed, errors = import_timetable(csv_bytes, tenant, admin_user)

    assert (ok, failed) == (0, 1)
    assert errors[0]["field"] == "start_datetime"
    # A row that fails validation must not leave a class type behind.
    assert not ClassType.objects.filter(tenant=tenant, name="Bad Time Class").exists()


def test_non_numeric_attendance_count_names_the_column(tenant, admin_user, past_event):
    csv_bytes = f"event_id,count\n{past_event.pk},many\n".encode()
    ok, failed, errors = import_attendance(csv_bytes, tenant, admin_user)

    assert (ok, failed) == (0, 1)
    assert errors[0]["field"] == "count"
