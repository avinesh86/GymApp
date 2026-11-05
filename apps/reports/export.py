"""Exportable report: a PDF of the chosen report sections for one day, week or
month, downloaded from the Reports page or emailed on a schedule.

Each section reuses the matching Reports API view, called in-process as the
person the report is for, so the PDF shows exactly what the Reports page
shows them — the same numbers, class filter and permissions. A section that
fails (e.g. a report the person can't see) is noted in the PDF rather than
failing the whole report.
"""

import calendar
import logging
from datetime import date, timedelta
from html import escape

logger = logging.getLogger(__name__)

FREQUENCIES = ("daily", "weekly", "monthly")

SECTIONS = {
    "summary": "Summary",
    "attendance": "Attendance",
    "classes": "Classes",
    "instructors": "Instructors",
    "viability": "Viability",
    "financial": "Financial",
}
SECTION_KEYS = tuple(SECTIONS)

# Classes at or above this viability count as good — as on the Reports page.
GOOD_VIABILITY = 60

DEFAULT_BAR = "#06B6D4"


# ─── Periods ─────────────────────────────────────────────────────────────────


def period_bounds(frequency: str, day: date) -> tuple[date, date]:
    """The day, Monday–Sunday week or calendar month that contains ``day``."""
    if frequency == "daily":
        return day, day
    if frequency == "weekly":
        start = day - timedelta(days=day.weekday())
        return start, start + timedelta(days=6)
    if frequency == "monthly":
        last = calendar.monthrange(day.year, day.month)[1]
        return day.replace(day=1), day.replace(day=last)
    raise ValueError(f"Unknown frequency: {frequency}")


def last_full_period(frequency: str, today: date) -> tuple[date, date]:
    """The most recent period that has finished: yesterday, last week or last
    month."""
    if frequency == "daily":
        return period_bounds(frequency, today - timedelta(days=1))
    if frequency == "weekly":
        return period_bounds(frequency, today - timedelta(days=7))
    return period_bounds(frequency, today.replace(day=1) - timedelta(days=1))


def period_label(frequency: str, start: date, end: date) -> str:
    from apps.core.timezones import format_date, format_date_range

    if frequency == "daily":
        return format_date(start)
    if frequency == "monthly":
        return f"{start:%B %Y}"
    return format_date_range(start, end)


# ─── Charts ──────────────────────────────────────────────────────────────────


def bar_chart_svg(items, *, suffix: str = "", max_value: float | None = None) -> str:
    """Horizontal bar chart as inline SVG (WeasyPrint renders it in the PDF).

    ``items`` is a list of (label, value, colour-or-None).
    """
    if not items:
        return ""
    width, label_w, value_w, row_h = 680, 190, 60, 22
    bar_w = width - label_w - value_w
    top = max_value or max((v for _, v, _ in items), default=0) or 1
    rows = []
    for i, (label, value, colour) in enumerate(items):
        y = i * row_h
        length = max(0.0, min(1.0, value / top)) * bar_w
        text = label if len(label) <= 28 else label[:27] + "…"
        rows.append(
            f'<text x="{label_w - 8}" y="{y + 15}" text-anchor="end" '
            f'font-size="11" fill="#374151">{escape(text)}</text>'
            f'<rect x="{label_w}" y="{y + 4}" width="{length:.1f}" height="14" '
            f'rx="2" fill="{escape(colour or DEFAULT_BAR)}"/>'
            f'<text x="{label_w + length + 6:.1f}" y="{y + 15}" font-size="11" '
            f'fill="#111827">{_number(value)}{suffix}</text>'
        )
    height = len(items) * row_h + 4
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">{"".join(rows)}</svg>'
    )


def _number(value) -> str:
    value = float(value or 0)
    return f"{value:.0f}" if value == int(value) else f"{value:.1f}"


# ─── Sections ────────────────────────────────────────────────────────────────


class SectionError(Exception):
    pass


class _Reports:
    """Fetches each Reports API response once, as ``user``."""

    def __init__(self, tenant, user, start: date, end: date):
        self.tenant, self.user, self.start, self.end = tenant, user, start, end
        self._cache = {}

    def get(self, name: str):
        if name not in self._cache:
            self._cache[name] = self._fetch(name)
        return self._cache[name]

    def _fetch(self, name: str):
        # DRF's request factory builds a real request for the view, so the
        # report goes through the same permission checks and code as the page.
        from rest_framework.test import APIRequestFactory, force_authenticate

        from . import views

        view_cls = {
            "attendance": views.AttendanceReportView,
            "classes": views.ClassesReportView,
            "instructors": views.InstructorReliabilityReportView,
            "viability": views.ClassViabilityReportView,
            "payroll": views.PayrollReportView,
        }[name]
        request = APIRequestFactory().get(
            "/", {"from": self.start.isoformat(), "to": self.end.isoformat()}
        )
        request.tenant = self.tenant
        force_authenticate(request, user=self.user)
        try:
            response = view_cls.as_view()(request)
        except Exception as exc:
            logger.exception("Report export: %s report failed", name)
            raise SectionError("This part of the report couldn't be loaded.") from exc
        if response.status_code == 403:
            raise SectionError("You don't have access to this part of the report.")
        if response.status_code != 200:
            raise SectionError("This part of the report couldn't be loaded.")
        return response.data


def _section(key, **parts):
    return {
        "key": key,
        "title": SECTIONS[key],
        "stats": parts.get("stats", []),
        "charts": [c for c in parts.get("charts", []) if c["svg"]],
        "tables": parts.get("tables", []),
        "note": parts.get("note", ""),
        "error": "",
    }


def _summary(reports: _Reports):
    att = reports.get("attendance")
    stats = [
        ("Classes held", att["total_classes"]),
        ("Avg attendance", _number(att["avg_attendance"])),
        ("Total attendees", att["total_attendees"]),
    ]
    try:
        rows = reports.get("viability")["by_class_type"]
        good = sum(
            1 for r in rows if float(r["viability_percentage"] or 0) >= GOOD_VIABILITY
        )
        stats.append(("Good viability", f"{good}/{len(rows)}"))
    except SectionError:
        pass
    try:
        stats.append(("Total payroll", f"${reports.get('payroll')['total_payroll']}"))
    except SectionError:
        pass
    note = ""
    if att["classes_without_attendance"]:
        note = (
            f"{att['classes_without_attendance']} class(es) have no attendance "
            "recorded and are left out of the averages."
        )
    return _section("summary", stats=stats, note=note)


def _attendance(reports: _Reports, frequency: str):
    att = reports.get("attendance")
    if frequency == "daily":
        chart = {
            "title": "Attendance by class",
            "svg": bar_chart_svg(
                [
                    (
                        f"{e['time']} {e['class_name']}",
                        e["attendance_count"],
                        e["color"],
                    )
                    for day in att["daily_breakdown"]
                    for e in day["events"]
                    if e["attendance_count"] is not None
                ]
            ),
        }
    else:
        from apps.core.timezones import format_date

        # Every day of the period, 0 where nothing ran, so gaps show.
        per_day = {
            day["date"]: sum(e["attendance_count"] or 0 for e in day["events"])
            for day in att["daily_breakdown"]
        }
        days = [
            reports.start + timedelta(days=n)
            for n in range((reports.end - reports.start).days + 1)
        ]
        chart = {
            "title": "Attendees per day",
            "svg": bar_chart_svg(
                [(format_date(d), per_day.get(d.isoformat(), 0), None) for d in days]
            ),
        }
    slots = {
        "title": "Average attendance by time of day",
        "svg": bar_chart_svg(
            [(s["slot"], s["avg_attendance"], None) for s in att["by_time_slot"]]
        ),
    }
    log = {
        "title": "Classes",
        "columns": ["Date", "Time", "Class", "Instructor", "Attendance"],
        "rows": [
            [
                c["date"],
                c["time"],
                c["class_name"],
                c["instructor_name"] or "—",
                c["attendance_count"],
            ]
            for c in reversed(att["class_log"])
        ],
    }
    return _section(
        "attendance",
        stats=[
            ("Classes held", att["total_classes"]),
            ("With a count", att["classes_with_attendance"]),
            ("Avg attendance", _number(att["avg_attendance"])),
            ("Total attendees", att["total_attendees"]),
        ],
        charts=[chart, slots],
        tables=[log] if log["rows"] else [],
    )


def _classes(reports: _Reports):
    data = reports.get("classes")
    rows = data["by_class_type"]
    return _section(
        "classes",
        charts=[
            {
                "title": "Average attendance by class",
                "svg": bar_chart_svg(
                    [
                        (r["class_type_name"], r["avg_attendance"], r["color"])
                        for r in rows
                    ]
                ),
            },
            {
                "title": "Average attendance by day of week",
                "svg": bar_chart_svg(
                    [
                        (d["day"], d["avg_attendance"], None)
                        for d in data["by_day_of_week"]
                    ]
                ),
            },
        ],
        tables=[
            {
                "title": "By class",
                "columns": [
                    "Class",
                    "Held",
                    "Recorded",
                    "Avg attendance",
                    "Viability",
                    "Cancelled",
                ],
                "rows": [
                    [
                        r["class_type_name"],
                        r["total_classes"],
                        r["recorded_classes"],
                        _number(r["avg_attendance"]),
                        f"{_number(r['viability_percentage'])}%",
                        f"{_number(r['cancellation_percentage'])}%",
                    ]
                    for r in rows
                ],
            }
        ]
        if rows
        else [],
    )


def _instructors(reports: _Reports):
    rows = [r for r in reports.get("instructors") if r["total_classes"]]
    return _section(
        "instructors",
        charts=[
            {
                "title": "Classes taught",
                "svg": bar_chart_svg(
                    [(r["instructor_name"], r["total_classes"], None) for r in rows]
                ),
            },
            {
                "title": "Average attendance",
                "svg": bar_chart_svg(
                    [(r["instructor_name"], r["avg_attendance"], None) for r in rows]
                ),
            },
        ],
        tables=[
            {
                "title": "Instructors",
                "columns": [
                    "Instructor",
                    "Classes",
                    "Avg attendance",
                    "Reliability",
                    "Cover requests",
                ],
                "rows": [
                    [
                        r["instructor_name"],
                        r["total_classes"],
                        _number(r["avg_attendance"]),
                        f"{_number(r['reliability_score'])}%",
                        r["cover_requests_count"],
                    ]
                    for r in rows
                ],
            }
        ]
        if rows
        else [],
        note="" if rows else "No instructor taught a class in this period.",
    )


def _viability(reports: _Reports):
    data = reports.get("viability")
    rows = [r for r in data["by_class_type"] if r["total_classes"]]
    snap = data["overall_snapshot"]
    return _section(
        "viability",
        stats=[
            ("Excellent", snap["excellent"]),
            ("Good", snap["good"]),
            ("Moderate", snap["moderate"]),
            ("Low", snap["low"]),
        ],
        charts=[
            {
                "title": "Viability by class",
                "svg": bar_chart_svg(
                    [
                        (
                            r["class_type_name"],
                            r["viability_percentage"],
                            "#16A34A"
                            if r["viability_percentage"] >= GOOD_VIABILITY
                            else "#F59E0B",
                        )
                        for r in rows
                    ],
                    suffix="%",
                    max_value=100,
                ),
            }
        ],
        tables=[
            {
                "title": "Classes by colour",
                "columns": ["Class", "Classes", "Red", "Amber", "Green", "Purple"],
                "rows": [
                    [
                        r["class_type_name"],
                        r["total_classes"],
                        r["red_count"],
                        r["amber_count"],
                        r["green_count"],
                        r["purple_count"],
                    ]
                    for r in rows
                ],
            }
        ]
        if rows
        else [],
    )


def _financial(reports: _Reports):
    data = reports.get("payroll")
    rows = data["instructor_breakdown"]
    return _section(
        "financial",
        stats=[
            ("Total payroll", f"${data['total_payroll']}"),
            ("Paid", f"${data['paid_amount']}"),
            ("Pending", f"${data['pending_amount']}"),
            ("Avg per instructor", f"${data['avg_per_instructor']}"),
        ],
        charts=[
            {
                "title": "Payroll by instructor",
                "svg": bar_chart_svg(
                    [
                        (r["instructor_name"], float(r["total_amount"]), None)
                        for r in rows
                    ]
                ),
            }
        ],
        tables=[
            {
                "title": "Invoices",
                "columns": ["Instructor", "Invoices", "Total", "Status"],
                "rows": [
                    [
                        r["instructor_name"],
                        r["invoice_count"],
                        f"${r['total_amount']}",
                        r["status"].replace("_", " "),
                    ]
                    for r in rows
                ],
            }
        ]
        if rows
        else [],
    )


def build_report(tenant, user, frequency: str, day: date, sections) -> dict:
    """Everything the export template needs for the period containing ``day``."""
    from apps.core.timezones import format_datetime

    start, end = period_bounds(frequency, day)
    reports = _Reports(tenant, user, start, end)
    builders = {
        "summary": _summary,
        "attendance": lambda r: _attendance(r, frequency),
        "classes": _classes,
        "instructors": _instructors,
        "viability": _viability,
        "financial": _financial,
    }
    built = []
    for key in SECTION_KEYS:
        if key not in sections:
            continue
        try:
            built.append(builders[key](reports))
        except SectionError as exc:
            built.append({**_section(key), "error": str(exc)})

    from django.utils import timezone

    return {
        "gym_name": tenant.name,
        "frequency": frequency,
        "title": f"{frequency.title()} report",
        "period": period_label(frequency, start, end),
        "start": start,
        "end": end,
        "generated_on": format_datetime(timezone.now(), tenant),
        "sections": built,
    }


def render_report_pdf(report: dict) -> bytes:
    from django.template.loader import render_to_string
    from weasyprint import HTML

    return HTML(
        string=render_to_string("reports/report_export.html", report)
    ).write_pdf()


def report_filename(report: dict) -> str:
    start, end = report["start"], report["end"]
    span = (
        f"{start:%Y-%m-%d}" if start == end else f"{start:%Y-%m-%d}_to_{end:%Y-%m-%d}"
    )
    return f"{report['frequency']}-report-{span}.pdf"
