"""
CI-specific Django settings.

Uses SQLite for fast, zero-dependency test runs in GitHub Actions.
No Redis, no Celery broker, no external services required.
"""
from .base import *  # noqa: F401, F403

DEBUG = False

SECRET_KEY = "ci-test-secret-key-not-for-production"

ALLOWED_HOSTS = ["*"]

# ─── SQLite for CI (no MySQL service needed) ─────────────────────────────────
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
        "TEST": {
            "NAME": ":memory:",
        },
    }
}

# ─── Celery: run tasks synchronously ─────────────────────────────────────────
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True
CELERY_BROKER_URL = "memory://"
CELERY_RESULT_BACKEND = "django-db"

# ─── Email: capture in memory ────────────────────────────────────────────────
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

# ─── Encryption key (test-only) ─────────────────────────────────────────────
FIELD_ENCRYPTION_KEY = "RFhRaklBYlZJVWRfZm50RmhzUWVLYkhKdGxfX0Y1RGM9"

# ─── Stripe (test mode — no real calls) ─────────────────────────────────────
STRIPE_SECRET_KEY = ""
STRIPE_PUBLISHABLE_KEY = ""
STRIPE_WEBHOOK_SECRET = ""

# ─── CORS ─────────────────────────────────────────────────────────────────────
CORS_ALLOW_ALL_ORIGINS = True

# ─── Password hashing: use fast hasher for tests ─────────────────────────────
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.MD5PasswordHasher",
]

# ─── Logging: reduce noise during test runs ──────────────────────────────────
LOGGING = {
    "version": 1,
    "disable_existing_loggers": True,
    "handlers": {
        "null": {
            "class": "logging.NullHandler",
        },
    },
    "root": {
        "handlers": ["null"],
        "level": "CRITICAL",
    },
}
