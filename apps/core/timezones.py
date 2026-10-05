"""Rendering stored UTC datetimes in a gym's own local time.

Every datetime is stored as UTC (USE_TZ=True, TIME_ZONE="UTC"). Anything a
person reads — an email, a WhatsApp message, a report, a QR screen — has to be
converted first, or a 9pm Auckland class is announced as 09:00, and a 9am one
is announced on the wrong day.
"""

import logging
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.conf import settings
from django.utils import timezone as djtz

logger = logging.getLogger(__name__)


def tenant_timezone(tenant) -> ZoneInfo:
    """The gym's configured timezone, falling back to the project default."""
    # The reverse one-to-one raises AttributeError when settings were never
    # created, so the nested getattr covers that.
    name = getattr(getattr(tenant, "settings", None), "timezone", "") or settings.TIME_ZONE
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        logger.warning(
            "Tenant %s has unknown timezone %r — falling back to %s",
            getattr(tenant, "pk", "?"),
            name,
            settings.TIME_ZONE,
        )
        return ZoneInfo(settings.TIME_ZONE)


def to_tenant_local(value, tenant):
    """A stored UTC datetime as local wall-clock time for ``tenant``."""
    return djtz.localtime(value, tenant_timezone(tenant))


def format_for_tenant(value, tenant, fmt: str) -> str:
    """``strftime`` in the gym's local time. Use this for anything a person reads."""
    return to_tenant_local(value, tenant).strftime(fmt)


def local_day_bounds(tenant, from_date, to_date):
    """UTC-aware ``[start, end)`` covering ``from_date``..``to_date`` (inclusive)
    as calendar days in the gym's local time.

    Filtering with ``start_datetime__date`` compares UTC dates, so a 5:15am
    Auckland class (16:15 UTC the day before) falls outside its own day.
    """
    tz = tenant_timezone(tenant)
    start = datetime.combine(from_date, time.min, tzinfo=tz)
    end = datetime.combine(to_date + timedelta(days=1), time.min, tzinfo=tz)
    return start, end
