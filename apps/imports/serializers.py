from rest_framework import serializers

from .models import ImportJob


class ImportJobSerializer(serializers.ModelSerializer):
    class Meta:
        model = ImportJob
        fields = [
            "id", "import_type", "file", "status",
            "rows_total", "rows_success", "rows_failed",
            "error_log", "created_at", "completed_at",
        ]
        read_only_fields = [
            "id", "status", "rows_total", "rows_success",
            "rows_failed", "error_log", "created_at", "completed_at",
        ]
