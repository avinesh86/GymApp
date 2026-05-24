from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_nested import routers as nested_routers

from .views import InvoiceLineItemViewSet, InvoiceViewSet, PayrollBatchViewSet, PayRunViewSet

router = DefaultRouter()
router.register("", InvoiceViewSet, basename="invoices")
router.register("payroll-batches", PayrollBatchViewSet, basename="payroll-batches")
router.register("pay-runs", PayRunViewSet, basename="pay-runs")

invoice_router = nested_routers.NestedDefaultRouter(router, "", lookup="invoice")
invoice_router.register("line-items", InvoiceLineItemViewSet, basename="invoice-line-items")

urlpatterns = [
    path("", include(router.urls)),
    path("", include(invoice_router.urls)),
]
