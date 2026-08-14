"""
Health check endpoint — no authentication, no tenant required.

Used by the deploy script to decide whether a release came up cleanly, so it
must exercise the database rather than only proving that gunicorn is
listening: a container with a broken DB connection still answers HTTP.
"""

import logging

from django.db import DatabaseError, connection
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger(__name__)


class HealthCheckView(APIView):
    """Return 200 when the app can serve requests, 503 when it cannot."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
        except DatabaseError as exc:
            logger.exception("Health check failed: database unreachable")
            return Response(
                {"status": "unhealthy", "database": "error", "detail": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({"status": "healthy", "database": "ok"})
