import logging

from django.contrib.contenttypes.models import ContentType

logger = logging.getLogger(__name__)


def log_audit(user, action, obj, before_data=None, after_data=None, request=None):
    """
    Creates an AuditLog entry.  Accepts explicit parameters so it remains
    pure and testable without a live request object.
    """
    from apps.audit.models import AuditLog

    ip_address = None
    user_agent = None

    if request is not None:
        ip_address = _get_client_ip(request)
        user_agent = request.META.get("HTTP_USER_AGENT", "")[:512]

    content_type = ContentType.objects.get_for_model(obj)

    # Some actions are genuinely unauthenticated — a staff member accepting
    # cover from an emailed link authenticates with the accept_code, not a
    # session. Fall back to the object's own tenant so those still audit.
    tenant = user.tenant if user is not None else getattr(obj, "tenant", None)
    if tenant is None:
        logger.warning(
            "Skipping audit log for action=%s object=%s — no tenant to attribute it to",
            action,
            obj,
        )
        return

    try:
        AuditLog.objects.create(
            tenant=tenant,
            user=user,
            action=action,
            object_type=content_type.model,
            object_id=str(obj.pk),
            before_data=before_data or {},
            after_data=after_data or {},
            ip_address=ip_address,
            user_agent=user_agent or "",
        )
    except Exception:
        logger.exception("Failed to write audit log for action=%s object=%s", action, obj)


def _get_client_ip(request):
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")
