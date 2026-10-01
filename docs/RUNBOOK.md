# FitOps Runbook

How to look after FitOps day to day: making changes with Claude, releasing
them, and fixing things when they go wrong. Written so someone new to the
project can pick it up.

For deeper technical detail, see `README.md` (setup, deploys, rollbacks),
`DEPLOY_DOMAIN.md` (domain and TLS) and `CLAUDE.md` (what Claude is told about
the codebase).

---

## 1. Access checklist

You need all of these before you can work on FitOps on your own.

| What | Why | How to get it |
|---|---|---|
| GitHub access to `avinesh86/GymApp` | Read code, review and merge pull requests | Repo owner adds you under **Settings → Collaborators** |
| Claude Code (claude.ai/code or the Claude app) | Make changes by asking Claude | A Claude plan with Claude Code, then connect GitHub at claude.ai/connect-github |
| Claude GitHub App on the repo | Lets Claude push branches and open pull requests | Install at https://github.com/apps/claude/installations/select_target |
| SSH access to the production server | Emergency fixes and manual rollbacks only | Repo owner adds your SSH key to the server |
| Django admin login | Manage gyms (tenants), users and data | Repo owner creates a superuser for you |

### Services and renewals

Everything FitOps depends on that costs money or expires. Keep this table up
to date so nothing lapses unnoticed.

| Service | Used for | Account owner | Renewal date | Cost | How to renew |
|---|---|---|---|---|---|
| Server / hosting | Runs the app | TBC | TBC | TBC | TBC |
| Domain (`northernarena.co.nz`, DiscountDomains) | `fitops.` subdomain | TBC | TBC | TBC | TBC |
| TLS certificate (Let's Encrypt) | HTTPS | — | Auto-renews every 90 days | Free | Automatic via the `certbot` container |
| WhatsApp / messaging provider | Notifications | TBC | TBC | TBC | TBC |
| Claude plan | Development with Claude | TBC | TBC | TBC | TBC |
| GitHub | Code, CI, deploys | TBC | TBC | TBC | TBC |

---

## 2. Branches

| Branch | What it is | Who writes to it |
|---|---|---|
| `main` | **Production.** Every merge here deploys to the live site automatically. | Only release pull requests from `test`, and hotfixes |
| `test` | **Next release.** Finished changes collect here and are checked before going live. | Pull requests from feature branches |
| `claude/...`, `feature/...`, `fix/...` | One change each | Claude or a developer |

Rules:

- Never commit straight to `main` or `test`. Always go through a pull request.
- New work branches off `test`, and its pull request targets `test`.
- `main` only moves forward by a release (section 4) or a hotfix (section 5).

> There is no separate test server yet. "Test" means the change has passed CI
> and been reviewed, not that it has been clicked through on a staging site.
> Check changes locally with Docker (see `README.md`) before releasing.

---

## 3. Making a change with Claude

1. Open Claude Code on the `avinesh86/GymApp` repo.
2. Describe what you want in plain words. Include steps to reproduce for bugs.
   Examples:
   - "Changing a class's start and end time doesn't save. Find the cause, fix
     it, and add tests. Branch off `test` and open a pull request into `test`."
   - "Make only name and email compulsory in the staff CSV import. Add tests."
   - "Add an 'Import CSV' button to the Timetable page that opens the CSV
     import with Timetable selected."
3. Claude makes a branch from `test`, changes the code, runs the tests and
   opens a pull request into `test`.
4. On the pull request, wait for **CI** to go green (Python tests, lint,
   frontend build, UI tests). If it's red, ask Claude: "CI failed on the PR, fix it."
5. Read the pull request description and, for anything user-facing, try it
   locally. Ask Claude to explain anything you don't follow.
6. Merge the pull request into `test` (**Squash and merge** is fine here).

Tips:

- Every bug fix and every feature comes with tests. See section 8 for what
  kind, and how to check they're real.
- One change per pull request. Small pull requests are easier to check and
  easier to undo.
- Ask Claude to "watch the PR" and it will respond to CI failures and review
  comments for you.

---

## 4. Releasing `test` to `main` (going live)

Do this when `test` has changes you want live, ideally at a quiet time for
the gym.

1. **Check `test` is green.** On GitHub, open the `test` branch's latest
   commit and confirm CI passed.
2. **Open the release pull request.** On GitHub: **Pull requests → New pull
   request**, base `main`, compare `test`. Title it e.g.
   `Release 2026-10-05`. The description should list what's in it: the
   commits list on the pull request shows you, or ask Claude: "Open a release
   pull request from `test` to `main` and summarise what's in it."
3. **Look for risky changes.** Anything touching `migrations/` changes the
   database. That's normal, but release those when you have time to watch the
   deploy.
4. **Wait for CI** on the release pull request to pass.
5. **Merge with "Create a merge commit".** Not squash. A merge commit keeps
   `test` and `main` in step so the next release doesn't show old changes
   again.
6. **Watch the deploy.** GitHub → **Actions → Deploy**. It waits for CI on
   `main`, then backs up the database, applies migrations, rebuilds and
   health-checks the site. It takes a few minutes.
7. **Check the live site.** Log in, open the pages that changed, and confirm
   they work.

If the deploy fails its health check, it rolls the code back by itself; see
section 6.

---

## 5. Hotfix (urgent fix to production)

For when something live is broken and can't wait for the next release.

1. Ask Claude: "Hotfix: <problem>. Branch off `main`, fix it with a test, and
   open a pull request into `main`."
2. Wait for CI, merge (**Create a merge commit**). It deploys automatically.
3. **Bring the fix back into `test`**, or the next release will undo it: open
   a pull request with base `test`, compare `main`, and merge it.

---

## 6. When things go wrong

### The deploy failed

GitHub → **Actions → Deploy** → the failed run → the **Deploy over SSH** step.
The script ends with one of:

| Exit code | Meaning | What to do |
|---|---|---|
| 1 | Deploy failed, code rolled back automatically | The site is on the previous version. Read the log for the cause, fix it on a branch, release again. |
| 2 | Deploy failed **and** the rollback failed | The site may be down. Follow "Roll back by hand" below, or ask for help straight away. |

### A release is live but wrong

Quickest safe fix: on GitHub, open the merged release pull request and click
**Revert**. Merge the revert pull request into `main` and it deploys the old
code. Then merge `main` back into `test` (as in section 5, step 3) and fix the
problem properly.

### Roll back by hand (on the server)

See `README.md` → **Reverting a bad deploy** for exact commands. In short:
reset the code to the last good commit and restart the containers. Restore
the database from `backups/` **only** if the database itself is the problem,
because it throws away everything saved since the backup.

### Redeploy without a code change

GitHub → **Actions → Deploy → Run workflow**. You can enter a branch or commit
to deploy a specific version.

### Common problems

| Symptom | Likely cause | Fix |
|---|---|---|
| "Tenant not found" on login | The site's domain isn't linked to a gym | Add a `TenantDomain` in Django admin (see `README.md` → Tenant Setup Guide) |
| Deploy rolls back but the site looks fine | Health check was refused with "DisallowedHost" | Check `ALLOWED_HOSTS` in the server's `.env` (see `README.md` → Deploying) |
| Times or dates off by several hours | Timezone: the database stores UTC, the gym is not UTC | Ask Claude to check the gym's timezone handling on that page |
| CI fails on "Check for missing migrations" | A model changed without a migration | Ask Claude to create the migration |
| Frontend change not showing after deploy | Browser cached the old version | Hard refresh (Ctrl+Shift+R / Cmd+Shift+R) |

---

## 7. One-time GitHub setup (repo owner)

These settings stop mistakes such as pushing straight to production.

1. **Branch protection** (Settings → Branches → Add rule), for both `main` and
   `test`:
   - Require a pull request before merging.
   - Require status checks to pass: **Python Tests**, **Lint & Format Check**,
     **Frontend Build Check**, **UI Tests**.
2. **Default branch** (Settings → General): set to `test`, so new pull
   requests target `test` by default.
3. **Deploy secrets** (Settings → Secrets and variables → Actions):
   `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KEY`, `DEPLOY_PATH`, optional
   `DEPLOY_PORT`, and the `PRODUCTION_URL` variable. These already exist if
   deploys work today.

---

## 8. Tests: what every change needs

Tests are what stop a fixed bug from coming back and a working feature from
quietly breaking. CI runs them all on every pull request, so they only help
if each change adds its own.

### The rules

1. **Every bug fix and every feature comes with tests.** A pull request
   without them isn't finished, however small the change.
2. **A bug fix's test must fail before the fix and pass after it.** Otherwise
   it doesn't prove anything. Ask Claude to show you both results.
3. **Never weaken, skip or delete an existing test to make CI pass.** If a
   test fails, either the code is wrong or the test is out of date, and the
   pull request should say which and why.
4. **Anything a person clicks through needs a UI test** (see below).

### Which kind of test

| The change touches… | Add a… | Lives in | Run with |
|---|---|---|---|
| Rules, data, permissions, API (Django) | Backend test (pytest) | `tests/test_<area>.py` | `docker compose exec web pytest` |
| One screen or component's behaviour | Frontend unit test (Vitest) | next to the component, `*.test.tsx` | `cd frontend && npm test` |
| A journey through the app: menus, buttons, forms, saving | UI test (Playwright) | `frontend/e2e/*.spec.ts` | `cd frontend && npm run e2e` |

Most features need more than one: a backend test for the rule, and a UI test
that a person can actually reach and use it.

### UI tests: click real buttons and links, never type a URL

A UI test must reach every page **the way a person would**: sign in, then
click the menu item, tab, button or link. It must not jump to a page by
typing its address (for example `page.goto('/timetable')`), and must not call
the API directly. The only address a test may visit is the app's front door.

Why: a page can work perfectly while **the button or link that should lead to
it is missing, hidden, or points to the wrong place**. A test that opens the
page by URL passes anyway, and the broken navigation ships. This has happened
here: the Cover Board's Accept button posted to a route that didn't exist for
months, and only a click-through test would have caught it.

So for every new page, button, tab or dialog, the UI test should:

- Get there by clicking from the menu or another page, using the visible label
  (helpers in `frontend/e2e/helpers.ts` such as `goToSection` and
  `openSettingsTab` do this).
- Do the real action: fill the form, press **Save**, confirm the result
  appears on screen.
- Check the success message appears and no error message does
  (`expectToast`, `expectNoErrorToast`).

How the suite is organised and run is in `frontend/e2e/README.md`.

### Asking Claude for tests

Add this to any request, or rely on "Follow the runbook…", which includes it:

> "Add tests: a backend test for the logic, and a Playwright UI test that
> reaches the feature by clicking through the menus and buttons, not by URL.
> Show me the new test failing before the fix and passing after."
