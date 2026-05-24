from django.db import models


class TenantAwareModel(models.Model):
    """
    Abstract base for every business model.

    Every subclass carries the tenant foreign key plus standard audit fields
    so that multi-tenant scoping, soft-delete, and audit trail are uniform
    across the entire codebase.
    """

    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.CASCADE,
        db_index=True,
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        "users.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    updated_by = models.ForeignKey(
        "users.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    is_deleted = models.BooleanField(default=False, db_index=True)

    class Meta:
        abstract = True

    def soft_delete(self, deleted_by=None):
        self.is_deleted = True
        if deleted_by:
            self.updated_by = deleted_by
        self.save(update_fields=["is_deleted", "updated_by", "updated_at"])
