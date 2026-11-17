# UI polish checklist

Work top to bottom. Earlier sections hurt people more. For each item, the
"why" says what goes wrong for a gym owner or instructor if it's missed.

Items marked **(behaviour)** change what the app does, not only how it
looks: they need a test and may need the owner (see SKILL.md step 3).

## 1. Phone (390px wide, plus 360px for small Androids)

Instructors check cover and timetables on their phones between classes, so a
broken phone layout locks them out.

- [ ] No horizontal page scroll. Check with
      `document.documentElement.scrollWidth <= innerWidth`.
- [ ] Nothing clipped or hidden under the top bar or sidebar.
- [ ] Every tap target is at least 44×44px (icon buttons especially: pad them,
      don't just enlarge the icon).
- [ ] Rows of buttons wrap (`flex-wrap`) or stack (`flex-col sm:flex-row`)
      instead of overflowing.
- [ ] `PageHeader` actions don't crush the title. Long titles wrap, and
      actions drop below on narrow screens if needed.
- [ ] Tables: wrapped in `overflow-x-auto`, or switched to a stacked card
      list under `sm:`. Key column (name/time) stays visible.
- [ ] Modals fit: content scrolls inside, and primary actions sit in the
      `footer` prop so they never scroll away.
- [ ] Inputs under 16px make iOS zoom on focus. The kit's `Input`/`Select`
      are `text-sm`, so this is a kit-wide change: note it for the owner
      rather than fixing it one screen at a time.
- [ ] Long names (staff, class types, gym names) truncate or wrap without
      pushing controls off-screen (`min-w-0` + `truncate` on flex children).

## 2. States

A blank area reads as "broken". A spinner that never ends reads as "frozen".

- [ ] **Loading**: `PageSpinner` for a whole page, `Spinner size="sm"` inline.
      Avoid layout jump when data arrives (reserve height where easy).
- [ ] **Empty**: `EmptyState` with a title saying what's missing and, where
      the user can fix it, an `action` (e.g. "Add your first class type").
      Distinguish "nothing yet" from "nothing matches your filters", and offer
      `ClearFiltersButton` for the latter.
- [ ] **Error**: query errors show a message, not a silent empty state.
      Adding a retry button is **(behaviour)**.
- [ ] **Saving**: submit buttons use `isLoading` (disables and shows a spinner)
      so a double-click can't submit twice.
- [ ] **Success**: mutations confirm with a toast (`toast.success`), and the
      list updates. Adding a missing query invalidation is **(behaviour)**.
- [ ] **Permission**: a control a role can't use, shown and then refused, is
      worth noting. Hiding it with `RoleGuard` changes what a role sees, so
      ask the owner first.

## 3. Words

The people using this run gyms, not software. Every message should tell them
what happened and what to do next.

- [ ] Buttons say what they do, as a verb: "Save Changes", "Cancel Cover
      Request", not "OK" / "Submit".
- [ ] Destructive confirmations name the thing and the consequence: "Cancel
      Monday 6am Spin? Instructors who offered will be told."
- [ ] Toasts for a failed request or save start with "Failed to …" (e2e
      `expectNoErrorToast` relies on that prefix) and add the reason when the
      server gave one. Validation messages instead say what to do ("Select at
      least one day").
- [ ] No raw API errors, field keys (`start_datetime`), status enums
      (`needs_cover`) or stack traces on screen. Map them to words ("Needs
      Cover").
- [ ] Match the app's casing: Title Case for buttons, headings and menu
      items. Use the same terms on every screen (pick "class" or "session"
      and keep it).
- [ ] Dates and times are shown in the gym's timezone and in one format
      across the app.
- [ ] Same rules for emails and WhatsApp messages if the change touches them.

## 4. Consistency

- [ ] Shared components used instead of hand-rolled equivalents (grep for raw
      `<button className=`, `<input className=`, custom modal backdrops).
- [ ] Status shown with `Badge` using the same variant for the same status on
      every screen (e.g. cover `open` = the same colour everywhere).
- [ ] One primary button per view. Others `secondary` / `ghost`. Destructive
      actions use `danger`.
- [ ] Page structure: `PageHeader` → filters → content, matching sibling
      pages.
- [ ] Colours from the scale only: cyan (brand), gray (text/borders), red
      (danger), and the Badge variants for status. No new hex values.
- [ ] Icons from `lucide-react` only, sized `h-4 w-4` inline / `h-5 w-5` in
      headers.

## 5. Access

- [ ] Every input has a visible `<label>` (or `aria-label` for icon-only
      controls). Playwright's `getByLabel` should find it.
- [ ] Icon-only buttons have an `aria-label`.
- [ ] Clickable things are `<button>` or `<a>`, not `<div onClick>`. `Card
      onClick` is a div. Making it keyboard-operable is **(behaviour)**: add
      a Vitest test.
- [ ] Focus is visible (the kit's `focus:ring-2`). Don't add
      `outline-none` without a ring.
- [ ] Keyboard: Tab reaches every control in a sensible order. `Modal` has
      no Escape handler today. Adding one is a kit-wide **(behaviour)**
      change.
- [ ] Contrast: body text `text-gray-700`+ on white, secondary `text-gray-500`
      minimum. Never put meaning in colour alone; pair it with a word or icon.

## 6. Visual rhythm

Last, because it matters least, but it is what makes a screen feel finished.

- [ ] Spacing from the scale and consistent within a screen (sections
      `space-y-6`, card internals `p-4`, form fields `space-y-4`, inline
      `gap-2`).
- [ ] Things that belong together are aligned on a shared edge. Numbers in
      tables are right-aligned and use `tabular-nums`.
- [ ] Clear hierarchy: one `h1` (PageHeader), section titles
      `text-base font-semibold`, body `text-sm`.
- [ ] Cards and borders consistent (`rounded-lg border-gray-100 shadow-sm`, as
      in `Card`).
