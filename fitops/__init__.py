try:
    from .celery import app as celery_app

    __all__ = ("celery_app",)
except Exception:
    # Celery may not be fully configured (e.g. PythonAnywhere with no broker).
    # CELERY_TASK_ALWAYS_EAGER handles task execution synchronously.
    celery_app = None
    __all__ = ("celery_app",)
