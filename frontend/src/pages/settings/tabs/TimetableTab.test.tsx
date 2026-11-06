import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TimetableTab } from './TimetableTab'
import { getTenantSettings, updateTenantSettings } from '../../../api/settings'

vi.mock('../../../api/settings', () => ({
  getTenantSettings: vi.fn(),
  updateTenantSettings: vi.fn(),
}))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TimetableTab />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getTenantSettings).mockResolvedValue({
    week_start_day: 1,
    default_timetable_view: 'week',
    timetable_tile_style: 'tint',
  } as never)
  vi.mocked(updateTenantSettings).mockResolvedValue({} as never)
})

describe('Settings → Timetable — loading', () => {
  // Deliberately the opposite of the form's old starting values
  // (Monday, week view, tint) so saving those would show up.
  const SAVED = { week_start_day: 0, default_timetable_view: 'list', timetable_tile_style: 'solid' }

  it("offers nothing to change or save until the gym's settings have loaded", async () => {
    let finishLoading: (value: unknown) => void = () => {}
    vi.mocked(getTenantSettings).mockReturnValue(new Promise((resolve) => (finishLoading = resolve)) as never)
    renderTab()

    await waitFor(() => expect(getTenantSettings).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Save Preferences' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /Tint/ })).not.toBeInTheDocument()

    finishLoading(SAVED)

    expect(await screen.findByRole('radio', { name: /Solid/ })).toBeChecked()
    expect(updateTenantSettings).not.toHaveBeenCalled()
  })

  it("shows the gym's saved preferences and saves only what was changed", async () => {
    vi.mocked(getTenantSettings).mockResolvedValue(SAVED as never)
    renderTab()

    expect(await screen.findByLabelText('Week Start Day')).toHaveValue('0')
    expect(screen.getByLabelText('Default View')).toHaveValue('list')

    await userEvent.selectOptions(screen.getByLabelText('Week Start Day'), '1')
    await userEvent.click(screen.getByRole('button', { name: 'Save Preferences' }))
    await waitFor(() =>
      expect(updateTenantSettings).toHaveBeenCalledWith({
        week_start_day: 1,
        expected: { week_start_day: 0 },
      }),
    )
  })

  it('says so and offers to try again when the settings cannot be loaded', async () => {
    vi.mocked(getTenantSettings).mockRejectedValueOnce(new Error('offline'))
    renderTab()

    expect(await screen.findByText("Couldn't load the timetable settings")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save Preferences' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('button', { name: 'Save Preferences' })).toBeInTheDocument()
  })
})

describe('Settings → Timetable — class tile colour', () => {
  it('offers Stripe, Tint and Solid, with the saved one chosen', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByRole('radio', { name: /Tint/ })).toBeChecked())
    expect(screen.getByRole('radio', { name: /Stripe/ })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: /Solid/ })).not.toBeChecked()
  })

  it('saves the chosen style', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByRole('radio', { name: /Tint/ })).toBeChecked())

    await userEvent.click(screen.getByRole('radio', { name: /Solid/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Save Preferences' }))

    await waitFor(() =>
      expect(updateTenantSettings).toHaveBeenCalledWith(expect.objectContaining({ timetable_tile_style: 'solid' })),
    )
  })

  it("warns instead of saving over someone else's change, and can load theirs", async () => {
    renderTab()
    await waitFor(() => expect(screen.getByRole('radio', { name: /Tint/ })).toBeChecked())
    vi.mocked(getTenantSettings).mockResolvedValue({
      week_start_day: 0,
      default_timetable_view: 'week',
      timetable_tile_style: 'tint',
    } as never)

    await userEvent.click(screen.getByRole('button', { name: 'Save Preferences' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Week Start Day (now: Sunday)')
    expect(updateTenantSettings).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Use their values' }))
    expect(await screen.findByLabelText('Week Start Day')).toHaveValue('0')
  })
})
