from .base import *  # noqa: F401, F403

DEBUG = True

ALLOWED_HOSTS = ["*"]

# In dev allow all origins
CORS_ALLOW_ALL_ORIGINS = True

# Email backend — honour EMAIL_BACKEND from .env so real SMTP works in dev.
# Falls back to console if not explicitly set.
from decouple import config as _config  # noqa: E402
EMAIL_BACKEND = _config(
    "EMAIL_BACKEND",
    default="django.core.mail.backends.console.EmailBackend",
)

# Disable HTTPS requirements in development
SECURE_SSL_REDIRECT = False
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False

# Show detailed errors
TEMPLATES[0]["OPTIONS"]["debug"] = True  # noqa: F405

# Django Extensions
INSTALLED_APPS += ["django_extensions"]  # noqa: F405
