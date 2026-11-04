"""
Exporting reports: a PDF of chosen sections for a day, week or month, either
downloaded now or emailed automatically on a schedule.
"""

from datetime import date, datetime, time, timedelta
from unittest import mock
from zoneinfo import ZoneInfo

import pytest
from django.core import mail
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.reports.export import build_report, last_full_period, period_bounds
from apps.reports.export_views import ReportExportView, ReportScheduleViewSet
from apps.reports.models import ReportSchedule
from apps.reports.tasks import send_scheduled_reports
from tests.factories import (
    AttendanceRecordFactory,
    TenantSettingsFactory,
    TimetableEventFactory,
)

pytestmark = pytest.mark.django_db

NZ = ZoneInfo("Pacific/Auckland")
ALL_SECTIONS = [
    "summary",
    "attendance",
    "classes",
    "instructors",
    "viability",
    "financial",
]


@pytest.fixture
def nz_tenant(tenant):
    TenantSettingsFactory(tenant=tenant, timezone="Pacific/Auckland")
    return tenant


@pytest.fixture
def held_class(nz_tenant, class_type, instructor):
    """A Yoga class at 6pm on Tue 3 Nov 2026 with 12 people."""
    start = datetime(2026, 11, 3, 18, 0, tzinfo=NZ)
    event = TimetableEventFactory(
        tenant=nz_tenant,
        class_type=class_type,
        instructor=instructor,
        start_datetime=start,
        end_datetime=start + timedelta(hours=1),
        status="completed",
    )
    AttendanceRecordFactory(tenant=nz_tenant, timetable_event=event, count=12)
    return event


def _post_export(tenant, user, data):
    request = APIRequestFactory().post("/api/v1/reports/export/", data, format="json")
    request.tenant = tenant
    force_authenticate(request, user=user)
    return ReportExportView.as_view()(request)


def _schedules(tenant, user, method, data=None, pk=None, action=None):
    path = (
        "/api/v1/reports/schedules/"
        + (f"{pk}/" if pk else "")
        + (f"{action}/" if action else "")
    )
    request = getattr(APIRequestFactory(), method)(path, data, format="json")
    request.tenant = tenant
    force_authenticate(request, user=user)
    actions = (
        {"get": "list", "post": "create"}
        if pk is None
        else {"patch": "partial_update", "delete": "destroy", "post": "send_now"}
    )
    view = ReportScheduleViewSet.as_view(actions)
    return view(request, pk=pk) if pk else view(request)


def _at(local_dt):
    """Patch "now" to a gym-local wall-clock time."""
    return mock.patch(
        "django.utils.timezone.now", return_value=local_dt.astimezone(ZoneInfo("UTC"))
    )


# ─── Periods ─────────────────────────────────────────────────────────────────


class TestPeriods:
    def test_daily_weekly_monthly_bounds(self):
        wed = date(2026, 11, 4)
        assert period_bounds("daily", wed) == (wed, wed)
        assert period_bounds("weekly", wed) == (date(2026, 11, 2), date(2026, 11, 8))
        assert period_bounds("monthly", wed) == (date(2026, 11, 1), date(2026, 11, 30))

    def test_last_full_period_is_the_one_just_ended(self):
        today = date(2026, 11, 4)  # a Wednesday
        assert last_full_period("daily", today) == (
            date(2026, 11, 3),
            date(2026, 11, 3),
        )
        assert last_full_period("weekly", today) == (
            date(2026, 10, 26),
            date(2026, 11, 1),
        )
        assert last_full_period("monthly", today) == (
            date(2026, 10, 1),
            date(2026, 10, 31),
        )

    def test_last_month_from_january(self):
        assert last_full_period("monthly", date(2027, 1, 15)) == (
            date(2026, 12, 1),
            date(2026, 12, 31),
        )


# ─── Building the report ─────────────────────────────────────────────────────


class TestBuildReport:
    def test_only_chosen_sections_in_report_order(
        self, nz_tenant, owner_user, held_class
    ):
        report = build_report(
            nz_tenant,
            owner_user,
            "daily",
            date(2026, 11, 3),
            ["viability", "attendance"],
        )
        assert [s["key"] for s in report["sections"]] == ["attendance", "viability"]
        assert report["period"] == "Tue 3 Nov 2026"

    def test_daily_attendance_charts_each_class(
        self, nz_tenant, owner_user, held_class
    ):
        report = build_report(
            nz_tenant, owner_user, "daily", date(2026, 11, 3), ["attendance"]
        )
        section = report["sections"][0]
        assert ("Total attendees", 12) in section["stats"]
        assert "18:00 Yoga" in section["charts"][0]["svg"]
        assert section["tables"][0]["rows"] == [
            ["Tue 3 Nov 2026", "18:00", "Yoga", held_class.instructor.name, 12]
        ]

    def test_weekly_report_covers_the_whole_week(
        self, nz_tenant, owner_user, held_class
    ):
        report = build_report(
            nz_tenant, owner_user, "weekly", date(2026, 11, 8), ["summary"]
        )
        assert report["start"] == date(2026, 11, 2)
        assert ("Classes held", 1) in report["sections"][0]["stats"]

    def test_weekly_attendance_chart_lists_every_day(
        self, nz_tenant, owner_user, held_class
    ):
        report = build_report(
            nz_tenant, owner_user, "weekly", date(2026, 11, 3), ["attendance"]
        )
        svg = report["sections"][0]["charts"][0]["svg"]
        for day in ["Mon 2 Nov 2026", "Tue 3 Nov 2026", "Sun 8 Nov 2026"]:
            assert day in svg
        assert svg.count("<rect") == 7

    def test_a_failing_section_is_noted_and_the_rest_still_build(
        self, nz_tenant, owner_user, held_class
    ):
        with mock.patch(
            "apps.reports.views.PayrollReportView.get",
            return_value=Response({"detail": "boom"}, status=500),
        ):
            report = build_report(
                nz_tenant,
                owner_user,
                "monthly",
                date(2026, 11, 3),
                ["summary", "financial"],
            )
        summary, financial = report["sections"]
        assert summary["error"] == ""
        assert not any(label == "Total payroll" for label, _ in summary["stats"])
        assert financial["error"] == "This part of the report couldn't be loaded."


# ─── Download ────────────────────────────────────────────────────────────────


class TestExportDownload:
    def test_manager_downloads_a_pdf(self, nz_tenant, manager_user, held_class):
        response = _post_export(
            nz_tenant,
            manager_user,
            {"frequency": "weekly", "date": "2026-11-03", "sections": ALL_SECTIONS},
        )
        assert response.status_code == 200
        assert response["Content-Type"] == "application/pdf"
        assert response.content.startswith(b"%PDF")
        assert (
            'filename="weekly-report-2026-11-02_to_2026-11-08.pdf"'
            in response["Content-Disposition"]
        )

    def test_needs_at_least_one_section(self, nz_tenant, manager_user):
        response = _post_export(
            nz_tenant,
            manager_user,
            {"frequency": "daily", "date": "2026-11-03", "sections": []},
        )
        assert response.status_code == 400

    def test_rejects_unknown_frequency(self, nz_tenant, manager_user):
        response = _post_export(
            nz_tenant,
            manager_user,
            {"frequency": "yearly", "date": "2026-11-03", "sections": ["summary"]},
        )
        assert response.status_code == 400

    def test_instructors_cannot_export(self, nz_tenant, instructor_user):
        response = _post_export(
            nz_tenant,
            instructor_user,
            {"frequency": "daily", "date": "2026-11-03", "sections": ["summary"]},
        )
        assert response.status_code == 403


# ─── Schedules ───────────────────────────────────────────────────────────────


class TestScheduleApi:
    def test_create_cleans_recipients_and_orders_sections(self, nz_tenant, owner_user):
        response = _schedules(
            nz_tenant,
            owner_user,
            "post",
            {
                "name": "Weekly for Sam",
                "frequency": "weekly",
                "sections": ["financial", "summary"],
                "recipients": ["Sam@Gym.com", "sam@gym.com", "ops@gym.com"],
            },
        )
        assert response.status_code == 201, response.data
        schedule = ReportSchedule.objects.get()
        assert schedule.tenant == nz_tenant
        assert schedule.created_by == owner_user
        assert schedule.sections == ["summary", "financial"]
        assert schedule.recipients == ["sam@gym.com", "ops@gym.com"]
        assert schedule.send_time == time(7, 0)  # the default
        assert response.data["send_time"] == "07:00"

    def test_send_time_can_be_chosen(self, nz_tenant, owner_user):
        response = _schedules(
            nz_tenant,
            owner_user,
            "post",
            {
                "name": "Evening",
                "frequency": "daily",
                "sections": ["summary"],
                "recipients": ["ops@gym.com"],
                "send_time": "18:30",
            },
        )
        assert response.status_code == 201, response.data
        assert ReportSchedule.objects.get().send_time == time(18, 30)
        assert response.data["send_time"] == "18:30"

    def test_rejects_bad_email(self, nz_tenant, owner_user):
        response = _schedules(
            nz_tenant,
            owner_user,
            "post",
            {
                "name": "x",
                "frequency": "daily",
                "sections": ["summary"],
                "recipients": ["not-an-email"],
            },
        )
        assert response.status_code == 400
        assert "recipients" in response.data["detail"]

    def test_other_gyms_schedules_are_hidden(self, nz_tenant, other_tenant, owner_user):
        ReportSchedule.objects.create(
            tenant=other_tenant,
            name="Theirs",
            frequency="daily",
            sections=["summary"],
            recipients=["a@b.com"],
        )
        response = _schedules(nz_tenant, owner_user, "get")
        assert response.status_code == 200
        assert response.data["results"] == []

    def test_send_now_emails_the_pdf(self, nz_tenant, owner_user, held_class):
        schedule = ReportSchedule.objects.create(
            tenant=nz_tenant,
            created_by=owner_user,
            name="Daily",
            frequency="daily",
            sections=["summary"],
            recipients=["ops@gym.com"],
        )
        with _at(datetime(2026, 11, 4, 10, 0, tzinfo=NZ)):
            response = _schedules(
                nz_tenant, owner_user, "post", pk=schedule.pk, action="send-now"
            )
        assert response.status_code == 200
        assert len(mail.outbox) == 1
        message = mail.outbox[0]
        assert message.to == ["ops@gym.com"]
        assert "Tue 3 Nov 2026" in message.subject
        name, content, mimetype = message.attachments[0]
        assert name == "daily-report-2026-11-03.pdf"
        assert mimetype == "application/pdf"
        assert content.startswith(b"%PDF")
        schedule.refresh_from_db()
        assert (
            schedule.last_period_start is None
        )  # doesn't skip the next scheduled send


# ─── Scheduled sending ───────────────────────────────────────────────────────


class TestScheduledSending:
    @pytest.fixture
    def weekly(self, nz_tenant, owner_user):
        return ReportSchedule.objects.create(
            tenant=nz_tenant,
            created_by=owner_user,
            name="Weekly",
            frequency="weekly",
            sections=["summary", "attendance"],
            recipients=["ops@gym.com", "boss@gym.com"],
        )

    def test_sends_last_week_once(self, weekly, held_class):
        with _at(datetime(2026, 11, 9, 7, 5, tzinfo=NZ)):  # Monday after
            assert send_scheduled_reports() == 1
            assert send_scheduled_reports() == 0
        assert len(mail.outbox) == 1
        assert mail.outbox[0].to == ["ops@gym.com", "boss@gym.com"]
        weekly.refresh_from_db()
        assert weekly.last_period_start == date(2026, 11, 2)

    def test_waits_until_7am_gym_time_by_default(self, weekly):
        with _at(datetime(2026, 11, 9, 6, 59, tzinfo=NZ)):
            assert send_scheduled_reports() == 0
        assert mail.outbox == []

    def test_sends_at_the_chosen_gym_time(self, weekly):
        weekly.send_time = time(18, 30)
        weekly.save()
        with _at(datetime(2026, 11, 9, 18, 29, tzinfo=NZ)):
            assert send_scheduled_reports() == 0
        with _at(datetime(2026, 11, 9, 18, 30, tzinfo=NZ)):
            assert send_scheduled_reports() == 1

    def test_send_time_is_the_gyms_not_utc(self, weekly):
        # 7:05am Monday in Auckland is still Sunday evening in UTC.
        with _at(datetime(2026, 11, 9, 7, 5, tzinfo=NZ)):
            assert send_scheduled_reports() == 1
        weekly.refresh_from_db()
        assert weekly.last_period_start == date(2026, 11, 2)

    def test_paused_and_deleted_schedules_dont_send(self, weekly):
        weekly.is_active = False
        weekly.save()
        ReportSchedule.objects.create(
            tenant=weekly.tenant,
            created_by=weekly.created_by,
            name="Gone",
            frequency="daily",
            sections=["summary"],
            recipients=["x@gym.com"],
            is_deleted=True,
        )
        with _at(datetime(2026, 11, 9, 9, 0, tzinfo=NZ)):
            assert send_scheduled_reports() == 0

    def test_a_failed_send_is_retried_next_run(self, weekly):
        with _at(datetime(2026, 11, 9, 8, 0, tzinfo=NZ)):
            with mock.patch(
                "apps.reports.tasks.send_report", side_effect=OSError("smtp down")
            ):
                assert send_scheduled_reports() == 0
            weekly.refresh_from_db()
            assert weekly.last_period_start is None
            assert send_scheduled_reports() == 1


def test_beat_job_runs_every_15_minutes():
    from django_celery_beat.models import PeriodicTask

    task = PeriodicTask.objects.get(task="reports.send_scheduled_reports")
    assert (task.interval.every, task.interval.period) == (15, "minutes")
    assert task.enabled
