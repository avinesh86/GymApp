from decouple import config

from .base import *  # noqa: F401, F403

DEBUG = False

ALLOWED_HOSTS = config("ALLOWED_HOSTS", default="").split(",")

# Django 4.x requires the Origin of any unsafe request to be listed here when
# the request arrives over HTTPS.  Without it the /platform-admin/ login and
# any session-authenticated POST fail with "CSRF verification failed —
# Origin checking failed" as soon as TLS is terminated upstream.
# Must include the scheme, e.g. https://fitops.northernarena.co.nz
CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in config("CSRF_TRUSTED_ORIGINS", default="").split(",")
    if origin.strip()
]

# Security — SSL terminated by upstream nginx; tell Django the original scheme
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = config("SECURE_SSL_REDIRECT", default=True, cast=bool)
SECURE_HSTS_SECONDS = 31536000
# includeSubDomains only ever covers the host that served the header and the
# names beneath it.  Served from a subdomain such as fitops.northernarena.co.nz
# it cannot affect the marketing site at the apex or on www.  If this app is
# ever moved to the apex, revisit: the header would then force HTTPS on every
# sibling subdomain for a year, breaking any that lacks a valid certificate.
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SESSION_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_SECURE = True
X_FRAME_OPTIONS = "DENY"

# SMTP in production
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"

# Static / Media via S3 in production (optional — configure if AWS vars are set)
AWS_ACCESS_KEY_ID = config("AWS_ACCESS_KEY_ID", default="")
if AWS_ACCESS_KEY_ID:
    DEFAULT_FILE_STORAGE = "storages.backends.s3boto3.S3Boto3Storage"
    STATICFILES_STORAGE = "storages.backends.s3boto3.S3StaticStorage"
    AWS_SECRET_ACCESS_KEY = config("AWS_SECRET_ACCESS_KEY")
    AWS_STORAGE_BUCKET_NAME = config("AWS_STORAGE_BUCKET_NAME")
    AWS_S3_REGION_NAME = config("AWS_S3_REGION_NAME", default="ap-southeast-2")
    AWS_S3_CUSTOM_DOMAIN = f"{AWS_STORAGE_BUCKET_NAME}.s3.amazonaws.com"
    MEDIA_URL = f"https://{AWS_S3_CUSTOM_DOMAIN}/media/"
    STATIC_URL = f"https://{AWS_S3_CUSTOM_DOMAIN}/static/"

# Sentry
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
