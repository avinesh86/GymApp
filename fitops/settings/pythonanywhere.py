"""
PythonAnywhere-specific Django settings.

Differences from prod.py:
- MySQL uses PA's host format (username.mysql.pythonanywhere-services.com)
- Static files via WhiteNoise (PA serves static from /static/ mapping)
- Celery disabled — tasks run synchronously or via PA scheduled tasks
- Frontend React build served by Django catch-all view
"""
from decouple import config

from .base import *  # noqa: F401, F403

DEBUG = False

# PA username — used to build paths and MySQL host
PA_USERNAME = config("PA_USERNAME", default="")

ALLOWED_HOSTS = config(
    "ALLOWED_HOSTS",
    default=f"{PA_USERNAME}.pythonanywhere.com",
).split(",")

# ─── Database ────────────────────────────────────────────────────────────────
# PythonAnywhere MySQL: host = <username>.mysql.pythonanywhere-services.com
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.mysql",
        "NAME": config("MYSQL_DATABASE", default=f"{PA_USERNAME}$fitops"),
        "USER": config("MYSQL_USER", default=PA_USERNAME),
        "PASSWORD": config("MYSQL_PASSWORD"),
        "HOST": config(
            "MYSQL_HOST",
            default=f"{PA_USERNAME}.mysql.pythonanywhere-services.com",
        ),
        "PORT": config("MYSQL_PORT", default="3306"),
        "OPTIONS": {
            "charset": "utf8mb4",
            "init_command": "SET sql_mode='STRICT_TRANS_TABLES'",
        },
    }
}

# ─── Security ────────────────────────────────────────────────────────────────
SECURE_SSL_REDIRECT = False  # PA handles HTTPS at the proxy level
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SESSION_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_SECURE = True
X_FRAME_OPTIONS = "DENY"

# ─── Static files (WhiteNoise) ───────────────────────────────────────────────
MIDDLEWARE.insert(1, "whitenoise.middleware.WhiteNoiseMiddleware")  # noqa: F405
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

# React build output served as static files
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"  # noqa: F405

# Add React dist as an additional static file directory
_react_dist = BASE_DIR / "frontend" / "dist"  # noqa: F405
STATICFILES_DIRS = [_react_dist] if _react_dist.exists() else []

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"  # noqa: F405

# ─── CORS ────────────────────────────────────────────────────────────────────
# Same-origin when Django serves the frontend
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = config(
    "CORS_ALLOWED_ORIGINS",
    default=f"https://{PA_USERNAME}.pythonanywhere.com",
).split(",")
CORS_ALLOW_CREDENTIALS = True

# ─── Email ───────────────────────────────────────────────────────────────────
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"

# ─── Celery disabled on PythonAnywhere ───────────────────────────────────────
# Tasks call .delay() / .apply_async() — make them run synchronously.
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True
# Broker URL set to a dummy to prevent connection attempts
CELERY_BROKER_URL = "memory://"
CELERY_RESULT_BACKEND = "django-db"

# ─── Sentry (optional) ──────────────────────────────────────────────────────
SENTRY_DSN = config("SENTRY_DSN", default="")
if SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.django import DjangoIntegration

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[DjangoIntegration()],
        traces_sample_rate=0.1,
        send_default_pii=False,
    )

# ─── Stripe ──────────────────────────────────────────────────────────────────
STRIPE_SECRET_KEY = config("STRIPE_SECRET_KEY", default="")
STRIPE_PUBLISHABLE_KEY = config("STRIPE_PUBLISHABLE_KEY", default="")
STRIPE_WEBHOOK_SECRET = config("STRIPE_WEBHOOK_SECRET", default="")

# ─── Frontend URL (for email links) ─────────────────────────────────────────
FRONTEND_URL = config(
    "FRONTEND_URL",
    default=f"https://{PA_USERNAME}.pythonanywhere.com",
)
