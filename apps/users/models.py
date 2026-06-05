from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models

from .constants import UserRole


class UserManager(BaseUserManager):
    def create_user(self, email, tenant, password=None, **extra_fields):
        if not email:
            raise ValueError("Email is required.")
        email = self.normalize_email(email)
        user = self.model(email=email, tenant=tenant, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        """
        Superusers exist outside the tenant model and are used only for
        platform-level administration via Django shell / management commands.
        They are never exposed through the customer-facing API.
        """
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", UserRole.OWNER)

        # Superusers need a tenant.  In practice you would pass one.
        tenant_id = extra_fields.pop("tenant_id", None)
        if tenant_id is None:
            from apps.tenants.models import Tenant
            tenant = Tenant.objects.first()
            if tenant is None:
                raise ValueError("Create at least one Tenant before creating a superuser.")
        else:
            from apps.tenants.models import Tenant
            tenant = Tenant.objects.get(pk=tenant_id)

        return self.create_user(email, tenant=tenant, password=password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """
    Custom user model.  Email is the username field.
    Every user belongs to exactly one tenant.
    """

    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.CASCADE,
        related_name="users",
        db_index=True,
    )
    email = models.EmailField(max_length=254, unique=True)
    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)
    role = models.CharField(
        max_length=30,
        choices=UserRole.CHOICES,
        default=UserRole.INSTRUCTOR,
        db_index=True,
    )
    is_active = models.BooleanField(default=True, db_index=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(auto_now_add=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    class Meta:
        db_table = "users_user"
        indexes = [
            models.Index(fields=["tenant", "email"]),
        ]

    def __str__(self):
        return f"{self.email} ({self.tenant.slug})"

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    def membership_for(self, tenant):
        """Active Membership of this user in the given tenant, or None."""
        return self.memberships.filter(tenant=tenant, is_active=True).first()


class Membership(models.Model):
    """A user's belonging to one gym (tenant), with a role scoped to that gym.

    A person has one global User (login) but may belong to several gyms. Role is
    per-gym, so the same person can be an owner at one gym and an instructor at
    another. The active gym for a request is carried in the JWT; User.tenant /
    User.role hold the user's default (and are synced to the active membership
    per-request by authentication).
    """

    user = models.ForeignKey(
        "users.User", on_delete=models.CASCADE, related_name="memberships"
    )
    tenant = models.ForeignKey(
        "tenants.Tenant", on_delete=models.CASCADE, related_name="memberships"
    )
    role = models.CharField(
        max_length=30,
        choices=UserRole.CHOICES,
        default=UserRole.INSTRUCTOR,
        db_index=True,
    )
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "users_membership"
        unique_together = ("user", "tenant")

    def __str__(self):
        return f"{self.user.email} @ {self.tenant.slug} ({self.role})"
