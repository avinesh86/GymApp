import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FacilitiesTab } from './FacilitiesTab'
import { getTenantSettings, updateTenantSettings } from '../../../api/settings'

vi.mock('../../../api/settings', () => ({
  getTenantSettings: vi.fn(),
  updateTenantSettings: vi.fn(),
}))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))

function renderTab(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(
    <QueryClientProvider client={client}>
      <FacilitiesTab />
    </QueryClientProvider>,
  )
}

const alerted = () => within(screen.getByRole('group', { name: 'Roles alerted about new faults' }))
const doers = () => within(screen.getByRole('group', { name: 'Roles that do checklists' }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getTenantSettings).mockResolvedValue({
    facilities_equipment_enabled: true,
    facilities_maintenance_enabled: true,
    fault_reporting_enabled: true,
    facilities_alert_roles: ['owner', 'admin', 'gym_manager'],
    facilities_alert_email: false,
    facilities_checklists_enabled: true,
    checklist_roles: ['owner', 'admin', 'gym_manager', 'team_leader'],
    facilities_alert_start_hour: 9,
    facilities_alert_end_hour: 17,
  } as never)
  vi.mocked(updateTenantSettings).mockResolvedValue({} as never)
})

describe('Settings → Facilities', () => {
  it("shows no switches until the gym's settings have loaded", async () => {
    let resolve: (value: unknown) => void = () => {}
    vi.mocked(getTenantSettings).mockReturnValue(new Promise((r) => (resolve = r)) as never)
    renderTab()

    // Showing the defaults (all on) meanwhile would let a quick Save write
    // them over the gym's real settings.
    expect(screen.queryByRole('switch', { name: 'Report a fault button' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save Facilities Settings' })).not.toBeInTheDocument()

    resolve({ fault_reporting_enabled: false, facilities_maintenance_enabled: true })
    expect(await screen.findByRole('switch', { name: 'Report a fault button' })).toHaveAttribute('aria-checked', 'false')
  })

  it('waits for fresh settings rather than showing ones cached by another page', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(['tenant', 'settings'], { fault_reporting_enabled: true, facilities_maintenance_enabled: true })
    let resolve: (value: unknown) => void = () => {}
    vi.mocked(getTenantSettings).mockReturnValue(new Promise((r) => (resolve = r)) as never)
    renderTab(client)

    expect(screen.queryByRole('switch', { name: 'Report a fault button' })).not.toBeInTheDocument()

    resolve({ fault_reporting_enabled: false, facilities_maintenance_enabled: true })
    expect(await screen.findByRole('switch', { name: 'Report a fault button' })).toHaveAttribute('aria-checked', 'false')
  })

  it('still opens when another page fetched the settings moments ago', async () => {
    // As in the app: cached settings count as fresh for 30 seconds.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
    client.setQueryData(['tenant', 'settings'], { fault_reporting_enabled: true, facilities_maintenance_enabled: true })
    vi.mocked(getTenantSettings).mockResolvedValue({ fault_reporting_enabled: false, facilities_maintenance_enabled: true } as never)
    renderTab(client)

    expect(await screen.findByRole('switch', { name: 'Report a fault button' })).toHaveAttribute('aria-checked', 'false')
  })

  it('says so if the settings could not be loaded, rather than spinning or showing defaults', async () => {
    vi.mocked(getTenantSettings).mockRejectedValue(new Error('offline'))
    renderTab()

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load the Facilities settings")
    expect(screen.queryByRole('switch', { name: 'Report a fault button' })).not.toBeInTheDocument()
  })

  it('shows the saved switches and alert roles', async () => {
    renderTab()
    await waitFor(() => expect(alerted().getByRole('checkbox', { name: 'Gym Manager' })).toBeChecked())
    expect(alerted().getByRole('checkbox', { name: 'Team Leader' })).not.toBeChecked()
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
    await waitFor(() => expect(alerted().getByRole('checkbox', { name: 'Owner' })).toBeChecked())

    await userEvent.click(screen.getByRole('switch', { name: 'Report a fault button' }))
    await userEvent.click(alerted().getByRole('checkbox', { name: 'Admin' }))
    await userEvent.click(alerted().getByRole('checkbox', { name: 'Team Leader' }))
    await userEvent.click(screen.getByRole('switch', { name: 'Also send alerts by email' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save Facilities Settings' }))

    await waitFor(() =>
      expect(updateTenantSettings).toHaveBeenCalledWith({
        facilities_equipment_enabled: true,
        facilities_maintenance_enabled: true,
        fault_reporting_enabled: false,
        facilities_alert_roles: ['owner', 'gym_manager', 'team_leader'],
        facilities_alert_email: true,
        facilities_checklists_enabled: true,
        checklist_roles: ['owner', 'admin', 'gym_manager', 'team_leader'],
        facilities_alert_start_hour: 9,
        facilities_alert_end_hour: 17,
      }),
    )
  })

  it('checklist roles and alert hours are saved', async () => {
    renderTab()
    await waitFor(() => expect(doers().getByRole('checkbox', { name: 'Team Leader' })).toBeChecked())
    expect(doers().getByRole('checkbox', { name: 'Payroll' })).not.toBeChecked()
    expect(screen.getByText(/Instructors and PTs never see checklists/)).toBeInTheDocument()

    await userEvent.click(doers().getByRole('checkbox', { name: 'Payroll' }))
    await userEvent.selectOptions(screen.getByLabelText('Alerts from'), '8')
    await userEvent.selectOptions(screen.getByLabelText('Alerts until'), '18')
    await userEvent.click(screen.getByRole('button', { name: 'Save Facilities Settings' }))

    await waitFor(() =>
      expect(updateTenantSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          checklist_roles: ['owner', 'admin', 'gym_manager', 'team_leader', 'payroll'],
          facilities_alert_start_hour: 8,
          facilities_alert_end_hour: 18,
        }),
      ),
    )
  })

  it('will not save alert hours that end before they start', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByLabelText('Alerts from')).toHaveValue('9'))
    await userEvent.selectOptions(screen.getByLabelText('Alerts from'), '18')
    expect(screen.getByText('The start has to be before the end.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Facilities Settings' })).toBeDisabled()
  })
})
