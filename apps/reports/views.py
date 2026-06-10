from collections import defaultdict
from datetime import date, timedelta

from django.db.models import Avg, Count, DecimalField, Q, Sum
from django.db.models.functions import Coalesce
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.attendance.models import AttendanceRecord
from apps.core.permissions import IsGymManager, IsPayroll
from apps.cover.models import CoverRequest
from apps.invoices.models import Invoice, PayRun
from apps.staff.models import StaffProfile
from apps.timetable.models import ClassType, TimetableEvent

PALETTE = [
    "#06b6d4", "#f97316", "#8b5cf6", "#ec4899", "#10b981",
    "#f59e0b", "#3b82f6", "#ef4444", "#84cc16", "#6366f1",
    "#14b8a6", "#f43f5e", "#a855f7", "#0ea5e9", "#22c55e",
]


def get_class_color(class_type):
    if class_type.color and class_type.color != "#6b7280":
        return class_type.color
    return PALETTE[class_type.id % len(PALETTE)]


def monday_of_week(d):
    """Return the Monday on or before the given date."""
    return d - timedelta(days=d.weekday())


def parse_date_params(request):
    """Parse from/to query params, defaulting to this month."""
    from_str = request.query_params.get("from")
    to_str = request.query_params.get("to")
    try:
        from_date = date.fromisoformat(from_str) if from_str else date.today().replace(day=1)
        to_date = date.fromisoformat(to_str) if to_str else date.today()
    except ValueError:
        return None, None, Response({"detail": "Invalid date format. Use YYYY-MM-DD."}, status=400)
    return from_date, to_date, None


DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

TIME_SLOTS = [
    ("Early (6-9am)", 6, 9),
    ("Morning (9-12pm)", 9, 12),
    ("Lunch (12-2pm)", 12, 14),
    ("Afternoon (2-5pm)", 14, 17),
    ("Evening (5-9pm)", 17, 21),
]


def slot_for_hour(hour):
    for label, start, end in TIME_SLOTS:
        if start <= hour < end:
            return label
    return None


class AttendanceReportView(APIView):
    """
    GET /api/v1/reports/attendance/?from=YYYY-MM-DD&to=YYYY-MM-DD[&class_type=<id>]
    """

    permission_classes = [IsGymManager]

    def get(self, request):
        from_date, to_date, error = parse_date_params(request)
        if error:
            return error

        class_type_id = request.query_params.get("class_type")

        event_qs = TimetableEvent.objects.filter(
            tenant=request.tenant,
            is_deleted=False,
            start_datetime__date__gte=from_date,
            start_datetime__date__lte=to_date,
        ).select_related("class_type", "site", "instructor", "attendance_record")

        if class_type_id:
            event_qs = event_qs.filter(class_type_id=class_type_id)

        events = list(event_qs.order_by("start_datetime"))

        total_classes = len(events)

        # Pre-build a mapping of event pk → attendance count for events that have a record.
        # Doing this once prevents the defaultdict pre-creation bug where accessing
        # `d[key]` before a DoesNotExist exception leaves an empty list in the dict.
        event_counts: dict[int, int] = {}
        for event in events:
            try:
                event_counts[event.pk] = event.attendance_record.count
            except AttendanceRecord.DoesNotExist:
                pass

        classes_with_attendance = len(event_counts)
        total_attendees = sum(event_counts.values())
        attendance_count_values = list(event_counts.values())
        avg_attendance = (
            round(sum(attendance_count_values) / len(attendance_count_values), 1)
            if attendance_count_values
            else 0.0
        )

        # --- daily_breakdown: all events, null attendance if no record ---
        daily_map: dict[str, list] = defaultdict(list)
        for event in events:
            daily_map[event.start_datetime.date().isoformat()].append({
                "event_id": event.id,
                "class_name": event.class_type.name,
                "time": event.start_datetime.strftime("%H:%M"),
                "instructor_name": event.instructor.name if event.instructor else None,
                "site_name": event.site.name if event.site else None,
                "attendance_count": event_counts.get(event.pk),
                "color": get_class_color(event.class_type),
            })

        daily_breakdown = [
            {"date": d, "events": sorted(daily_map[d], key=lambda e: e["time"])}
            for d in sorted(daily_map.keys())
        ]

        # --- weekly_trend ---
        week_attendance: dict[str, list] = defaultdict(list)
        week_class_count: dict[str, int] = defaultdict(int)
        for event in events:
            week_start = monday_of_week(event.start_datetime.date()).isoformat()
            week_class_count[week_start] += 1
            if event.pk in event_counts:
                week_attendance[week_start].append(event_counts[event.pk])

        all_weeks = sorted(week_class_count.keys())
        weekly_trend = [
            {
                "week_start": week,
                "avg_attendance": (
                    round(sum(week_attendance[week]) / len(week_attendance[week]), 1)
                    if week_attendance[week]
                    else 0.0
                ),
                "total_classes": week_class_count[week],
            }
            for week in all_weeks
        ]

        # --- by_class_type ---
        ct_attendance: dict[int, list] = defaultdict(list)
        ct_meta: dict[int, ClassType] = {}
        for event in events:
            if event.pk in event_counts:
                ct_attendance[event.class_type.id].append(event_counts[event.pk])
                ct_meta[event.class_type.id] = event.class_type

        by_class_type = [
            {
                "class_type_id": ct_id,
                "class_type_name": ct_meta[ct_id].name,
                "avg_attendance": round(sum(counts) / len(counts), 1),
                "color": get_class_color(ct_meta[ct_id]),
            }
            for ct_id, counts in ct_attendance.items()
            if counts
        ]
        by_class_type.sort(key=lambda x: x["avg_attendance"], reverse=True)

        # --- by_day_of_week ---
        dow_attendance: dict[int, list] = defaultdict(list)
        for event in events:
            if event.pk in event_counts:
                dow_attendance[event.start_datetime.weekday()].append(event_counts[event.pk])

        by_day_of_week = [
            {
                "day": DAY_NAMES[dow],
                "avg_attendance": round(sum(counts) / len(counts), 1),
            }
            for dow, counts in sorted(dow_attendance.items())
            if counts
        ]

        # --- by_time_slot ---
        slot_attendance: dict[str, list] = defaultdict(list)
        for event in events:
            slot = slot_for_hour(event.start_datetime.hour)
            if slot is not None and event.pk in event_counts:
                slot_attendance[slot].append(event_counts[event.pk])

        by_time_slot = [
            {
                "slot": label,
                "avg_attendance": round(sum(slot_attendance[label]) / len(slot_attendance[label]), 1),
            }
            for label, _, _ in TIME_SLOTS
            if slot_attendance[label]
        ]

        # --- class_log: events WITH attendance, most recent first ---
        class_log = [
            {
                "event_id": event.id,
                "class_name": event.class_type.name,
                "instructor_name": event.instructor.name if event.instructor else None,
                "site_name": event.site.name if event.site else None,
                "date": event.start_datetime.strftime("%a %-d %b"),
                "time": event.start_datetime.strftime("%H:%M"),
                "attendance_count": event_counts[event.pk],
                "color": get_class_color(event.class_type),
            }
            for event in sorted(events, key=lambda e: e.start_datetime, reverse=True)
            if event.pk in event_counts
        ]

        # --- class_type_weekly_trend ---
        ct_weekly: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(list))
        for event in events:
            if event.pk in event_counts:
                week_start = monday_of_week(event.start_datetime.date()).isoformat()
                ct_weekly[event.class_type.name][week_start].append(event_counts[event.pk])

        class_type_weekly_trend = {
            ct_name: [
                {
                    "week_start": week,
                    "avg_attendance": round(sum(counts) / len(counts), 1),
                }
                for week, counts in sorted(weeks.items())
            ]
            for ct_name, weeks in ct_weekly.items()
        }

        return Response({
            "from_date": from_date.isoformat(),
            "to_date": to_date.isoformat(),
            "total_classes": total_classes,
            "classes_with_attendance": classes_with_attendance,
            "avg_attendance": avg_attendance,
            "total_attendees": total_attendees,
            "daily_breakdown": daily_breakdown,
            "weekly_trend": weekly_trend,
            "by_class_type": by_class_type,
            "by_day_of_week": by_day_of_week,
            "by_time_slot": by_time_slot,
            "class_log": class_log,
            "class_type_weekly_trend": class_type_weekly_trend,
        })


class InstructorReliabilityReportView(APIView):
    """
    GET /api/v1/reports/instructor-reliability/?from=YYYY-MM-DD&to=YYYY-MM-DD
    """

    permission_classes = [IsGymManager]

    def get(self, request):
        from_date, to_date, error = parse_date_params(request)
        if error:
            return error

        date_filter = Q(
            events__is_deleted=False,
            events__start_datetime__date__gte=from_date,
            events__start_datetime__date__lte=to_date,
        )

        staff_qs = (
            StaffProfile.objects.filter(
                tenant=request.tenant,
                is_deleted=False,
                status=StaffProfile.Status.ACTIVE,
            )
            .annotate(
                total_classes=Count(
                    "events",
                    filter=date_filter,
                ),
                total_completed=Count(
                    "events",
                    filter=date_filter & Q(events__status=TimetableEvent.Status.COMPLETED),
                ),
                total_cancelled=Count(
                    "events",
                    filter=date_filter & Q(events__status=TimetableEvent.Status.CANCELLED),
                ),
            )
        )

        results = []
        for staff in staff_qs:
            if staff.total_classes == 0:
                continue

            completed = staff.total_completed
            cancelled = staff.total_cancelled
            denom = completed + cancelled
            reliability = (completed / denom * 100) if denom > 0 else 100.0

            # Average attendance from completed events in period
            avg_qs = AttendanceRecord.objects.filter(
                tenant=request.tenant,
                is_deleted=False,
                timetable_event__instructor=staff,
                timetable_event__start_datetime__date__gte=from_date,
                timetable_event__start_datetime__date__lte=to_date,
            ).aggregate(avg=Avg("count"))
            avg_attendance = round(float(avg_qs["avg"] or 0), 1)

            cover_requests_count = CoverRequest.objects.filter(
                tenant=request.tenant,
                absence__staff=staff,
            ).count()

            results.append({
                "instructor_id": staff.id,
                "instructor_name": staff.name,
                "total_classes": staff.total_classes,
                "avg_attendance": avg_attendance,
                "reliability_score": round(reliability, 1),
                "cover_requests_count": cover_requests_count,
            })

        results.sort(key=lambda r: r["reliability_score"], reverse=True)
        return Response(results)


class ClassesReportView(APIView):
    """
    GET /api/v1/reports/classes/?from=YYYY-MM-DD&to=YYYY-MM-DD
    """

    permission_classes = [IsGymManager]

    def get(self, request):
        from_date, to_date, error = parse_date_params(request)
        if error:
            return error

        class_types = ClassType.objects.filter(
            tenant=request.tenant,
            is_deleted=False,
            is_active=True,
        )

        results = []
        for class_type in class_types:
            all_events = TimetableEvent.objects.filter(
                tenant=request.tenant,
                is_deleted=False,
                class_type=class_type,
                start_datetime__date__gte=from_date,
                start_datetime__date__lte=to_date,
            )

            total_scheduled = all_events.count()
            if total_scheduled == 0:
                continue

            total_cancelled = all_events.filter(
                status=TimetableEvent.Status.CANCELLED
            ).count()

            attended_records = AttendanceRecord.objects.filter(
                tenant=request.tenant,
                is_deleted=False,
                timetable_event__class_type=class_type,
                timetable_event__start_datetime__date__gte=from_date,
                timetable_event__start_datetime__date__lte=to_date,
            )

            attended_counts = list(attended_records.values_list("count", flat=True))
            total_attended = len(attended_counts)
            avg_attendance = (
                round(sum(attended_counts) / total_attended, 1) if total_attended else 0.0
            )

            viable_count = sum(
                1 for c in attended_counts if c >= class_type.green_threshold
            )
            viability_percentage = (
                round(viable_count / total_attended * 100, 1) if total_attended else 0.0
            )

            cancellation_percentage = round(total_cancelled / total_scheduled * 100, 1)

            results.append({
                "class_type_id": class_type.id,
                "class_type_name": class_type.name,
                "total_classes": total_scheduled,
                "avg_attendance": avg_attendance,
                "viability_percentage": viability_percentage,
                "cancellation_percentage": cancellation_percentage,
                "color": get_class_color(class_type),
            })

        results.sort(key=lambda r: r["avg_attendance"], reverse=True)
        return Response(results)


class PayrollReportView(APIView):
    """
    GET /api/v1/reports/payroll/?from=YYYY-MM-DD&to=YYYY-MM-DD

    Returns payroll totals and per-instructor breakdown for the requested period.
    Defaults to the current month when no dates are provided.
    """

    permission_classes = [IsPayroll]

    def get(self, request):
        from_date, to_date, error = parse_date_params(request)
        if error:
            return error

        invoice_qs = Invoice.objects.filter(
            tenant=request.tenant,
            is_deleted=False,
            period_start__gte=from_date,
            period_start__lte=to_date,
        )

        instructor_id = request.query_params.get("instructor")
        if instructor_id:
            invoice_qs = invoice_qs.filter(instructor_id=instructor_id)

        totals = invoice_qs.aggregate(
            total=Coalesce(Sum("total_amount"), 0, output_field=DecimalField()),
            paid=Coalesce(
                Sum("total_amount", filter=Q(status=Invoice.Status.PAID)),
                0,
                output_field=DecimalField(),
            ),
        )
        grand_total = float(totals["total"])
        paid_total = float(totals["paid"])
        pending_total = grand_total - paid_total

        instructor_count = invoice_qs.values("instructor").distinct().count()
        avg_per_instructor = (
            round(grand_total / instructor_count, 2) if instructor_count else 0.0
        )

        # Month-by-month breakdown for the chart
        period_breakdown = [
            {
                "period": row["period_start"].strftime("%b %Y"),
                "amount": str(round(float(row["amount"]), 2)),
            }
            for row in invoice_qs
            .values("period_start")
            .annotate(amount=Coalesce(Sum("total_amount"), 0, output_field=DecimalField()))
            .order_by("period_start")
        ]

        # Per-instructor summary
        instructor_breakdown = [
            {
                "instructor_id": row["instructor__id"],
                "instructor_name": row["instructor__name"] or "Unknown",
                "invoice_count": row["invoice_count"],
                "total_amount": str(round(float(row["total_amount"]), 2)),
                "status": row["status"],
            }
            for row in invoice_qs
            .values("instructor__id", "instructor__name", "status")
            .annotate(
                invoice_count=Count("id"),
                total_amount=Coalesce(Sum("total_amount"), 0, output_field=DecimalField()),
            )
            .order_by("-total_amount")
        ]

        return Response({
            "total_payroll": str(round(grand_total, 2)),
            "paid_amount": str(round(paid_total, 2)),
            "pending_amount": str(round(pending_total, 2)),
            "avg_per_instructor": str(avg_per_instructor),
            "period_breakdown": period_breakdown,
            "instructor_breakdown": instructor_breakdown,
        })


class ClassViabilityReportView(APIView):
    """
    GET /api/v1/reports/class-viability/?from=YYYY-MM-DD&to=YYYY-MM-DD

    When no date params are provided, returns all-time data so the overview
    tab is always populated.
    """

    permission_classes = [IsGymManager]

    def get(self, request):
        from_str = request.query_params.get("from")
        to_str = request.query_params.get("to")

        date_filter: Q = Q()
        if from_str:
            try:
                date_filter &= Q(timetable_event__start_datetime__date__gte=date.fromisoformat(from_str))
            except ValueError:
                return Response({"detail": "Invalid 'from' date."}, status=400)
        if to_str:
            try:
                date_filter &= Q(timetable_event__start_datetime__date__lte=date.fromisoformat(to_str))
            except ValueError:
                return Response({"detail": "Invalid 'to' date."}, status=400)

        class_types = ClassType.objects.filter(
            tenant=request.tenant, is_deleted=False, is_active=True
        )

        results = []
        for class_type in class_types:
            counts = list(
                AttendanceRecord.objects.filter(
                    Q(tenant=request.tenant, is_deleted=False, timetable_event__class_type=class_type)
                    & date_filter
                ).values_list("count", flat=True)
            )

            total = len(counts)
            avg_attendance = round(sum(counts) / total, 1) if total else 0.0

            red = amber = green = purple = 0
            for c in counts:
                if c >= class_type.purple_threshold:
                    purple += 1
                elif c >= class_type.green_threshold:
                    green += 1
                elif c >= class_type.amber_threshold:
                    amber += 1
                elif c >= class_type.red_threshold:
                    red += 1
                # counts below red_threshold are simply not viable — not bucketed

            viable = green + purple
            viability_percentage = round(viable / total * 100, 1) if total else 0.0

            results.append({
                "class_type_id": class_type.pk,
                "class_type_name": class_type.name,
                "total_classes": total,
                "avg_attendance": avg_attendance,
                "viability_percentage": viability_percentage,
                "red_count": red,
                "amber_count": amber,
                "green_count": green,
                "purple_count": purple,
            })

        return Response(results)


class CoverReportView(APIView):
    """
    GET /api/v1/reports/cover/
    """

    permission_classes = [IsGymManager]

    def get(self, request):
        from_date, to_date, error = parse_date_params(request)
        if error:
            return error

        base_filter = dict(
            tenant=request.tenant,
            is_deleted=False,
            created_at__date__gte=from_date,
            created_at__date__lte=to_date,
        )

        by_status = (
            CoverRequest.objects.filter(**base_filter)
            .values("status")
            .annotate(count=Count("id"))
            .order_by("status")
        )

        by_urgency = (
            CoverRequest.objects.filter(**base_filter)
            .values("urgency")
            .annotate(count=Count("id"))
            .order_by("urgency")
        )

        return Response({
            "from_date": from_date,
            "to_date": to_date,
            "by_status": list(by_status),
            "by_urgency": list(by_urgency),
        })
