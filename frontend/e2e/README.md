# End-to-end tests

Driven the way a person drives the app: every test navigates by clicking menu
items and buttons. No test visits a URL beyond the front door, and none calls
the API directly.

That constraint is the point. The Cover Board's Accept button spent months
posting to a route that did not exist — a test that reached the page by URL and
checked it rendered would have passed the whole time.

## Running them

The app and its database need to be up (`docker compose up -d`, plus the Vite
dev server on :5173).

```bash
cd frontend
npm run e2e              # everything
npm run e2e:ui           # watch it happen
npm run e2e:report       # last HTML report
```

## Order matters

Files run one at a time, in name order, and build on each other: a class needs
a class type, cover needs a class with an instructor. **Running a single file
on its own will usually fail**, because the reset clears what the earlier files
create.

To work on one file, run the ones before it too:

```bash
npx playwright test e2e/01 e2e/02 e2e/03 e2e/04
```

## The database

`global-setup.ts` runs `seed_e2e_owner --reset` before the suite. That creates
the owner account the tests sign in as, and removes records left by earlier
runs so the suite is repeatable.

The reset only deletes rows whose name starts with `E2E `, so anything created
by hand in the same gym is left alone. Set `E2E_SKIP_SEED=1` to skip it.

## Configuration

| Variable | Default |
|---|---|
| `E2E_BASE_URL` | `http://localhost:5173` |
| `E2E_EMAIL` | `e2e-owner@example.com` |
| `E2E_PASSWORD` | `e2e-password-123` |
| `E2E_SEED_COMMAND` | the docker compose seed command |
| `E2E_SKIP_SEED` | unset |

## Not covered yet

**Signing up a new gym.** The signup form collects a card through Stripe
Elements and the server then calls Stripe, so a real test needs Stripe *test*
keys — including `VITE_STRIPE_PUBLISHABLE_KEY`, which Vite bakes in at build
time. Worth adding once those exist.

**Attendance and invoices.** The flows are covered by API-level tests in
`tests/test_e2e_attendance_and_invoicing.py`; the click-through versions are
still to write.

## In CI

The `UI Tests` job runs the whole suite on every pull request. It has no nginx,
so Vite proxies straight to Django via `VITE_API_PROXY_TARGET`, and the gym is
registered against `127.0.0.1` because `changeOrigin` makes that the Host the
backend sees.

It also needs a file-backed database rather than the in-memory one the Python
tests use: `migrate` and `runserver` are separate processes, and an in-memory
SQLite dies with the one that made it. Hence `CI_SQLITE_PATH`.

On failure the HTML report is uploaded as an artifact, with traces, videos and
screenshots of the failing step.
