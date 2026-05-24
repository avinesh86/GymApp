from django.contrib import admin
from .models import (
    StaffProfile, StaffQualification, StaffClassTypeCapability,
    StaffAvailability, StaffPayRate, StaffPayRateOverride, PaymentDetails,
)


class StaffQualificationInline(admin.TabularInline):
    model = StaffQualification
    extra = 0


class StaffPayRateInline(admin.TabularInline):
    model = StaffPayRate
    extra = 0


class StaffCapabilityInline(admin.TabularInline):
    model = StaffClassTypeCapability
    extra = 0


class StaffAvailabilityInline(admin.TabularInline):
    model = StaffAvailability
    extra = 0


@admin.register(StaffProfile)
class StaffProfileAdmin(admin.ModelAdmin):
    list_display = ['name', 'email', 'role', 'status', 'reliability_score', 'tenant']
    list_filter = ['role', 'status', 'tenant']
    search_fields = ['name', 'email']
    inlines = [StaffQualificationInline, StaffPayRateInline, StaffCapabilityInline, StaffAvailabilityInline]


@admin.register(StaffPayRate)
class StaffPayRateAdmin(admin.ModelAdmin):
    list_display = ['staff', 'amount', 'rate_type', 'effective_from', 'effective_to']
    list_filter = ['rate_type']
    search_fields = ['staff__name']


@admin.register(StaffPayRateOverride)
class StaffPayRateOverrideAdmin(admin.ModelAdmin):
    list_display = ['staff', 'class_type', 'site', 'amount', 'effective_from']
    search_fields = ['staff__name']


@admin.register(PaymentDetails)
class PaymentDetailsAdmin(admin.ModelAdmin):
    list_display = ['staff', 'bank_name', 'account_number', 'account_name']
    search_fields = ['staff__name', 'account_name']
