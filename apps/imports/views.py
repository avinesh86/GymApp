from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.core.mixins import TenantScopedMixin
from apps.core.permissions import IsAdmin

from .models import ImportJob
from .parsers import import_attendance, import_staff, import_timetable
from .serializers import ImportJobSerializer

IMPORT_HANDLERS = {
    ImportJob.ImportType.STAFF: import_staff,
    ImportJob.ImportType.TIMETABLE: import_timetable,
    ImportJob.ImportType.ATTENDANCE: import_attendance,
}


class ImportJobViewSet(TenantScopedMixin, ModelViewSet):
    serializer_class = ImportJobSerializer
    permission_classes = [IsAdmin]
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        return (
            ImportJob.objects.filter(tenant=self.request.tenant, is_deleted=False)
            .order_by("-created_at")
        )

    def create(self, request, *args, **kwargs):
        serializer = ImportJobSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        import_type = serializer.validated_data["import_type"]
        file_obj = request.FILES.get("file")

        if not file_obj:
            return Response({"detail": "No file provided."}, status=status.HTTP_400_BAD_REQUEST)

        # Read before creating the job — Django's file storage consumes the
        # file pointer during model save, so reading after create returns b"".
        file_content = file_obj.read()

        job = ImportJob.objects.create(
            tenant=request.tenant,
            import_type=import_type,
            file=file_obj,
            status=ImportJob.Status.PROCESSING,
            created_by=request.user,
            updated_by=request.user,
        )
        handler = IMPORT_HANDLERS.get(import_type)

        if handler is None:
            job.status = ImportJob.Status.FAILED
            job.error_log = [{"error": f"Unknown import type: {import_type}"}]
            job.save(update_fields=["status", "error_log"])
            return Response(
                {"detail": "Unsupported import type."}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            rows_success, rows_failed, error_log = handler(
                file_content, request.tenant, request.user
            )
            job.rows_total = rows_success + rows_failed
            job.rows_success = rows_success
            job.rows_failed = rows_failed
            job.error_log = error_log
            job.status = ImportJob.Status.COMPLETE
            job.completed_at = timezone.now()
        except Exception as exc:
            job.status = ImportJob.Status.FAILED
            job.error_log = [{"error": str(exc)}]
        finally:
            job.save(update_fields=[
                "rows_total", "rows_success", "rows_failed",
                "error_log", "status", "completed_at",
            ])

        return Response(ImportJobSerializer(job).data, status=status.HTTP_201_CREATED)
