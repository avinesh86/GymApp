from django.contrib import admin
from .models import Invoice, InvoiceLineItem, InvoiceApproval, PayrollBatch, PayRun


class InvoiceLineItemInline(admin.TabularInline):
    model = InvoiceLineItem
    extra = 0
    readonly_fields = ['amount']


class InvoiceApprovalInline(admin.TabularInline):
    model = InvoiceApproval
    extra = 0
    readonly_fields = ['approved_at']


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ['invoice_number', 'instructor', 'period_start', 'period_end', 'status', 'total_amount', 'tenant']
    list_filter = ['status', 'tenant']
    search_fields = ['invoice_number', 'instructor__name']
    date_hierarchy = 'period_start'
    inlines = [InvoiceLineItemInline, InvoiceApprovalInline]


@admin.register(InvoiceLineItem)
class InvoiceLineItemAdmin(admin.ModelAdmin):
    list_display = ['invoice', 'timetable_event', 'amount', 'is_bonus', 'is_manual_adjustment']
    list_filter = ['is_bonus', 'is_manual_adjustment']
    search_fields = ['invoice__invoice_number']


@admin.register(PayrollBatch)
class PayrollBatchAdmin(admin.ModelAdmin):
    list_display = ['period_start', 'period_end', 'status', 'tenant']
    list_filter = ['status', 'tenant']


@admin.register(PayRun)
class PayRunAdmin(admin.ModelAdmin):
    list_display = ['payroll_batch', 'invoice', 'amount_paid', 'payment_date']
    search_fields = ['invoice__invoice_number']
