---
name: fitops
description: >
  FitOps / GymApp project context and coding guide. Use when working on the
  GymApp Django+React multi-tenant gym management SaaS — backend apps, frontend
  pages, Docker deploy, migrations, or any FitOps feature work.
---

# FitOps Skill

Loads key facts, architecture, and coding patterns for the FitOps GymApp project.

## Project Root
`/Users/avinesh/Projects/GymApp`

## Quick Facts
- Django DRF backend + React 18 / TypeScript / Vite frontend
- Multi-tenant: ALL DB queries scope to `request.tenant`
- `AUTH_USER_MODEL = "users.User"` — never `"auth.User"` in FK references
- DB stores datetimes in UTC; gym operates in NZ (UTC+12)
- Docker Compose: services `web`, `frontend`, `mysql`, `redis`, `worker`

## Deploy Commands

### After Python / model change:
```bash
docker-compose restart web
```

### After migration:
```bash
docker-compose exec web python manage.py makemigrations <app>
docker-compose exec web python manage.py migrate
```

### After frontend change:
```bash
docker-compose build frontend && docker-compose up -d --force-recreate frontend
```

## Architecture Cheatsheet

| Concern | Location |
|---|---|
| API functions | `frontend/src/api/<domain>.ts` |
| TypeScript types | `frontend/src/types/index.ts` |
| Page components | `frontend/src/pages/<domain>/` |
| Shared UI | `frontend/src/components/ui/` |
| Django views | `apps/<domain>/views.py` |
| Serializers | `apps/<domain>/serializers.py` |
| Models | `apps/<domain>/models.py` |
| URL routing | `apps/<domain>/urls.py` + `fitops/urls.py` |

## Date / Timezone Rules
- `TimetableEvent` has no `date` field on model — serializer computes from `start_datetime.date()` (UTC)
- For date range filtering, use `start_datetime__gte/lte` not `date__gte/lte`
- Frontend: use `startOfDay(new Date()).toISOString()` for day boundaries — ISO string comparison is timezone-safe
- Never use `isToday()` / `isThisWeek()` from date-fns for filtering — depends on OS timezone

## Key Endpoints
```
GET  /api/v1/attendance/records/?awaiting=true&from_datetime=<iso>&to_datetime=<iso>
GET  /api/v1/attendance/records/?awaiting=true&count_only=true
POST /api/v1/cover/requests/{id}/cancel/        body: { cancellation_reason }
POST /api/v1/cover/requests/{id}/accept/        body: { offer_id }
POST /api/v1/cover/requests/{id}/offer/
POST /api/v1/attendance/records/submit-for-event/  body: { event, count }
```

## Coding Standards for This Project
- Match existing patterns before introducing new ones
- Tenant scope every queryset — `filter(tenant=request.tenant)`
- Build `dict[int, T]` maps before loops; avoid `defaultdict` with side-effect-prone access
- Frontend mutations invalidate relevant query keys via `queryClient.invalidateQueries`
- Modal actions that must always be visible → use `footer` prop, not scrollable body
