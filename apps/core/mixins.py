class TenantScopedMixin:
    """
    Mixin for DRF ViewSets/GenericViews that automatically scopes every
    queryset to the current tenant and injects tenant + user into
    serializer save calls.
    """

    def get_queryset(self):
        qs = super().get_queryset()
        return qs.filter(tenant=self.request.tenant, is_deleted=False)

    def perform_create(self, serializer):
        serializer.save(
            tenant=self.request.tenant,
            created_by=self.request.user,
            updated_by=self.request.user,
        )

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    def perform_destroy(self, instance):
        instance.soft_delete(deleted_by=self.request.user)
