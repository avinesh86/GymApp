import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GeneralTab } from './GeneralTab'
import {
  getTenantSettings,
  updateTenantSettings,
  getTenantBranding,
  updateTenantBranding,
} from '../../../api/settings'

vi.mock('../../../api/settings', () => ({
  getTenantSettings: vi.fn(),
  updateTenantSettings: vi.fn(),
  getTenantBranding: vi.fn(),
  updateTenantBranding: vi.fn(),
}))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <GeneralTab />
    </QueryClientProvider>,
  )
}

const SETTINGS = { currency_symbol: '£', timezone: 'Pacific/Auckland' }
const BRANDING = { app_name: 'Harbour Gym', logo_url: null, primary_color: '#06b6d4' }

/** A request that stays in flight until the test calls `finish`. */
function pending<T>() {
  let finish: (value: T) => void = () => {}
  const promise = new Promise<T>((resolve) => (finish = resolve))
  return { promise, finish: (value: T) => finish(value) }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getTenantSettings).mockResolvedValue(SETTINGS as never)
  vi.mocked(getTenantBranding).mockResolvedValue(BRANDING as never)
  vi.mocked(updateTenantSettings).mockResolvedValue({} as never)
  vi.mocked(updateTenantBranding).mockResolvedValue({} as never)
})

describe('Settings → General', () => {
  it("offers nothing to change or save until the gym's settings have loaded", async () => {
    // Saving the starting defaults would reset the gym's timezone to UTC
    // (shifting every date on the site) and its currency to $.
    const settings = pending<unknown>()
    vi.mocked(getTenantSettings).mockReturnValue(settings.promise as never)
    renderTab()

    await waitFor(() => expect(getTenantSettings).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Save Timezone' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save Currency' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save App Name' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Timezone')).not.toBeInTheDocument()

    settings.finish(SETTINGS)

    expect(await screen.findByLabelText('Timezone')).toHaveValue('Pacific/Auckland')
    expect(updateTenantSettings).not.toHaveBeenCalled()
  })

  it('offers no app name to save until the branding has loaded', async () => {
    // Saving before then would blank the gym's app name.
    const branding = pending<unknown>()
    vi.mocked(getTenantBranding).mockReturnValue(branding.promise as never)
    renderTab()

    await waitFor(() => expect(getTenantBranding).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Save App Name' })).not.toBeInTheDocument()

    branding.finish(BRANDING)

    expect(await screen.findByLabelText('App Name')).toHaveValue('Harbour Gym')
    expect(updateTenantBranding).not.toHaveBeenCalled()
  })

  it("shows the gym's saved currency, timezone and app name, and saves only what was changed", async () => {
    renderTab()

    expect(await screen.findByLabelText('Timezone')).toHaveValue('Pacific/Auckland')
    expect(screen.getByLabelText('Currency Symbol')).toHaveValue('£')
    expect(screen.getByLabelText('App Name')).toHaveValue('Harbour Gym')

    await userEvent.selectOptions(screen.getByLabelText('Timezone'), 'Europe/London')
    await userEvent.click(screen.getByRole('button', { name: 'Save Timezone' }))
    await waitFor(() =>
      expect(updateTenantSettings).toHaveBeenCalledWith({
        timezone: 'Europe/London',
        // What it was when the form opened: the server refuses if it changed since.
        expected: { timezone: 'Pacific/Auckland' },
      }),
    )
  })

  it("doesn't take its own save, tidied by the server, for someone else's change", async () => {
    // The server trims spaces; the form must remember what was stored.
    renderTab()
    const appName = await screen.findByLabelText('App Name')
    await userEvent.clear(appName)
    await userEvent.type(appName, 'Harbour Fitness ')
    vi.mocked(updateTenantBranding).mockResolvedValue({ ...BRANDING, app_name: 'Harbour Fitness' } as never)
    await userEvent.click(screen.getByRole('button', { name: 'Save App Name' }))
    await waitFor(() => expect(updateTenantBranding).toHaveBeenCalledTimes(1))
    vi.mocked(getTenantBranding).mockResolvedValue({ ...BRANDING, app_name: 'Harbour Fitness' } as never)

    await userEvent.click(screen.getByRole('button', { name: 'Save App Name' }))

    await waitFor(() => expect(updateTenantBranding).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a custom currency symbol in the custom field', async () => {
    vi.mocked(getTenantSettings).mockResolvedValue({ currency_symbol: 'kr', timezone: 'Europe/London' } as never)
    renderTab()

    expect(await screen.findByLabelText('Currency Symbol')).toHaveValue('custom')
    expect(screen.getByLabelText('Custom Symbol')).toHaveValue('kr')
  })

  it('says so and offers to try again when the settings cannot be loaded', async () => {
    vi.mocked(getTenantSettings).mockRejectedValueOnce(new Error('offline'))
    renderTab()

    expect(await screen.findByText("Couldn't load the general settings")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save Timezone' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByLabelText('Timezone')).toHaveValue('Pacific/Auckland')
  })

  it('says so and offers to try again when the app name cannot be loaded', async () => {
    vi.mocked(getTenantBranding).mockRejectedValueOnce(new Error('offline'))
    renderTab()

    expect(await screen.findByText("Couldn't load the general settings")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save App Name' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByLabelText('App Name')).toHaveValue('Harbour Gym')
  })

  it('waits for a fresh copy rather than showing an out-of-date cached timezone', async () => {
    // Saving the old copy would undo a change made since, e.g. by another admin.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
    client.setQueryData(['tenant', 'settings'], { currency_symbol: '£', timezone: 'UTC' }, { updatedAt: Date.now() - 60_000 })
    client.setQueryData(['tenant', 'branding'], BRANDING) // fresh: only the settings are out of date
    const settings = pending<unknown>()
    vi.mocked(getTenantSettings).mockReturnValue(settings.promise as never)
    render(
      <QueryClientProvider client={client}>
        <GeneralTab />
      </QueryClientProvider>,
    )

    await waitFor(() => expect(getTenantSettings).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Save Timezone' })).not.toBeInTheDocument()

    settings.finish(SETTINGS)
    expect(await screen.findByLabelText('Timezone')).toHaveValue('Pacific/Auckland')
  })

  it("warns instead of saving over someone else's timezone change, and can load theirs", async () => {
    renderTab()
    expect(await screen.findByLabelText('Timezone')).toHaveValue('Pacific/Auckland')
    vi.mocked(getTenantSettings).mockResolvedValue({ ...SETTINGS, timezone: 'Australia/Sydney' } as never)

    await userEvent.click(screen.getByRole('button', { name: 'Save Timezone' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Timezone (now: Australia/Sydney)')
    expect(updateTenantSettings).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Use their values' }))
    expect(await screen.findByLabelText('Timezone')).toHaveValue('Australia/Sydney')
  })

  it("warns instead of saving over someone else's app name", async () => {
    renderTab()
    expect(await screen.findByLabelText('App Name')).toHaveValue('Harbour Gym')
    vi.mocked(getTenantBranding).mockResolvedValue({ ...BRANDING, app_name: 'Harbour Fitness' } as never)

    await userEvent.click(screen.getByRole('button', { name: 'Save App Name' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('App Name (now: Harbour Fitness)')
    expect(updateTenantBranding).not.toHaveBeenCalled()
  })
})
