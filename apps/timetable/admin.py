from django.contrib import admin
from .models import ClassType, ClassBonus, RecurringTimetableRule, TimetableEvent


@admin.register(ClassType)
class ClassTypeAdmin(admin.ModelAdmin):
    list_display = ['name', 'duration_minutes', 'is_active', 'tenant']
    list_filter = ['is_active', 'tenant']
    search_fields = ['name']


@admin.register(TimetableEvent)
class TimetableEventAdmin(admin.ModelAdmin):
    list_display = ['class_type', 'instructor', 'site', 'start_datetime', 'status', 'tenant']
    list_filter = ['status', 'site', 'tenant']
    search_fields = ['class_type__name', 'instructor__name']
    date_hierarchy = 'start_datetime'


@admin.register(ClassBonus)
class ClassBonusAdmin(admin.ModelAdmin):
    list_display = ['class_type', 'threshold_type', 'bonus_amount', 'tenant']
    list_filter = ['tenant']


@admin.register(RecurringTimetableRule)
class RecurringTimetableRuleAdmin(admin.ModelAdmin):
    list_display = ['class_type', 'instructor', 'site', 'day_of_week', 'start_time', 'is_active']
    list_filter = ['day_of_week', 'is_active', 'tenant']
    search_fields = ['class_type__name', 'instructor__name']
