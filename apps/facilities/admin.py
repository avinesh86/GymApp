from django.contrib import admin

from .models import Equipment, FaultReport


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
