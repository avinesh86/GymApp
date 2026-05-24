from django.contrib import admin
from .models import Notification, NotificationPreference


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ['recipient', 'notification_type', 'created_at']
    list_filter = ['notification_type']
    search_fields = ['recipient__email']


@admin.register(NotificationPreference)
class NotificationPreferenceAdmin(admin.ModelAdmin):
    list_display = ['staff', 'notification_type', 'in_app', 'email', 'whatsapp']
    search_fields = ['staff__name']
