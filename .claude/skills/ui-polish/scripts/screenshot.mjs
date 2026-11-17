#!/usr/bin/env node
/**
 * Before/after screenshots of one FitOps screen at phone and desktop widths.
 *
 * Signs in at the front door, then reaches the screen by clicking visible menu
 * items / tabs / buttons, the same way a person (and the e2e suite) does, so
 * a broken link shows up here too. It never types an inner URL.
 *
 *   node .claude/skills/ui-polish/scripts/screenshot.mjs \
 *     --steps "Settings,General" --label before [--out DIR] [--widths 360,390,1280]
 *
 * Env: E2E_BASE_URL (default http://localhost:5173), E2E_EMAIL, E2E_PASSWORD
 * (defaults match frontend/e2e/helpers.ts). For local/dev servers only.
 */
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

// Resolve Playwright from frontend/, wherever this is run from.
const frontendPkg = fileURLToPath(new URL('../../../../frontend/package.json', import.meta.url))
let chromium
for (const req of [createRequire(frontendPkg), createRequire(import.meta.url)]) {
  for (const mod of ['@playwright/test', 'playwright']) {
    try {
      ;({ chromium } = req(mod))
      break
    } catch {}
  }
  if (chromium) break
}
if (!chromium) {
  console.error('Playwright not found. Run: cd frontend && npm ci && npx playwright install chromium')
  process.exit(1)
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  const v = process.argv[i + 1]
  if (!v || v.startsWith('--')) {
    console.error(`--${name} needs a value`)
    process.exit(2)
  }
  return v
}

const steps = arg('steps', '').split(',').map((s) => s.trim()).filter(Boolean)
const label = arg('label', 'shot')
const out = resolve(arg('out', join(tmpdir(), 'ui-polish-shots')))
const widths = arg('widths', '360,390,1280').split(',').map(Number)
if (widths.some((w) => !Number.isInteger(w) || w < 200 || w > 4000)) {
  console.error('--widths must be comma-separated pixel widths, e.g. 360,390,1280')
  process.exit(2)
}
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const email = process.env.E2E_EMAIL ?? 'e2e-owner@example.com'
const password = process.env.E2E_PASSWORD ?? 'e2e-password-123'
const TIMEOUT = 15_000

mkdirSync(out, { recursive: true })

const named = (page, name) =>
  page.getByRole('link', { name, exact: true })
    .or(page.getByRole('tab', { name, exact: true }))
    .or(page.getByRole('button', { name, exact: true }))

/** Waits for, then clicks, the visible control named `name`. */
async function clickNamed(page, name) {
  const target = named(page, name).filter({ visible: true }).first()
  const menu = page.getByRole('button', { name: 'Open menu' })
  // On a phone the sidebar sits behind the menu button.
  try {
    await target.waitFor({ timeout: 3_000 })
  } catch {
    if (await menu.isVisible()) await menu.click()
    try {
      await target.waitFor({ timeout: TIMEOUT })
    } catch {
      throw new Error(`No visible link, tab or button named exactly "${name}"`)
    }
  }
  await target.click()
}

/** Lets data arrive: network quiet and no spinner on screen. */
async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.locator('.animate-spin').first().waitFor({ state: 'hidden', timeout: TIMEOUT }).catch(() => {})
}

const browser = await chromium.launch()
try {
  for (const width of widths) {
    const phone = width < 768
    const page = await browser.newPage({
      viewport: { width, height: phone ? 844 : 900 },
      deviceScaleFactor: 2,
      isMobile: phone,
      hasTouch: phone,
    })
    await page.goto(baseURL)
    await page.getByLabel('Email address').fill(email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    const signedIn = page.getByRole('link', { name: 'Dashboard' })
      .or(page.getByRole('button', { name: 'Open menu' }))
      .filter({ visible: true }).first()
    try {
      await signedIn.waitFor({ timeout: TIMEOUT })
    } catch {
      throw new Error(`Sign-in failed at ${baseURL} as ${email}. Check E2E_EMAIL / E2E_PASSWORD.`)
    }
    await settle(page)
    for (const step of steps) {
      await clickNamed(page, step)
      await settle(page)
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    const file = join(out, `${label}-${width}.png`)
    await page.screenshot({ path: file, fullPage: true })
    console.log(`${file}${overflow > 0 ? `  ⚠ page scrolls sideways by ${overflow}px` : ''}`)
    await page.close()
  }
} finally {
  await browser.close()
}
