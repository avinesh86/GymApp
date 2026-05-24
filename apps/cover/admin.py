from django.contrib import admin
from .models import Absence, CoverRequest, CoverOffer, CoverResponse


@admin.register(Absence)
class AbsenceAdmin(admin.ModelAdmin):
    list_display = ['staff', 'reason', 'reported_at']
    search_fields = ['staff__name']


@admin.register(CoverRequest)
class CoverRequestAdmin(admin.ModelAdmin):
    list_display = ['timetable_event', 'status', 'urgency', 'bonus_amount', 'tenant']
    list_filter = ['status', 'urgency', 'tenant']
    search_fields = ['timetable_event__class_type__name']


@admin.register(CoverOffer)
class CoverOfferAdmin(admin.ModelAdmin):
    list_display = ['cover_request', 'staff', 'status', 'offered_at', 'responded_at']
    list_filter = ['status']
    search_fields = ['staff__name']


@admin.register(CoverResponse)
class CoverResponseAdmin(admin.ModelAdmin):
    list_display = ['cover_offer', 'action', 'responded_at']
