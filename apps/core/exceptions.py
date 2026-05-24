import logging

from django.core.exceptions import PermissionDenied
from django.http import Http404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


def fitops_exception_handler(exc, context):
    """
    Custom exception handler that wraps DRF's default handler and adds
    consistent error shapes and logging.
    """
    response = exception_handler(exc, context)

    if response is not None:
        error_data = {
            "error": True,
            "status_code": response.status_code,
            "detail": response.data,
        }
        response.data = error_data
        return response

    if isinstance(exc, Http404):
        return Response(
            {"error": True, "status_code": 404, "detail": "Not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    if isinstance(exc, PermissionDenied):
        return Response(
            {"error": True, "status_code": 403, "detail": "Permission denied."},
            status=status.HTTP_403_FORBIDDEN,
        )

    logger.exception("Unhandled exception", exc_info=exc)
    return Response(
        {"error": True, "status_code": 500, "detail": "Internal server error."},
        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )
