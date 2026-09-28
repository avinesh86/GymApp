"""
CI-specific Django settings.

Uses SQLite for fast, zero-dependency test runs in GitHub Actions.
No Redis, no Celery broker, no external services required.
"""
from decouple import config

from .base import *  # noqa: F401, F403

DEBUG = False

SECRET_KEY = "ci-test-secret-key-not-for-production"

ALLOWED_HOSTS = ["*"]

# ─── SQLite for CI (no MySQL service needed) ─────────────────────────────────
# In-memory by default, which is right for the test runner. The UI tests need
# a file instead: they migrate in one process and serve from another, and an
# in-memory database dies with the process that made it.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": config("CI_SQLITE_PATH", default=":memory:"),
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
# Must be a real Fernet key: 32 bytes, url-safe base64. The previous value was
# base64-encoded twice, so it decoded to 33 bytes and Fernet rejected it —
# every test that stored an encrypted field failed with "Fernet key must be 32
# url-safe base64-encoded bytes", and no test could exercise encryption at all.
FIELD_ENCRYPTION_KEY = "Zml0b3BzLWNpLXRlc3Qta2V5LTMyLWJ5dGVzLWxvbmc="

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
