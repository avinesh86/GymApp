from django.contrib import admin
from .models import AttendanceRecord, QRAttendanceToken


@admin.register(AttendanceRecord)
class AttendanceRecordAdmin(admin.ModelAdmin):
    list_display = ['timetable_event', 'count', 'recorded_by', 'recorded_at', 'is_verified']
    list_filter = ['is_verified']
    search_fields = ['timetable_event__class_type__name']
    date_hierarchy = 'recorded_at'


@admin.register(QRAttendanceToken)
class QRAttendanceTokenAdmin(admin.ModelAdmin):
    list_display = ['timetable_event', 'token', 'expires_at', 'is_used']
    list_filter = ['is_used']
    search_fields = ['token']
