from django.urls import path

from .views import (
    AttendanceReportView,
    ClassesReportView,
    ClassViabilityReportView,
    CoverReportView,
    InstructorChartsReportView,
    InstructorReliabilityReportView,
    PayrollReportView,
)

urlpatterns = [
    path("attendance/", AttendanceReportView.as_view(), name="report-attendance"),
    path("classes/", ClassesReportView.as_view(), name="report-classes"),
    path("instructor-reliability/", InstructorReliabilityReportView.as_view(), name="report-reliability"),
    path("instructor-charts/", InstructorChartsReportView.as_view(), name="report-instructor-charts"),
    path("payroll/", PayrollReportView.as_view(), name="report-payroll"),
    path("class-viability/", ClassViabilityReportView.as_view(), name="report-viability"),
    path("cover/", CoverReportView.as_view(), name="report-cover"),
]
