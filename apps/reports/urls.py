from django.urls import path

from .class_filter import ReportClassFilterView
from .views import (
    AttendanceReportView,
    ClassesReportView,
    ClassViabilityReportView,
    CoverReportView,
    InstructorChartsReportView,
    InstructorReliabilityReportView,
    PayrollReportView,
    UnrecordedAttendanceReportView,
)

urlpatterns = [
    path("attendance/", AttendanceReportView.as_view(), name="report-attendance"),
    path("classes/", ClassesReportView.as_view(), name="report-classes"),
    path("instructor-reliability/", InstructorReliabilityReportView.as_view(), name="report-reliability"),
    path("instructor-charts/", InstructorChartsReportView.as_view(), name="report-instructor-charts"),
    path("payroll/", PayrollReportView.as_view(), name="report-payroll"),
    path("class-viability/", ClassViabilityReportView.as_view(), name="report-viability"),
    path("cover/", CoverReportView.as_view(), name="report-cover"),
    path("unrecorded/", UnrecordedAttendanceReportView.as_view(), name="report-unrecorded"),
    path("class-filter/", ReportClassFilterView.as_view(), name="report-class-filter"),
]
