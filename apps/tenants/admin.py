from django.contrib import admin
from .models import Tenant, TenantDomain, TenantBranding, TenantSettings, Site


class TenantDomainInline(admin.TabularInline):
    model = TenantDomain
    extra = 0


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug', 'is_active', 'created_at']
    list_filter = ['is_active']
    search_fields = ['name', 'slug']
    inlines = [TenantDomainInline]


@admin.register(TenantBranding)
class TenantBrandingAdmin(admin.ModelAdmin):
    list_display = ['tenant', 'app_name', 'primary_color']
    search_fields = ['tenant__name', 'app_name']


@admin.register(TenantSettings)
class TenantSettingsAdmin(admin.ModelAdmin):
    list_display = ['tenant', 'invoice_frequency', 'timezone', 'payroll_approval_required']
    list_filter = ['invoice_frequency', 'payroll_approval_required']


@admin.register(Site)
class SiteAdmin(admin.ModelAdmin):
    list_display = ['name', 'tenant', 'address', 'is_active']
    list_filter = ['is_active', 'tenant']
    search_fields = ['name']
