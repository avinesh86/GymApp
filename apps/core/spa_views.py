"""
Catch-all view that serves the React SPA's index.html for any route
that isn't an API endpoint or static file.

Used on PythonAnywhere where Django serves both the API and the
frontend from a single web app.
"""
import os

from django.conf import settings
from django.http import HttpResponse, HttpResponseNotFound
from django.views import View


class SPAView(View):
    """
    Serves the React build's index.html for any path that doesn't match
    an API route.  This enables React Router's client-side routing.
    """

    def get(self, request, *args, **kwargs):
        # Look for index.html in the React dist directory
        candidates = [
            os.path.join(settings.BASE_DIR, "frontend", "dist", "index.html"),
            os.path.join(settings.STATIC_ROOT, "index.html"),
        ]

        for index_path in candidates:
            if os.path.exists(index_path):
                with open(index_path, "r", encoding="utf-8") as f:
                    return HttpResponse(f.read(), content_type="text/html")

        return HttpResponseNotFound(
            "<h1>Frontend not built</h1>"
            "<p>Run <code>npm run build</code> in the frontend/ directory, "
            "then <code>python manage.py collectstatic</code>.</p>"
        )
