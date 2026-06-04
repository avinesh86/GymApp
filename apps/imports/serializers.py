from rest_framework import serializers

from .models import ImportJob


class ImportJobSerializer(serializers.ModelSerializer):
    # Guarantee a list even when the DB column stored NULL (e.g. rows created
    # before the JSONField migration ran with a proper default).
    error_log = serializers.SerializerMethodField()

    def get_error_log(self, obj):
        return obj.error_log or []

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
