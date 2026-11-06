"""
The "MySQL Tests" CI job exists to run migrations and tests on what
production runs: MySQL 8 (docker-compose.prod.yml). Some migrations have a
MySQL-8-only branch (tenants.0013) that SQLite and MariaDB never execute, so
if the job's settings or image ever slipped to one of those it would pass
without testing anything. The job sets CI_EXPECT_DATABASE=mysql8 to make
this test check that it really is MySQL 8.
"""

import os

import pytest
from django.db import connection

EXPECTED = os.environ.get("CI_EXPECT_DATABASE", "")


@pytest.mark.skipif(EXPECTED != "mysql8", reason="only in the MySQL CI job")
@pytest.mark.django_db
def test_the_mysql_job_really_runs_on_mysql_8():
    assert connection.vendor == "mysql"
    assert not connection.mysql_is_mariadb
    # 0013's hand-written JSON default needs 8.0.13+ (expression defaults).
    assert connection.mysql_version >= (8, 0, 13)
