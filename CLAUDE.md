# FitOps — GymApp Project Context

## What This Is
Multi-tenant SaaS gym management platform. Django DRF backend + React/TypeScript frontend. Each gym is a **tenant** — all DB queries must scope to `request.tenant`.

## Stack
| Layer | Tech |
|---|---|
| Backend | Django 4.x, DRF, MySQL |
| Frontend | React 18, TypeScript, Vite, Tailwind, TanStack Query |
| Auth | JWT (SimpleJWT) |
| Infra | Docker Compose (web, frontend, mysql, redis, worker) |
| Task queue | Celery + Redis |

## Project Structure
```
GymApp/
├── apps/
│   ├── attendance/     # Attendance records, QR tokens
│   ├── cover/          # Cover requests, offers
│   ├── invoices/       # Invoicing, line items, approvals
│   ├── reports/        # Attendance, viability, payroll reports
│   ├── staff/          # Staff profiles, availability, qualifications
│   ├── timetable/      # TimetableEvent (classes)
│   ├── tenants/        # Tenant model, middleware
│   ├── users/          # Custom User model (AUTH_USER_MODEL = "users.User")
│   └── notifications/  # In-app + WhatsApp notifications
├── frontend/src/
│   ├── api/            # Axios API functions per domain
│   ├── components/     # Shared UI (Button, Modal, Badge, etc.)
│   ├── pages/          # Route-level page components
│   └── types/          # TypeScript interfaces (index.ts)
├── fitops/             # Django settings, URLs, wsgi
└── docker-compose.yml
```

## Critical Patterns

### Backend
- **Tenant scoping**: ALL querysets filter by `tenant=request.tenant`
- **TenantAwareModel**: base class for all tenant-scoped models
- **AUTH_USER_MODEL**: `"users.User"` — never use `"auth.User"` in FKs
- **Timezone**: DB stores UTC. `start_datetime`/`end_datetime` are timezone-aware. `start_datetime.date()` returns UTC date — wrong for UTC+ gyms
- **Custom actions**: `@action(detail=True, methods=["post"])` on ViewSets
- **Date serialization**: `TimetableEventSerializer.get_date()` returns `start_datetime.date().isoformat()` (UTC — may differ from local date)

### Frontend
- **API client**: `frontend/src/api/client.ts` — axios instance with JWT interceptors
- **React Query keys**: `['cover-requests']`, `['attendance', 'awaiting']`, `['staff']`, etc.
- **Date filtering**: Always use `start_datetime` ISO string (not `date`) for tab/range filtering. Use `startOfDay(new Date()).toISOString()` for UTC boundary from local midnight
- **TimetableEvent.start_datetime**: optional `string` (ISO UTC) — use `??` fallback to `date` field
- **Auth**: `useAuth()` hook, `RoleGuard` component for permission-based rendering

### Docker Deploy Workflow
```bash
# Backend change (Python/migrations):
docker-compose restart web

# Frontend change (React/TS):
docker-compose build frontend && docker-compose up -d --force-recreate frontend

# New migration:
docker-compose exec web python manage.py makemigrations <app>
docker-compose exec web python manage.py migrate
```

## Key Models

### TimetableEvent
- `start_datetime`, `end_datetime` (UTC, timezone-aware)
- No `date` field on model — serializer computes it from `start_datetime.date()`
- Status: `scheduled | unfilled | needs_cover | cancelled | completed`

### CoverRequest
- Status: `open | offered | accepted | cancelled`
- Cancellation audit: `cancellation_reason`, `cancelled_at`, `cancelled_by` FK to `users.User`
- Cancel endpoint: `POST /cover/requests/{id}/cancel/` with `{ cancellation_reason }`

### AttendanceRecord
- Links `timetable_event` (FK) → `count`
- Awaiting endpoint: `GET /attendance/records/?awaiting=true`
- Supports `from_datetime`/`to_datetime` ISO params for date range filtering
- `count_only=true` returns `{ count: N }` instead of records

## Known Issues / Fixes Applied
- **Attendance tabs empty**: `_list_awaiting` was ascending (oldest first). Fixed to descending. Client filter now uses ISO string comparison, not `isToday()` (timezone-safe)
- **Reports viability 0%**: Shape mismatch between backend and TS types. Fixed in `apps/reports/views.py`
- **defaultdict pre-creation bug**: `d[key].append(...)` creates key before exception. Pattern: build `dict[int, int]` first, then use `.get()`
- **Cover cancel not visible**: Moved cancel UI to `Modal footer` prop (sticky, outside scroll area)

## API Base URL
`/api/v1/` — e.g., `GET /api/v1/attendance/records/?awaiting=true`

## Useful Debug Commands
```bash
# Django shell
docker-compose exec web python manage.py shell

# Check tenant
docker-compose exec web python manage.py shell -c "from apps.tenants.models import Tenant; print(Tenant.objects.all())"

# Check server time
docker-compose exec web python -c "import datetime; print(datetime.datetime.now(datetime.timezone.utc))"

# Frontend build logs
docker-compose logs frontend --tail=50
```
