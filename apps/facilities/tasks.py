import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name="facilities.run_checklists")
def run_checklists():
    """Every 15 minutes: create each gym's due checks, then alert key people
    about overdue ones (only within the gym's alert hours)."""
    from apps.tenants.models import Tenant

    from .checklists import alert_overdue_runs, create_due_runs

    created = alerted = 0
    for tenant in Tenant.objects.filter(is_active=True, settings__facilities_checklists_enabled=True):
        try:
            created += create_due_runs(tenant)
            alerted += alert_overdue_runs(tenant)
        except Exception:
            logger.exception("Checklist run failed for tenant %s", tenant.pk)
    return {"created": created, "alerted": alerted}
