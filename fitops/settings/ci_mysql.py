"""
CI settings that run against a real MySQL server instead of SQLite.

Production is MySQL 8; SQLite accepts schema operations and queries that
MySQL rejects, so the "MySQL Tests" CI job migrates a fresh MySQL 8 database
with these settings and runs the migration, rollback and invoice tests on it.
Connection options match production's (base.py).
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
        # No COLLATION: like production, use MySQL 8's default for utf8mb4.
        "TEST": {
            "CHARSET": "utf8mb4",
        },
    }
}
