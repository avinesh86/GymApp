import csv

from django.http import HttpResponse
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.core.mixins import TenantScopedMixin
from apps.core.permissions import IsAdmin

from .models import ImportJob
from .parsers import TEMPLATE_COLUMNS, TEMPLATE_SAMPLE_ROWS
from .serializers import ImportJobSerializer


class ImportJobViewSet(TenantScopedMixin, ModelViewSet):
    serializer_class = ImportJobSerializer
    permission_classes = [IsAdmin]
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        return (
            ImportJob.objects.filter(tenant=self.request.tenant, is_deleted=False)
            .order_by("-created_at")
        )

    @action(
        detail=False,
        methods=["get"],
        url_path=r"templates/(?P<import_type>[a-z_]+)",
    )
    def template(self, request, import_type=None):
        """Download a blank CSV template (header + one example row)."""
        columns = TEMPLATE_COLUMNS.get(import_type)
        if columns is None:
            return Response(
                {"detail": f"Unknown import type: {import_type}"},
                status=status.HTTP_404_NOT_FOUND,
            )

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = (
            f'attachment; filename="{import_type}-template.csv"'
        )
        writer = csv.writer(response)
        writer.writerow(columns)
        writer.writerow(TEMPLATE_SAMPLE_ROWS[import_type])
        return response

    def create(self, request, *args, **kwargs):
        serializer = ImportJobSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        import_type = serializer.validated_data["import_type"]
        file_obj = request.FILES.get("file")

        if not file_obj:
            return Response({"detail": "No file provided."}, status=status.HTTP_400_BAD_REQUEST)

        job = ImportJob.objects.create(
            tenant=request.tenant,
            import_type=import_type,
            file=file_obj,
            status=ImportJob.Status.PENDING,
            created_by=request.user,
            updated_by=request.user,
        )

        # Dispatch to Celery — returns immediately so the HTTP request does
        # not block while rows are being parsed and inserted.
        from .tasks import run_import_job
        run_import_job.delay(job.id)

        return Response(ImportJobSerializer(job).data, status=status.HTTP_201_CREATED)
