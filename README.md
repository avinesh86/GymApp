# FitOps — Multi-Tenant Gym Operations Platform

Production-ready Django 5 SaaS application for gym operations management.

> **New here?** Start with [`docs/START_HERE.md`](docs/START_HERE.md) (no coding
> experience needed), then [`docs/RUNBOOK.md`](docs/RUNBOOK.md) for releases,
> rollbacks and day-to-day operations.

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

You only need [Docker Desktop](https://www.docker.com/products/docker-desktop/)
(or Docker Engine with Compose v2) installed and running. Python and Node run
inside the containers.

### 1. Clone and configure environment

```bash
git clone https://github.com/avinesh86/GymApp.git
cd GymApp
cp .env.example .env
```

Open `.env` in a text editor and replace these two placeholder values. Docker
can generate them for you, so nothing else needs installing:

```bash
# DJANGO_SECRET_KEY
docker run --rm python:3.12-slim python -c "import secrets; print(secrets.token_urlsafe(50))"

# FIELD_ENCRYPTION_KEY
docker run --rm python:3.12-slim python -c "import base64, secrets; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())"
```

Everything else in `.env.example` already works for local development.

### 2. Start all services

```bash
docker compose up --build
```

The first build takes several minutes. Database migrations run automatically
when the `web` container starts. Leave this terminal running and open a second
one in the same folder for the next steps. Stop everything with **Ctrl+C**, or
`docker compose down` from another terminal.

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

### 4. Open the app

Go to **http://localhost:3000** and log in with one of the seeded users:

| Email | Role |
|---|---|
| `owner@demogym.com` | Owner (everything) |
| `admin@demogym.com` | Admin |
| `manager@demogym.com` | Gym manager |
| `payroll@demogym.com` | Payroll |
| `instructor1@demogym.com` | Instructor |

Password for all: `FitOps2024!`. Log in as different roles to see what each
can access.

### 5. Run the tests

```bash
docker compose exec web pytest
```

More options, including frontend tests, are under [Running Tests](#running-tests).

### Calling the API directly (optional)

```bash
curl -X POST http://localhost/api/v1/auth/token/ \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@demogym.com", "password": "FitOps2024!"}'
```

Use the `access` token as a Bearer token in subsequent requests. Interactive
API docs are listed under [API Documentation](#api-documentation).

### Troubleshooting setup

| Problem | Fix |
|---|---|
| Port 80, 3000 or 3306 already in use | Stop whatever else is using it, or change the left-hand port in `docker-compose.yml` |
| "Tenant not found" when logging in | Run step 3 (`seed_data`); it links `localhost` to the demo gym |
| `web` keeps restarting | `docker compose logs web --tail=50`; usually a missing or placeholder key in `.env` |
| Login page loads but login fails | Check `docker compose ps`: `web` and `mysql` must both be running |
| Changes to frontend code don't show | Rebuild it: `docker compose build frontend && docker compose up -d frontend` |

---

## Working with Claude

This project is set up for [Claude Code](https://claude.ai/code): `CLAUDE.md`
tells Claude how the codebase works and the branch rules. Plain-language
requests work best. Include what you see, what you expected, and that you
want tests.

**The short version.** `CLAUDE.md` points Claude at the runbook, so this is
enough for most work:

- "Follow the runbook and fix this: <what's wrong, and the steps to see it>."
- "Follow the runbook and build this: <what you want>."
- "Follow the runbook and create a release to `main`."

Claude will branch off `test`, make the change with tests, and open a pull
request into `test`, or follow the release steps. More specific prompts get
better results:


**Understanding the code (changes nothing)**
- "Explain what this project does, in simple terms."
- "How does saving an attendance count work, from the button to the database?"
- "Which roles can cancel a cover request, and where is that checked?"

**Fixing a bug**
- "Changing a class's start and end time doesn't save. Steps: edit a class,
  set new times, save, reopen it, the old times are back. Find the cause, fix
  it, and add a test that would have caught it. Branch off `test` and open a
  pull request into `test`."
- "Times on the Notifications page are 13 hours off for a gym in New Zealand.
  Find out why and fix it, with tests."

**Adding a feature**
- "In the staff CSV import, make only name and email compulsory. Other columns
  should be optional. Update the template and add tests."
- "When deleting a recurring class, ask 'This class only' or 'Whole series'.
  Make sure a deleted single class isn't recreated by the schedule. Add tests."
- "Add an 'Import CSV' button to the Timetable page that opens the CSV import
  with Timetable selected."

**Pull requests and releases**
- "CI failed on my pull request. Find out why and fix it."
- "Watch pull request #NN and fix anything that fails or any review comments."
- "Follow the runbook and create a release to `main`." (release pull request,
  then a tagged GitHub Release once it's live)

**When something's wrong in production**
- "The last deploy failed. Read the Deploy workflow log and tell me what
  happened and whether the site is up."
- "Hotfix: <problem>. Branch off `main`, fix it with a test, and open a pull
  request into `main`."

Tips: ask for one change per pull request, always ask for tests with a fix,
and ask Claude to explain anything in a pull request you don't understand
before merging. The full workflow is in [`docs/RUNBOOK.md`](docs/RUNBOOK.md).

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

Frontend tests run outside Docker and need Node 20:

```bash
cd frontend
npm ci
npm test         # unit tests (Vitest)
npm run e2e      # UI tests (Playwright) — see frontend/playwright.config.ts
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

### Deploying

Merging to `main` deploys automatically: `.github/workflows/deploy.yml` waits
for CI to pass, then SSHes to the server and runs `scripts/deploy.sh`. You can
also trigger it by hand from the Actions tab, optionally against a specific
branch or SHA.

To deploy directly on the server:

```bash
bash scripts/deploy.sh
```

The script records the current commit, dumps the database to `backups/`, checks
for models missing a migration, prints the migration plan, applies it, rebuilds
the backend and frontend images, and health-checks
`/api/v1/public/health/`. **If the health check fails it rolls the code back to
the previous commit automatically** and re-checks.

Config via environment: `DEPLOY_BRANCH`, `HEALTHCHECK_URL`, `HEALTHCHECK_HOST`,
`BACKUP_DIR`, `SKIP_BACKUP=1`.

`HEALTHCHECK_HOST` matters more than it looks. Django answers **400
DisallowedHost** when the Host header is not in `ALLOWED_HOSTS`, and
`ALLOWED_HOSTS` rarely contains `localhost` — so a health check against
`http://localhost/` fails on a perfectly healthy server, and the deploy rolls
itself back for no reason. The script defaults this to the first entry in
`ALLOWED_HOSTS` in `.env` and sends it as the Host header.

Exit codes: `0` deployed · `1` failed and rolled back · `2` failed and the
rollback also failed — needs a human.

Required repo secrets for the workflow: `DEPLOY_HOST`, `DEPLOY_USER`,
`DEPLOY_KEY` (private key authorised on the server), `DEPLOY_PATH`, and
optionally `DEPLOY_PORT`. Set the `PRODUCTION_URL` repo variable to link the
deployment in the Actions UI.

### Reverting a bad deploy

The script rolls the code back on its own when the health check fails. These
steps are for when a release is *healthy but wrong* — it starts fine and the
bug shows up later.

**1. Roll the code back.** On the server:

```bash
git log --oneline -5                 # find the last good commit
git reset --hard <good-sha>
docker compose build web frontend
docker compose up -d --force-recreate web worker beat frontend
```

Or revert on GitHub (`git revert <bad-sha> && git push`) and let the deploy
workflow ship it — slower, but keeps the server matching `main`.

**2. Only if the schema is the problem, restore the database.** Migrations in
this codebase are additive, so old code usually runs fine against the newer
schema. Restoring **discards every write since the dump was taken**, so treat it
as a last resort:

```bash
ls -lt backups/                      # newest pre-deploy dump
docker compose exec -T mysql mysql -u root -p"${MYSQL_ROOT_PASSWORD}" \
  "${MYSQL_DATABASE}" < backups/pre-deploy-<timestamp>.sql
```

**3. Confirm it is back.**

```bash
curl -fsS http://localhost/api/v1/public/health/
docker compose logs --tail=50 web
```

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
