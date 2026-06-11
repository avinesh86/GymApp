# Invoice Workflow — Gap Analysis & Target Design

Compares the client's **Invoice Workflow** doc against the system's actual
invoicing implementation, and specifies the target design implemented on
`feat/invoice-workflow-redesign`.

Reviewed: `apps/invoices/{models,services,views,tasks,serializers,urls}.py`,
`apps/tenants/models.py` (TenantSettings), `frontend/src/pages/invoices/*`,
`frontend/src/api/invoices.ts`, `apps/core/permissions.py`.

---

## 1. Doc workflow vs system (before this branch)

| Stage | Doc | System (before) | Gap |
|-------|-----|------------------|-----|
| Pay period config | Start date + recurring, set by manager/owner/payroll in Settings | `TenantSettings.invoice_frequency` only; fortnightly/8-weekly use a hardcoded `2024-01-01` epoch — **no configurable start date** | ⚠️ |
| Generation | Auto at period end; gather events; base + per-head + bonus; **notify instructor (draft email)** | `generate_invoice_for_instructor` does rates + bonus ✓; auto task runs for active instructors ✓; **no instructor notification** | ⚠️ |
| Review & edit (instructor) | Instructor edits line items / notes; **edited items flagged** | Line-item edit endpoint is `IsGymManager` — **instructors can't edit**; edits **not auto-flagged** | ❌ |
| Draft saving | status `draft` | ✓ | ✅ |
| Submission (instructor) | Instructor submits; optional PDF; draft→submitted; **notify managers/admins** | `submit_invoice` exists but the action is `IsGymManager` — **instructors can't submit**; no manager notification; PDF not wired | ❌ |
| Manager approval | View submitted + **flagged-edit warning**; approve→`manager_approved` (+`manager_approver_id`/`_at`); reject→`rejected` (+`rejection_reason`); **notify instructor + payroll** | `approve_invoice`/`reject_invoice` exist; **no approver/rejection fields** (only an `InvoiceApproval` log); **no notifications**; reason stored in `notes` | ⚠️ |
| Payroll approval | "Ready to Pay" (manager_approved); mark **Paid** (+`payroll_approver_id`/`_at`, `payment_date`, `payment_reference`); **receipt notification** | Payroll only via `generate_payroll_batch` (bulk → PAID); **no per-invoice mark-paid**, no payroll approver fields on the invoice, no notification | ❌ |
| Reporting | Paid invoices feed Reports | Financial report exists | ✅ |
| Instructor-generated | Instructor picks a period, fills fields → manager approval | `generate` action is **`IsAdmin`**; `InvoiceViewSet` is `IsGymManager` — **instructors have no access at all** | ❌ Major |

**Core divergence:** the doc is an **instructor-centred** workflow (generate, review, edit, submit, self-raise). The system exposes invoicing only to managers/admins/payroll — **instructors cannot see or touch invoices**. The frontend only supports manager approve/reject.

**Solid foundation kept:** `generate_invoice_for_instructor` (rate resolution: override → class-type → default; per-head/blended; bonus rules), `InvoiceApproval` audit log, PDF generation, no-duplicate-per-period guard, tenant scoping.

---

## 2. Target design

### 2.1 State machine (`apps/invoices/state.py`)
```
DRAFT ─submit→ SUBMITTED ─manager approve→ MANAGER_APPROVED ─payroll mark-paid→ PAID
  ▲                │                              │
  │                └─reject→ REJECTED             └─(payroll_approved kept for back-compat)
  └── REJECTED ─submit (resubmit)→ SUBMITTED ; REJECTED/DRAFT editable by instructor
```
- Guarded transitions + audit; services stop writing `status =` ad hoc.
- `submit` allowed from **DRAFT or REJECTED** (amend-and-resubmit).
- Editable statuses: **DRAFT, REJECTED** (instructor).

### 2.2 Model additions (`Invoice`)
`manager_approver` (User), `manager_approved_at`, `payroll_approver` (User),
`payroll_approved_at`, `rejection_reason`, `rejected_by`, `rejected_at`,
`payment_date`, `payment_reference`. (`InvoiceApproval` log retained.)

`TenantSettings`: `pay_period_anchor_date` (DateField) — the configurable
period start; replaces the hardcoded epoch for fortnightly/8-weekly. Defaults to
`2024-01-01` so existing periods are unchanged.

### 2.3 Permissions & access (the core fix)
- **Instructor:** read/list **own** invoices; edit own DRAFT/REJECTED line items + notes; submit own; self-generate own. Object-level ownership (`invoice.instructor.user == request.user`).
- **Manager/Admin:** all invoices; approve / reject.
- **Payroll:** manager_approved ("Ready to Pay"); mark paid.
- New `IsInstructorOrAbove` reuse + per-action gating in the viewset.

### 2.4 Edit flagging
When an **instructor** edits a line item (rate/quantity/description), set
`is_flagged=True`, `flag_reason="Edited by instructor"` — managers see the
flag + a warning banner.

### 2.5 Services
- `submit_invoice`: DRAFT/REJECTED → SUBMITTED (notify managers).
- `approve_invoice`: SUBMITTED → MANAGER_APPROVED (set manager approver/at; notify instructor + payroll). (Keeps MANAGER_APPROVED → PAYROLL_APPROVED for back-compat.)
- `reject_invoice`: → REJECTED (+ rejection_reason/rejected_by/at; notify instructor).
- `mark_invoice_paid(invoice, paid_by, payment_date, payment_reference)`: MANAGER_APPROVED/PAYROLL_APPROVED → PAID (set payroll approver/at + payment fields; receipt notification).
- `generate_invoice_for_instructor` unchanged (compat); instructor self-generate wraps it scoped to self.

### 2.6 Notifications (`apps/invoices/notifications.py`)
Draft generated (instructor) · submitted (managers/admins) · manager-approved
(instructor + payroll) · rejected (instructor + reason) · paid (instructor,
receipt: reference + paid total).

### 2.7 Scheduler
`auto_generate_invoices` notifies each instructor when their draft is created;
uses `pay_period_anchor_date`. `send_invoice_reminders` actually notifies
instructors with unsubmitted drafts.

### 2.8 Frontend
- **Instructor Invoices:** list own; open DRAFT/REJECTED → edit line items (flagged), notes, **Save draft**, **Submit** (optional PDF); **Generate for a period**; rejection-reason banner.
- **Manager:** submitted list + **flagged-edit warning banner**; approve / reject (reason).
- **Payroll:** **Ready to Pay** (manager_approved) → **Mark Paid** (payment date + reference).
- **Settings:** pay-period **start date** + frequency.

---

## 3. Phases (one branch, one PR)
1. Models + migration (Invoice audit/payment fields; TenantSettings anchor) + `state.py`.
2. Services: state-routed approve/reject/submit; `mark_invoice_paid`; edit-flagging; notifications.
3. Permissions + views: instructor self-service (own list/edit/submit/generate); payroll mark-paid + Ready-to-Pay; manager approve/reject with fields.
4. Tasks: notify-on-generate; anchor-based periods; real reminders.
5. Frontend: instructor invoice view/edit/submit/generate; manager flagged banner; payroll mark-paid; settings start date.
6. Tests: backend (pytest) + frontend (vitest UI automation).

**Compatibility:** existing `generate_invoice_for_instructor`, `submit_invoice`,
`approve_invoice` (submitted→manager_approved→payroll_approved), `reject_invoice`
contracts preserved; existing invoice tests stay green. New behaviour is additive.
