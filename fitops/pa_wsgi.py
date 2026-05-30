"""
WSGI config for PythonAnywhere deployment.

Point your PA web-app WSGI file to this module:
    /home/<username>/GymApp/fitops/pa_wsgi.py

PA adds the project directory to sys.path automatically via the
"Source code" and "Working directory" fields in the web-app config.
"""
import os
import sys

# ─── Path setup ──────────────────────────────────────────────────────────────
# Ensure the project root is on sys.path so Django can find the fitops package.
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

# If you use a virtualenv, uncomment and adjust:
# virtualenv_path = f"/home/{os.environ.get('PA_USERNAME', 'yourusername')}/.virtualenvs/fitops/lib/python3.12/site-packages"
# if virtualenv_path not in sys.path:
#     sys.path.insert(0, virtualenv_path)

# ─── Django settings ─────────────────────────────────────────────────────────
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "fitops.settings.pythonanywhere")

# Load environment variables from .env file (PythonAnywhere doesn't use
# docker-compose so env vars must come from the .env file).
from pathlib import Path

env_file = Path(project_root) / ".env"
if env_file.exists():
    from decouple import Config, RepositoryEnv

    env_config = Config(RepositoryEnv(str(env_file)))
    # Export critical vars that decouple will pick up via os.environ
    for key in [
        "DJANGO_SECRET_KEY",
        "MYSQL_DATABASE",
        "MYSQL_USER",
        "MYSQL_PASSWORD",
        "MYSQL_HOST",
        "PA_USERNAME",
        "ALLOWED_HOSTS",
        "FIELD_ENCRYPTION_KEY",
        "STRIPE_SECRET_KEY",
        "STRIPE_PUBLISHABLE_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "EMAIL_HOST",
        "EMAIL_PORT",
        "EMAIL_HOST_USER",
        "EMAIL_HOST_PASSWORD",
        "DEFAULT_FROM_EMAIL",
        "META_APP_SECRET",
        "SENTRY_DSN",
        "CORS_ALLOWED_ORIGINS",
        "FRONTEND_URL",
    ]:
        try:
            val = env_config(key, default="")
            if val:
                os.environ[key] = val
        except Exception:
            pass

from django.core.wsgi import get_wsgi_application

application = get_wsgi_application()
