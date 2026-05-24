# FitOps — Multi-Tenant Gym Operations Platform

Production-ready Django 5 SaaS application for gym operations management.

## Features

- Multi-tenant architecture (subdomain + custom domain routing)
- Staff management with qualifications, availability, and pay rates
- Timetable with recurring event generation
- Cover request workflow with WhatsApp Business Cloud API notifications
- Invoice and payroll approval workflow with PDF generation
- Attendance tracking with QR code support
- Role-based access control (7 roles)
- CSV bulk import for staff, timetable, and attendance
- Reports and analytics
- Immutable audit log
- Celery task queue for background jobs

---

## Prerequisites

- Docker 24+
- Docker Compose v2
- Python 3.12+ (for local development without Docker)

---

## Local Development with Docker

### 1. Clone and configure environment

```bash
git clone <repo-url>
cd GymApp
cp .env.example .env
```

Edit `.env` and set at minimum:

```
DJANGO_SECRET_KEY=<generate a long random string>
FIELD_ENCRYPTION_KEY=<generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())">
```

### 2. Start all services

```bash
docker compose up --build
```

### 3. Seed sample data

```bash
docker compose exec web python manage.py seed_data
```

This creates:
- Tenant: `demo-gym` (accessible at `localhost`)
- Users: owner, admin, gym_manager, payroll, instructor x2
  - All passwords: `FitOps2024!`
- 3 class types (Yoga, Spin, HIIT)
- 7 days of timetable events

### 4. Get a JWT token

```bash
curl -X POST http://localhost/api/v1/auth/token/ \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@demogym.com", "password": "FitOps2024!"}'
```

Use the `access` token as a Bearer token in subsequent requests.

---

## Environment Variables Reference

| Variable | Description | Default |
|---|---|---|
| `DJANGO_SECRET_KEY` | Django secret key (required) | — |
| `DJANGO_SETTINGS_MODULE` | Settings module | `fitops.settings.dev` |
| `DEBUG` | Debug mode | `True` |
| `ALLOWED_HOSTS` | Comma-separated allowed hosts | `localhost,127.0.0.1` |
| `MYSQL_DATABASE` | Database name | `fitops` |
| `MYSQL_USER` | Database user | `fitops` |
| `MYSQL_PASSWORD` | Database password | — |
| `MYSQL_ROOT_PASSWORD` | MySQL root password | — |
| `MYSQL_HOST` | Database host | `mysql` |
| `REDIS_URL` | Redis connection URL | `redis://redis:6379/0` |
| `CELERY_BROKER_URL` | Celery broker URL | `redis://redis:6379/0` |
| `JWT_ACCESS_TOKEN_LIFETIME_MINUTES` | JWT access token lifetime | `60` |
| `JWT_REFRESH_TOKEN_LIFETIME_DAYS` | JWT refresh token lifetime | `7` |
| `FIELD_ENCRYPTION_KEY` | Fernet key for encrypting WhatsApp tokens | — |
| `META_APP_SECRET` | Meta App Secret for webhook signature validation | — |
| `EMAIL_HOST` | SMTP host | `localhost` |
| `EMAIL_HOST_USER` | SMTP username | — |
| `EMAIL_HOST_PASSWORD` | SMTP password | — |
| `DEFAULT_FROM_EMAIL` | Sender email address | `noreply@fitops.io` |
| `CORS_ALLOWED_ORIGINS` | Comma-separated allowed CORS origins | `http://localhost:3000` |
| `SENTRY_DSN` | Sentry DSN (prod only) | — |
| `AWS_ACCESS_KEY_ID` | AWS access key (prod S3 only) | — |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key (prod S3 only) | — |
| `AWS_STORAGE_BUCKET_NAME` | S3 bucket name (prod only) | — |

---

## Running Tests

```bash
# All tests
docker compose exec web pytest

# With coverage
docker compose exec web pytest --cov=apps --cov-report=term-missing

# Specific test file
docker compose exec web pytest tests/test_tenant_isolation.py -v

# Outside Docker (requires local MySQL + .env)
pip install -r requirements/dev.txt
pytest
```

### Test Coverage Areas

- `tests/test_tenant_isolation.py` — Proves cross-tenant data isolation
- `tests/test_cover_workflow.py` — Full cover request → offer → accept flow
- `tests/test_invoice_generation.py` — Invoice creation, line items, amounts, approval workflow
- `tests/test_whatsapp_webhook.py` — Webhook verification, message processing, ACCEPT reply
- `tests/test_permissions.py` — All 7 roles against all permission classes
- `tests/test_timetable_recurring.py` — Recurring event generation, idempotency, date scoping

---

## Management Commands

### Seed development data

```bash
python manage.py seed_data
```

### Generate invoices for a tenant

```bash
python manage.py generate_invoices \
  --tenant demo-gym \
  --period-start 2024-11-01 \
  --period-end 2024-11-30
```

### Database migrations

```bash
python manage.py makemigrations
python manage.py migrate
```

---

## API Authentication (JWT)

All API endpoints (except the WhatsApp webhook and QR attendance submit) require a JWT Bearer token.

### Obtain tokens

```http
POST /api/v1/auth/token/
Content-Type: application/json

{"email": "user@example.com", "password": "..."}
```

Response: `{"access": "...", "refresh": "..."}`

### Use token

```http
GET /api/v1/staff/
Authorization: Bearer <access_token>
```

### Refresh token

```http
POST /api/v1/auth/token/refresh/
{"refresh": "..."}
```

---

## API Documentation

Swagger UI is available at `/api/docs/` when the server is running.

OpenAPI schema: `/api/schema/`

---

## Tenant Setup Guide

### 1. Create a tenant (via Django shell or management command)

```python
from apps.tenants.models import Tenant, TenantDomain, TenantBranding, TenantSettings

tenant = Tenant.objects.create(
    name="Sunrise Fitness",
    slug="sunrise-fitness",
    plan="growth",
)

# Subdomain routing
TenantDomain.objects.create(
    tenant=tenant,
    domain="sunrise.fitops.io",
    is_primary=True,
)

# Optional custom domain
TenantDomain.objects.create(
    tenant=tenant,
    domain="app.sunrisefitness.com.au",
    is_custom=True,
)

TenantBranding.objects.create(
    tenant=tenant,
    app_name="Sunrise Fitness",
    primary_color="#F97316",
    currency="AUD",
)

TenantSettings.objects.create(
    tenant=tenant,
    invoice_frequency="fortnightly",
    timezone="Australia/Sydney",
)
```

### 2. Create the owner user

```python
from apps.users.models import User

owner = User.objects.create_user(
    email="owner@sunrisefitness.com.au",
    tenant=tenant,
    password="SecurePassword123!",
    role="owner",
    first_name="Alex",
    last_name="Owner",
)
```

### 3. Configure DNS

Point your tenant's subdomain or custom domain to the server's IP. nginx will route the request to Django, which resolves the tenant from the Host header.

### 4. Enable WhatsApp (optional)

Via the API:

```http
POST /api/v1/whatsapp/accounts/
Authorization: Bearer <admin_token>

{
  "phone_number_id": "...",
  "waba_id": "...",
  "access_token": "...",
  "webhook_verify_token": "random-secret-here",
  "display_name": "Sunrise Fitness"
}
```

Then configure the Meta webhook URL to:
`https://sunrise.fitops.io/api/v1/whatsapp/webhook/`

---

## Deployment Notes

### Production Docker Compose

```bash
docker compose -f docker-compose.prod.yml up -d
```

### SSL / TLS

Configure nginx to handle SSL termination. Add your certificates to the nginx volume and update `nginx.conf` to listen on port 443.

### Database backups

```bash
docker compose exec mysql mysqldump \
  -u root -p${MYSQL_ROOT_PASSWORD} fitops > backup_$(date +%Y%m%d).sql
```

### Scaling workers

Increase Celery worker replicas in `docker-compose.prod.yml`:

```yaml
worker:
  deploy:
    replicas: 3
```

### Celery Beat (scheduled tasks)

The beat service runs scheduled tasks. Default schedules:

| Task | Schedule |
|---|---|
| Generate recurring timetable events | Daily at 01:00 |
| Check unfilled classes | Daily at 06:00 |
| Expire cover offers | Every 30 minutes |
| Send cover reminders | Hourly |
| Auto-generate invoices | Per tenant frequency |
| Send invoice reminders | Weekly Monday 09:00 |
| Send pending notifications | Every 5 minutes |

Configure schedules via the Django admin or directly in `django_celery_beat` tables.

---

## Architecture Notes

### Tenant isolation

Every business model inherits `TenantAwareModel` and carries a `tenant` FK. The `TenantMiddleware` resolves `request.tenant` from the Host header on every request. The `TenantScopedMixin` on ViewSets automatically filters `get_queryset()` to the current tenant. Permission classes verify `user.tenant == request.tenant` before any role check.

### Services layer

Business logic lives in `apps/*/services.py` — pure functions that accept explicit parameters and return model instances. Views call services; services never access `request`.

### Soft delete

No business records are hard-deleted. `is_deleted=True` is set instead. All querysets in views filter `is_deleted=False` by default via `TenantScopedMixin`.

### Audit log

`log_audit(user, action, obj, before, after, request)` in `apps/core/audit.py` writes to the `AuditLog` table. It is called from service functions for any state-changing operation.
