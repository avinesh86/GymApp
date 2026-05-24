from django.db import models


class AuditLog(models.Model):
    """
    Immutable audit trail.  Not inheriting TenantAwareModel so it never
    gets soft-deleted or modified — these are append-only records.
    """

    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.CASCADE,
        db_index=True,
    )
    user = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="audit_logs",
    )
    action = models.CharField(max_length=100, db_index=True)
    object_type = models.CharField(max_length=100, db_index=True)
    object_id = models.CharField(max_length=50, db_index=True)
    before_data = models.JSONField(default=dict)
    after_data = models.JSONField(default=dict)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=512, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "audit_log"
        indexes = [
            models.Index(fields=["tenant", "object_type", "object_id"]),
            models.Index(fields=["tenant", "user", "created_at"]),
        ]
        ordering = ["-created_at"]

    def __str__(self):
        return f"AuditLog {self.action} on {self.object_type}:{self.object_id} by {self.user_id}"
