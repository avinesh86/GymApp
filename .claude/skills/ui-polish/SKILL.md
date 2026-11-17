---
name: ui-polish
description: >
  Polish the FitOps frontend (React + TypeScript + Tailwind): tidy spacing and
  alignment, make screens consistent with the shared components, fix mobile
  layouts, add missing loading / empty / error states, sharpen labels and error
  messages, and improve keyboard and screen-reader access. Use this whenever
  someone asks to polish, tidy, clean up, make nicer, fix the look of, or
  "make it feel finished" for a page, modal, table, form or component in
  frontend/src, or says something looks off, cramped, misaligned or squashed
  on a phone, even if they never say "polish". Also use its checklist when
  doing the UI review of a pull request.
---

# UI polish for FitOps

Polish means making a screen feel finished without changing what it does:
people should find things where they expect, understand every label and
message, and be able to use the screen on a phone. It is **not** a redesign
and not a bug fix.

- If a change would move, rename or remove something people already use,
  ask the owner first.
- If the "polish" request is really a bug (wrong data, a button that does
  nothing, a crash), treat it as a bug fix under RUNBOOK §8 instead: write a
  test that fails first, then fix it.

**Reviewing a PR instead of polishing?** Use `references/checklist.md` only.
Report each finding as problem → where (file:line) → suggested fix, and mark
whether you confirmed it. Don't edit code or take screenshots unless asked.

## 1. Scope before touching anything

1. Identify the screen(s): the route-level page in `frontend/src/pages/<domain>/`
   plus any modals or components it opens.
2. Read the page and every shared component it uses. The shared kit lives in
   `frontend/src/components/ui/` (Button, Badge, Card, ConfirmDialog,
   EmptyState, Input, Modal, Pagination, Select, Spinner, Table,
   ClearFiltersButton), `components/shared/` (PageHeader, RoleGuard) and
   `components/layout/`.
3. Find how the same problem is already solved elsewhere (`grep` other pages)
   and copy that. Consistency across screens is worth more than a locally
   prettier one-off.

## 2. Look at it before changing it

Code alone hides most layout problems. When the app is running (Vite on
`:5173` plus the backend, see `frontend/e2e/README.md`), capture "before"
screenshots at phone and desktop widths:

```bash
node .claude/skills/ui-polish/scripts/screenshot.mjs --steps "Cover Board" --label before --out <scratchpad>/shots
```

`--steps` is a comma-separated list of the exact visible names of the menu
items, tabs or buttons to click after signing in. Examples:
`"Settings,General"` and `"Staff"`. Read the real labels from
`components/layout/Sidebar.tsx` or the page, because names must match
exactly. The script reaches the screen by clicking, as a person would. It
writes `<label>-<width>.png` for widths 360, 390 and 1280, and warns when the
page scrolls sideways. Look at the shots with the Read tool. It needs
Playwright installed in `frontend/` and is for local or dev servers only.

If the app can't run in this environment, say so, then work from the code and
lean harder on the Vitest/Playwright checks in step 5. Don't claim you
checked something visually that you didn't.

## 3. Walk the checklist

Go through `references/checklist.md` for the screen. It covers, in priority
order:

1. **Broken on a phone**: overflow, clipped text, controls off-screen, tap
   targets under 44px, tables that need a scroll wrapper or card layout.
2. **Missing states**: loading (`PageSpinner` / `Spinner`), empty
   (`EmptyState` with a next step), error (a message that says what failed
   and what to do), disabled/saving (`Button isLoading`).
3. **Words**: labels, buttons, toasts, errors and confirmations in plain
   language.
4. **Consistency**: shared components and the existing Tailwind scale instead
   of ad-hoc classes.
5. **Access**: keyboard, focus, labels, roles, contrast.
6. **Visual rhythm**: spacing, alignment, hierarchy.

Some checklist items change behaviour, not just looks. They are marked
**(behaviour)**. Those need a test, and if users will notice the difference,
a line under **Needs your decision** in the PR. Anything that changes what a
role can see or do is a permissions change. Ask the owner before touching
it.

Write down what you find as a short list (problem → screen → fix) before
editing. Fix the top categories first. If time is short, a phone fix beats a
spacing tweak.

## 4. Make the changes

- **Use the kit.** Use `<Button variant=…>`, not a hand-styled `<button>`.
  Use `<Badge>` for status, `<Modal footer=…>` for actions that must always
  stay visible, `<ConfirmDialog>` for destructive actions, `<PageHeader>`
  for page titles. If the kit is missing a variant, adding one is fine. But
  changing an existing kit style changes every screen that uses it, so check
  them all and mention it in the PR.
- **Stay on the existing scale.** The brand colour is `cyan-*` (the
  `primary-*` alias in `tailwind.config.ts` exists but nothing uses it, so
  stick with `cyan`). Neutrals are `gray-*`, red is for danger and errors,
  and status colours are the Badge variants. Spacing is the Tailwind scale
  (`gap-2`, `p-4`, `mb-6`…). No arbitrary values (`mt-[13px]`) unless
  nothing else fits. There is no dark mode, so don't add `dark:` classes.
- **Match existing conventions**, including Title Case on buttons, headings
  and menu items ("Save Changes", "Cover Board"). Changing a convention
  across the app is the owner's call, not a polish fix.
- **Mobile first.** Base classes are for the phone. Widen with `sm:` / `md:` /
  `lg:`. Long names wrap or truncate (`truncate`, `min-w-0` on flex children),
  and they should never push a button off-screen.
- **Don't change behaviour by accident.** Keep data fetching, query keys,
  permissions (`RoleGuard`) and timezone handling as they are. Never
  date-filter with `isToday()`. A behaviour change made on purpose is
  flagged as above.
- **Keep accessible names stable** where Playwright tests use them
  (`getByRole('button', { name: 'Save Changes' })`). If you rename a visible
  label, update every spec that uses it in the same change, and say so in the
  PR.

## 5. Prove it

1. After screenshots at the same widths (`--label after`). Compare them with
   the before shots and look for regressions, not just the fix.
2. `cd frontend && npx tsc --noEmit && npm run lint && npm test`
3. Tests, per RUNBOOK §8. Polish still needs them when behaviour or layout
   guarantees change:
   - New or changed state (empty, error, loading, disabled), or any
     **(behaviour)** item: add a **Vitest** test next to the component
     (`*.test.tsx`).
   - Layout that must hold on a phone, or a control people must reach: add
     a **Playwright** spec in `frontend/e2e/` that sets a phone viewport,
     reaches the screen by clicking (`signIn`, `goToSection`,
     `openSettingsTab` from `helpers.ts`), never `page.goto()` to an inner
     URL, and asserts with bounding boxes. `15-mobile-header.spec.ts` is the
     model to copy.
   - A bug fix's test must fail before the fix. Run it before and after.
   - Purely cosmetic changes (spacing, colour within the scale) need no new
     test. Say that in the PR.
4. Never weaken, skip or delete an existing test to get green.

## 6. Report

In the PR (or your reply), list each change as **problem → fix → where**,
attach or reference before/after screenshots, and list anything you noticed
but deliberately left alone, so the owner can decide. A PR from this work
still gets the four reviews in RUNBOOK §9. The UI review matters most here.
