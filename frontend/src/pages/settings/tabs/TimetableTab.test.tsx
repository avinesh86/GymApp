import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import toast from 'react-hot-toast'
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

  describe('after a save, other admins\' changes', () => {
    const OPENED = { week_start_day: 1, default_timetable_view: 'week', timetable_tile_style: 'tint' }

    it("still warns about a field this save didn't touch that someone changed meanwhile", async () => {
      // Someone set the tile style while this save was on its way. The form
      // still shows the old style; the next save must not quietly put it back.
      vi.mocked(getTenantSettings).mockResolvedValue(OPENED as never)
      renderTab()
      expect(await screen.findByLabelText('Week Start Day')).toHaveValue('1')
      vi.mocked(updateTenantSettings).mockResolvedValueOnce({ ...OPENED, week_start_day: 0, timetable_tile_style: 'solid' } as never)
      await userEvent.selectOptions(screen.getByLabelText('Week Start Day'), '0')
      await userEvent.click(screen.getByRole('button', { name: 'Save Preferences' }))
      await waitFor(() => expect(updateTenantSettings).toHaveBeenCalledTimes(1))

      vi.mocked(getTenantSettings).mockResolvedValue({ ...OPENED, week_start_day: 0, timetable_tile_style: 'solid' } as never)
      await userEvent.selectOptions(screen.getByLabelText('Default View'), 'list')
      await userEvent.click(screen.getByRole('button', { name: 'Save Preferences' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Class Tile Colour (now: Solid)')
      expect(updateTenantSettings).toHaveBeenCalledTimes(1)
    })

    it("doesn't warn when someone else already set a field to what this form has", async () => {
      vi.mocked(getTenantSettings).mockResolvedValue(OPENED as never)
      renderTab()
      expect(await screen.findByLabelText('Week Start Day')).toHaveValue('1')
      await userEvent.selectOptions(screen.getByLabelText('Week Start Day'), '0')
      vi.mocked(getTenantSettings).mockResolvedValue({ ...OPENED, week_start_day: 0 } as never)

      await userEvent.click(screen.getByRole('button', { name: 'Save Preferences' }))

      await waitFor(() => expect(updateTenantSettings).toHaveBeenCalled())
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('says why when the check before saving fails, and keeps Save off while the warning shows', async () => {
      vi.mocked(getTenantSettings).mockResolvedValue(OPENED as never)
      renderTab()
      expect(await screen.findByLabelText('Week Start Day')).toHaveValue('1')
      const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig
      vi.mocked(getTenantSettings).mockRejectedValueOnce(
        new AxiosError('Server Error', '500', config, null, { status: 500, statusText: 'Server Error', data: {}, headers: {}, config }),
      )
      await userEvent.click(screen.getByRole('button', { name: 'Save Preferences' }))
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Something went wrong on our end/)))
      expect(updateTenantSettings).not.toHaveBeenCalled()

      vi.mocked(getTenantSettings).mockResolvedValue({ ...OPENED, timetable_tile_style: 'solid' } as never)
      await userEvent.click(screen.getByRole('button', { name: 'Save Preferences' }))
      await screen.findByRole('alert')
      expect(screen.getByRole('button', { name: 'Save Preferences' })).toBeDisabled()

      await userEvent.click(screen.getByRole('button', { name: 'Use their values' }))
      // Back where the person was.
      await waitFor(() => expect(screen.getByRole('button', { name: 'Save Preferences' })).toHaveFocus())
    })
  })
})
