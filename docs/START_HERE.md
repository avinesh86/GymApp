# Start Here: FitOps for Beginners

New to coding? Start with this page. It explains what FitOps is, the few
words you need to know, and how to make changes safely with Claude doing the
coding.

When you're comfortable, read `docs/RUNBOOK.md` for the day-to-day
procedures.

---

## What is FitOps?

A website that gyms use to run their operations: class timetables, staff,
cover for absent instructors, attendance counts, invoices and reports. One
copy of the website serves many gyms. Each gym (called a **tenant**) only sees
its own data.

It has two halves:

- **Backend** (`apps/`, `fitops/`): the part that stores data and applies
  the rules. Written in **Python** with **Django**.
- **Frontend** (`frontend/`): the screens people click on. Written in
  **TypeScript** with **React**.

You don't need to know either language to get started. Claude writes the
code; your job is to describe what you want, check the result, and decide
what goes live.

---

## Words you'll see

| Word | Meaning |
|---|---|
| **Repository (repo)** | The project folder, stored on GitHub: https://github.com/avinesh86/GymApp |
| **Commit** | A saved snapshot of changes, with a message saying what changed. |
| **Branch** | A separate copy of the code where a change is made without affecting anyone else. |
| **`main`** | The branch that is live. Anything merged here goes to the real website. |
| **`test`** | The branch where finished changes wait before going live. |
| **Pull request (PR)** | A request to move a branch's changes into another branch. It shows exactly what changed, and is where you review and approve. |
| **Merge** | Accepting a pull request, so its changes join the target branch. |
| **CI** | Automatic checks GitHub runs on every pull request: tests, code style and a build. Green tick = passed, red cross = something broke. |
| **Test** (in code) | A small program that checks a feature works. If someone breaks the feature later, its test fails. |
| **Deploy** | Putting a new version on the live server. Here it happens automatically when `main` changes. |
| **Migration** | A change to the database structure, such as a new column. Created alongside the code that needs it. |
| **Docker** | Runs the whole app on your computer in one command, with the same setup as the server. |

---

## How a change goes live

```
 your idea
    │
    ▼
 Claude makes a branch from `test` and writes the code + tests
    │
    ▼
 Pull request into `test` ──► CI checks (must be green) ──► you review ──► merge
    │
    ▼
 Release: pull request from `test` into `main` ──► CI ──► merge
    │
    ▼
 Automatic deploy to the live website (with backup and auto-rollback)
```

Nothing reaches the live site without two pull requests and green checks
along the way. That's your safety net.

---

## Your first day

### 1. Get access

Work through the **Access checklist** in `docs/RUNBOOK.md`. At minimum you
need GitHub access to the repo and Claude Code connected to GitHub.

### 2. Look around on GitHub

Open https://github.com/avinesh86/GymApp and try:

- **Code** tab: the files. `README.md` is shown underneath.
- **Pull requests** tab: open a merged one and look at **Files changed**.
  Green lines were added, red lines were removed.
- **Actions** tab: the CI and Deploy runs, with green ticks or red crosses.

### 3. Ask Claude a question (no changes)

Open Claude Code on the repo and ask things like:

- "Explain what this project does, in simple terms."
- "Where is the code for the Attendance page, and how does saving a count
  work?"
- "What happens when a cover request is cancelled?"

Asking questions changes nothing, so it's a safe way to learn.

### 4. Make a small change

Pick something small and low-risk, such as a wording change on a page:

> "On the Attendance page, change the 'How many attendees?' label to
> 'People in class'. Branch off `test`, and open a pull request into `test`."

Then follow **Making a change with Claude** in `docs/RUNBOOK.md`.

For more ready-to-use prompts, see **Working with Claude** in `README.md`.
The shortest one is: "Follow the runbook and fix this: <what's wrong>."

---

## Running the app on your own computer (optional)

Useful for trying a change before it goes live. Install
[Docker Desktop](https://www.docker.com/products/docker-desktop/), then follow
**Local Development with Docker** in `README.md`, steps 1 to 4. At the end you
open http://localhost:3000 and log in with `admin@demogym.com` /
`FitOps2024!`.

If something doesn't start, check the **Troubleshooting setup** table in the
README, or copy the error into Claude and ask what's wrong.

---

## Golden rules

1. **Never change `main` directly.** Always go through `test` and a pull
   request.
2. **Ask for tests** with every bug fix and feature.
3. **Only merge green pull requests.** A red cross means something is broken.
4. **Small changes.** One thing per pull request.
5. **Don't paste passwords or secret keys** into chats, pull requests or code.
   They belong in `.env` files on the server or in GitHub Secrets.
6. **Not sure? Ask Claude to explain** before merging anything.

---

## Where to find things

| You want to… | Look in |
|---|---|
| Release, roll back, fix a failed deploy | `docs/RUNBOOK.md` |
| Technical setup and deploy details | `README.md` |
| What Claude is told about the project | `CLAUDE.md` |
| Domain and HTTPS setup | `DEPLOY_DOMAIN.md` |
| Backend code for a feature | `apps/<feature>/`, e.g. `apps/attendance/` |
| Screens for a feature | `frontend/src/pages/<feature>/` |
| Automated tests | `tests/` (backend), `*.test.tsx` files (frontend) |
