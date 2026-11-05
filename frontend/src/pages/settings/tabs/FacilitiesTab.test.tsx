import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FacilitiesTab } from './FacilitiesTab'
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
      <FacilitiesTab />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getTenantSettings).mockResolvedValue({
    facilities_equipment_enabled: true,
    facilities_maintenance_enabled: true,
    fault_reporting_enabled: true,
    facilities_alert_roles: ['owner', 'admin', 'gym_manager'],
    facilities_alert_email: false,
  } as never)
  vi.mocked(updateTenantSettings).mockResolvedValue({} as never)
})

describe('Settings → Facilities', () => {
  it('shows the saved switches and alert roles', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Gym Manager' })).toBeChecked())
    expect(screen.getByRole('checkbox', { name: 'Team Leader' })).not.toBeChecked()
    expect(screen.getByRole('switch', { name: 'Report a fault button' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('switch', { name: 'Also send alerts by email' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText(/never sent to WhatsApp/)).toBeInTheDocument()
  })

  it('switching maintenance off disables the fault button switch', async () => {
    renderTab()
    const maintenance = await screen.findByRole('switch', { name: 'Maintenance tracking' })
    await waitFor(() => expect(maintenance).toHaveAttribute('aria-checked', 'true'))
    await userEvent.click(maintenance)
    const reporting = screen.getByRole('switch', { name: 'Report a fault button' })
    expect(reporting).toBeDisabled()
    expect(reporting).toHaveAttribute('aria-checked', 'false')
  })

  it('saves the switches, roles and email choice', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Owner' })).toBeChecked())

    await userEvent.click(screen.getByRole('switch', { name: 'Report a fault button' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Admin' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Team Leader' }))
    await userEvent.click(screen.getByRole('switch', { name: 'Also send alerts by email' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save Facilities Settings' }))

    await waitFor(() =>
      expect(updateTenantSettings).toHaveBeenCalledWith({
        facilities_equipment_enabled: true,
        facilities_maintenance_enabled: true,
        fault_reporting_enabled: false,
        facilities_alert_roles: ['owner', 'gym_manager', 'team_leader'],
        facilities_alert_email: true,
      }),
    )
  })
})
