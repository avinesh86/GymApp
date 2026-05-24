from django.urls import path

from .public_views import TenantSignupView

urlpatterns = [
    path("signup/", TenantSignupView.as_view(), name="tenant-signup"),
]
