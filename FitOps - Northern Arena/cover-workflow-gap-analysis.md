# Cover Workflow — Gap Analysis & Target Design

Compares the client's **Class Cover Workflow** doc against the system's actual
cover-request flow, and specifies the target design implemented on
`feat/cover-workflow-redesign`.

Sources reviewed: `apps/cover/{models,services,views,tasks,serializers}.py`,
`apps/core/permissions.py`, `apps/timetable/models.py`,
`frontend/src/pages/cover/*`, `frontend/src/pages/schedule/InstructorCalendarPage.tsx`.

---

## 1. Doc workflow vs system (before this branch)

| # | Doc step | System (before) | Gap |
|---|----------|------------------|-----|
| 1 | Instructor initiates cover | `CoverRequestViewSet` required `IsTeamLeader` — instructors blocked | ❌ |
| 2a | Submit via timetable event (confirm before submit) | no per-event request action / confirm | ❌ |
| 2b | Submit via My Calendar quick button | My Calendar only *accepts* cover | ❌ |
| 2c | Form: class-type/date/time **or** prolonged absence (from/to + reason) → collate assigned classes → tick (+ tick-all) | modal picks one existing event only | ❌ |
| 3 | Confirmation email to instructor | none | ❌ |
| 4 | open; urgency auto by timeframe; eligibility by qualification + availability | open ✓; urgency manual default HIGH; qualification = −20 penalty (not a gate) | ⚠️ |
| 5 | Manager approves/denies; then auto-send Tier 1 or manual select; → Offered | offers auto-dispatch immediately on create; no approval/deny/manual-select | ❌ |
| 6 | Candidate notified; accept/decline | ✓ WhatsApp + email + in-app + accept-by-code | ✅ |
| 7 | accepted; event "SUB: \<name\>"; accepted_by/at on request; notify original + cover + managers | event reassigned, status scheduled; no SUB label, original not retained, no accepted_by/at on request; original + managers not notified | ⚠️ |
| 8 | Tier escalation after timeframe (settings) | hardcoded 24h Celery `countdown` — does not run under PythonAnywhere cron | ❌ broken in prod |
| 9 | Critical status within critical timeframe; notify managers | no CRITICAL status; urgency.CRITICAL unused | ❌ |
| 10 | Expired/cancelled handled manually | daily expiry + cancel endpoint | ✅ |
| — | Reminders | `send_cover_reminders` is a stub (logs only) | ❌ |
| — | Managers notified of new open request + suggested subs | not done | ❌ |

**Solid foundation kept:** `CoverOffer` + `accept_code`, public accept-by-code,
WhatsApp `ACCEPT <code>`, atomic accept (assign event, expire sibling offers,
`CoverResponse` audit), tenant scoping, cancellation audit.

**Core divergence:** doc = instructor-initiated, manager-gated, timeframe-driven
escalating state machine. System = manager-initiated, auto-dispatch, single-event.

---

## 2. Target design

### 2.1 State machine (service-enforced)
```
DRAFT ─submit→ PENDING_APPROVAL ─approve→ OPEN ─dispatch→ OFFERED ─accept→ ACCEPTED
   │                  │                     │               │
   │                  └─deny→ DENIED        ├─escalate→ OFFERED (next tier)
   │                                        └─timeframe→ CRITICAL ─accept→ ACCEPTED
   └ (any non-ACCEPTED) ─cancel→ CANCELLED ; ─event passed→ EXPIRED
```
- New `CoverRequest.Status`: `PENDING_APPROVAL`, `DENIED`, `CRITICAL`.
- `urgency` (low/high/critical) is a computed *signal* (hours-to-class), separate
  from `status` (CRITICAL status = needs manager action now).
- All transitions go through `apps/cover/state.py::transition()` — guarded by an
  allowed-from map + `log_audit`. Views never write `status=` directly.

### 2.2 Data model
- `CoverRequest`: `requested_by` (User), `approved_by` (User), `approved_at`,
  `accepted_by` (StaffProfile), `accepted_at`, `critical_notified_at`.
- `TimetableEvent.original_instructor` already exists — populate it on accept;
  serializer exposes a computed `SUB: <name>` display when set.
- Prolonged absence: one `Absence` + one `CoverRequest` **per class** in range,
  grouped by `absence_id`. Reuses the per-event offer/accept machinery.

### 2.3 Eligibility & candidates
- Missing class-type capability **disqualifies** (hard gate). Availability / tier /
  reliability rank within the eligible set.
- `GET /cover-requests/{id}/candidates/` returns the tiered, scored list for the
  manager-review screen (suggested subs + manual select).

### 2.4 Approval gate + dispatch modes
- Endpoints: `approve/`, `deny/`, `dispatch/` (manual: chosen staff ids), `escalate/`.
- `TenantSettings.cover_auto_dispatch` toggle: true → submit auto-opens + Tier-1
  dispatch (fast mode); false → PENDING_APPROVAL (doc's manager-gated mode).

### 2.5 Scheduling — PythonAnywhere-safe
Celery `countdown`/`apply_async` do not run under the PA cron model. Replaced by
an idempotent `advance_cover_requests()` task run from `run_scheduled_tasks`:
- expire the active tier's stale offers (`cover_offer_expiry_hours`) → dispatch
  next tier → exhaustion notifies admins;
- `hours_until_class <= cover_critical_threshold_hours` → CRITICAL + manager alert
  (once, guarded by `critical_notified_at`).
No live worker required; deterministic and resumable.

### 2.6 Notifications
Submit confirmation (requester), manager-on-open (with suggested subs), accept
(cover + **original** + managers), critical alert, real reminders. Centralised in
`apps/cover/notifications.py`.

### 2.7 Permissions
Instructors may create a cover request for **their own** event / absence
(object-level check). Managers/team-leaders may create for anyone.

### 2.8 Frontend
- My Calendar: per-event "Request Cover" + confirm.
- Cover form: single-class mode + prolonged-absence mode (from/to → checkbox list
  with select-all → batch create).
- Cover Board: Pending-Approval lane + review drawer (approve / deny / manual select).
- Timetable card: `SUB: <name>` when `original_instructor` set.

---

## 3. Implementation phases (all on this branch, one PR)
1. Models + migrations + state machine.
2. Eligibility hard-gate + `candidates/`.
3. Approval gate + dispatch modes + accept enrichment (original_instructor, accepted_by/at).
4. PA-safe scheduler (`advance_cover_requests`) + real reminders; remove `countdown`.
5. Notifications (submit / open / accept / critical / reminders).
6. Instructor self-service permissions.
7. Frontend: My Calendar request, two-mode form, Cover Board approval lane, SUB label.
8. Tests: backend (pytest) per phase + frontend (vitest) UI automation.

Compatibility: existing offer/accept/cancel behaviour preserved; `cover_auto_dispatch`
defaults **true** so current auto-dispatch gyms are unaffected.
