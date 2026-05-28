from rest_framework import serializers

from .models import User


class UserSerializer(serializers.ModelSerializer):
    # Optional on create: if omitted, a secure random password is generated.
    # The admin must share the password with the new user out-of-band.
    password = serializers.CharField(
        write_only=True,
        min_length=8,
        required=False,
        allow_blank=True,
    )

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "role",
            "is_active",
            "date_joined",
            "password",
        ]
        read_only_fields = ["id", "date_joined"]

    def create(self, validated_data):
        import secrets
        import string

        raw_password = validated_data.pop("password", None)
        if not raw_password:
            alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
            raw_password = "".join(secrets.choice(alphabet) for _ in range(16))

        user = User(**validated_data)
        user.set_password(raw_password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class UserListSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "email", "first_name", "last_name", "role", "is_active", "date_joined"]
        read_only_fields = fields


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True, min_length=8)

    def validate_old_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Old password is incorrect.")
        return value
