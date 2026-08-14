from django.urls import path

from apps.core.health_views import HealthCheckView
from apps.users.public_views import (
    RequestPasswordResetView,
    SetPasswordView,
    ValidateInviteView,
)

from .public_views import TenantSignupView

urlpatterns = [
    path("health/", HealthCheckView.as_view(), name="health-check"),
    path("signup/", TenantSignupView.as_view(), name="tenant-signup"),
    path("set-password/", SetPasswordView.as_view(), name="set-password"),
    path("set-password/validate/", ValidateInviteView.as_view(), name="set-password-validate"),
    path("password-reset/", RequestPasswordResetView.as_view(), name="password-reset"),
]
