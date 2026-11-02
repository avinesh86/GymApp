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
})
