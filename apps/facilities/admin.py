from django.contrib import admin

from .models import ChecklistItem, ChecklistRun, ChecklistTemplate, Equipment, FaultReport


@admin.register(Equipment)
class EquipmentAdmin(admin.ModelAdmin):
    list_display = ("name", "tenant", "site", "category", "status")
    list_filter = ("status", "category")
    search_fields = ("name", "serial_number", "asset_tag")


@admin.register(FaultReport)
class FaultReportAdmin(admin.ModelAdmin):
    list_display = ("title", "tenant", "equipment", "severity", "status", "created_at")
    list_filter = ("status", "severity")
    search_fields = ("title",)


class ChecklistItemInline(admin.TabularInline):
    model = ChecklistItem
    extra = 0


@admin.register(ChecklistTemplate)
class ChecklistTemplateAdmin(admin.ModelAdmin):
    list_display = ("name", "tenant", "site", "frequency", "due_time", "is_active")
    list_filter = ("frequency", "category", "is_active")
    inlines = [ChecklistItemInline]


@admin.register(ChecklistRun)
class ChecklistRunAdmin(admin.ModelAdmin):
    list_display = ("template", "tenant", "due_date", "due_at", "completed_at", "completed_by")
    list_filter = ("due_date",)
