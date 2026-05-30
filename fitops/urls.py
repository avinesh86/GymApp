from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework_simplejwt.views import TokenRefreshView, TokenVerifyView

from apps.users.jwt_views import TenantTokenObtainPairView

urlpatterns = [
    # Platform admin (internal use only — never share this URL with customers)
    path("platform-admin/", admin.site.urls),
    # Auth
    path("api/v1/auth/token/", TenantTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/v1/auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/v1/auth/token/verify/", TokenVerifyView.as_view(), name="token_verify"),
    # Public routes (no tenant middleware)
    path("api/v1/public/", include("apps.tenants.public_urls")),
    # App routes
    path("api/v1/tenants/", include("apps.tenants.urls")),
    path("api/v1/users/", include("apps.users.urls")),
    path("api/v1/staff/", include("apps.staff.urls")),
    path("api/v1/timetable/", include("apps.timetable.urls")),
    path("api/v1/attendance/", include("apps.attendance.urls")),
    path("api/v1/cover/", include("apps.cover.urls")),
    path("api/v1/whatsapp/", include("apps.whatsapp.urls")),
    path("api/v1/invoices/", include("apps.invoices.urls")),
    path("api/v1/notifications/", include("apps.notifications.urls")),
    path("api/v1/reports/", include("apps.reports.urls")),
    path("api/v1/imports/", include("apps.imports.urls")),
    path("api/v1/audit/", include("apps.audit.urls")),
    # API Schema
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
