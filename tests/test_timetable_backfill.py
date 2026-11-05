"""
Adding classes that already happened.

A recurring class added with a start date in the past must fill in its past
sessions too, so they show on the timetable and count in reports — not only
the sessions from today on.
"""

from datetime import time, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.core.timezones import local_today
from apps.timetable.models import RecurringTimetableRule, TimetableEvent
from apps.timetable.views import RecurringTimetableRuleViewSet
from tests.factories import SiteFactory, TenantSettingsFactory

pytestmark = pytest.mark.django_db

NZ = "Pacific/Auckland"


def _generate(tenant, user, rule):
    request = APIRequestFactory().post(
        f"/api/v1/timetable/recurring-rules/{rule.pk}/generate/"
    )
    request.tenant = tenant
    force_authenticate(request, user=user)
    return RecurringTimetableRuleViewSet.as_view({"post": "generate"})(
        request, pk=rule.pk
    )


def test_generate_backfills_past_sessions(tenant, admin_user, class_type):
    TenantSettingsFactory(tenant=tenant, timezone=NZ)
    today = local_today(tenant)
    four_weeks_ago = today - timedelta(weeks=4)
    rule = RecurringTimetableRule.objects.create(
        tenant=tenant,
        class_type=class_type,
        site=SiteFactory(tenant=tenant),
        day_of_week=four_weeks_ago.weekday(),
        start_time=time(9, 0),
        end_time=time(10, 0),
        valid_from=four_weeks_ago,
        valid_to=today - timedelta(days=1),
        created_by=admin_user,
        updated_by=admin_user,
    )

    response = _generate(tenant, admin_user, rule)

    assert response.status_code == 200
    days = sorted(
        timezone.localtime(e.start_datetime, ZoneInfo(NZ)).date()
        for e in TimetableEvent.objects.filter(recurring_rule=rule)
    )
    assert days == [four_weeks_ago + timedelta(weeks=w) for w in range(4)]
    assert response.data["created"] == 4
