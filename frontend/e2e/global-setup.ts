import { execSync } from 'node:child_process'

/**
 * Puts the database into a known state before the suite runs.
 *
 * Without this the suite is not repeatable: a second run finds the class it
 * meant to assign an instructor to already assigned, and fails for a reason
 * that has nothing to do with the code. The command only removes rows prefixed
 * "E2E ", so anything created by hand survives.
 *
 * Set E2E_SKIP_SEED=1 to run against a database prepared some other way.
 */
export default function globalSetup() {
  // The day the shared test class is scheduled for, fixed once per run so
  // every file looks for it on the day it was created, even if the run
  // crosses midnight. See upcomingClassDate in helpers.ts. Always set here,
  // never taken from the shell, so a stale value can't make the class a
  // past one.
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  process.env.E2E_CLASS_DATE = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`

  if (process.env.E2E_SKIP_SEED === '1') return

  const command =
    process.env.E2E_SEED_COMMAND ??
    'docker compose exec -T web python manage.py seed_e2e_owner --domain localhost --reset'

  try {
    const output = execSync(command, { encoding: 'utf8', stdio: 'pipe' })
    process.stdout.write(output.replace(/^time=.*$/gm, ''))
  } catch (error) {
    throw new Error(
      `Could not prepare the test database.\n\n` +
        `Tried: ${command}\n\n` +
        `The app and its database need to be running. Set E2E_SKIP_SEED=1 to ` +
        `skip this if you have prepared it another way.\n\n` +
        `${(error as Error).message}`,
    )
  }
}
