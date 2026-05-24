from rest_framework_simplejwt.views import TokenObtainPairView

from .jwt_serializers import TenantTokenObtainPairSerializer


class TenantTokenObtainPairView(TokenObtainPairView):
    serializer_class = TenantTokenObtainPairSerializer
