"""
CI settings that run against a real MySQL server instead of SQLite.

Production is MySQL; SQLite accepts schema operations and queries that MySQL
rejects, so the "MySQL Schema Check" CI job migrates a fresh MySQL database
with these settings and runs the invoice-related tests on it.
"""
from decouple import config

from .ci import *  # noqa: F401, F403

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.mysql",
        "NAME": config("MYSQL_DATABASE", default="fitops"),
        "USER": config("MYSQL_USER", default="root"),
        "PASSWORD": config("MYSQL_PASSWORD", default="root"),
        "HOST": config("MYSQL_HOST", default="127.0.0.1"),
        "PORT": config("MYSQL_PORT", default="3306"),
        "OPTIONS": {
            "charset": "utf8mb4",
            "init_command": "SET sql_mode='STRICT_TRANS_TABLES'",
        },
        "TEST": {
            "CHARSET": "utf8mb4",
            "COLLATION": "utf8mb4_unicode_ci",
        },
    }
}
