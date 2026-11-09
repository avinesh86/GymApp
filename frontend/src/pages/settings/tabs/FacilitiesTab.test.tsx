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
    facilities_licences_enabled: true,
    facilities_subscriptions_enabled: true,
  } as never)
  vi.mocked(updateTenantSettings).mockResolvedValue({} as never)
})

describe('Settings → Facilities', () => {
  it("keeps an open form and the person's changes when its data goes out of date", async () => {
    // It used to turn into a spinner once the cached copy it opened with went
    // stale (30 seconds in the app), throwing away unsaved changes.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 50 } } })
    client.setQueryData(['tenant', 'settings'], await vi.mocked(getTenantSettings)())
    vi.mocked(getTenantSettings).mockReturnValue(new Promise(() => {}) as never)
    renderTab(client)

    const reporting = screen.getByRole('switch', { name: 'Report a fault button' })
    await userEvent.click(reporting)
    await new Promise((r) => setTimeout(r, 120))

    expect(screen.getByRole('switch', { name: 'Report a fault button' })).toHaveAttribute('aria-checked', 'false')
  })

  it("keeps an open form and the person's other changes while a save refreshes the data", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
    const saved = await vi.mocked(getTenantSettings)()
    client.setQueryData(['tenant', 'settings'], saved)
    renderTab(client)
    // Save first checks nobody else changed the settings, then the save's
    // refresh of the data never finishes.
    vi.mocked(getTenantSettings).mockResolvedValueOnce(saved).mockReturnValue(new Promise(() => {}) as never)

    await userEvent.click(screen.getByRole('switch', { name: 'Also send alerts by email' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save Facilities Settings' }))
    await waitFor(() => expect(updateTenantSettings).toHaveBeenCalled())
    // A change made after pressing Save, while the save is refreshing the data.
    await userEvent.click(alerted().getByRole('checkbox', { name: 'Payroll' }))
    await new Promise((r) => setTimeout(r, 30))

    expect(screen.getByRole('switch', { name: 'Also send alerts by email' })).toHaveAttribute('aria-checked', 'true')
    expect(alerted().getByRole('checkbox', { name: 'Payroll' })).toBeChecked()
  })

  it('waits for fresh settings rather than starting from an out-of-date copy', async () => {
    // Saving a form seeded from a stale cache would undo someone else's change.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
    const old = { ...(await vi.mocked(getTenantSettings)()), fault_reporting_enabled: true }
    client.setQueryData(['tenant', 'settings'], old, { updatedAt: Date.now() - 60_000 })
    vi.mocked(getTenantSettings).mockResolvedValue({ ...old, fault_reporting_enabled: false } as never)
    renderTab(client)

    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Report a fault button' })).toHaveAttribute('aria-checked', 'false'),
    )
  })

  it('shows it is trying again rather than leaving the error up', async () => {
    vi.mocked(getTenantSettings).mockRejectedValueOnce(new Error('offline'))
    renderTab()
    await screen.findByText("Couldn't load the Facilities settings")

    vi.mocked(getTenantSettings).mockReturnValueOnce(new Promise(() => {}) as never)
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(screen.queryByText("Couldn't load the Facilities settings")).not.toBeInTheDocument()
  })

  it('says so and offers to try again when the settings cannot be loaded', async () => {
    vi.mocked(getTenantSettings).mockRejectedValueOnce(new Error('offline'))
    renderTab()

    expect(await screen.findByText("Couldn't load the Facilities settings")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save Facilities Settings' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('button', { name: 'Save Facilities Settings' })).toBeInTheDocument()
  })

  it("shows nothing to change or save until the gym's real settings have loaded", async () => {
    // Saving the form's starting defaults would switch a gym's "off"
    // settings back on (and a test reading a switch too early sees "on").
    let finishLoading: (value: unknown) => void = () => {}
    vi.mocked(getTenantSettings).mockReturnValue(new Promise((resolve) => (finishLoading = resolve)) as never)
    renderTab()

    expect(screen.queryByRole('button', { name: 'Save Facilities Settings' })).not.toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'Report a fault button' })).not.toBeInTheDocument()

    finishLoading({
      facilities_equipment_enabled: true,
      facilities_maintenance_enabled: true,
      fault_reporting_enabled: false,
      facilities_alert_roles: ['owner'],
      facilities_alert_email: false,
      facilities_checklists_enabled: true,
      checklist_roles: ['owner'],
      facilities_alert_start_hour: 9,
      facilities_alert_end_hour: 17,
    })

    expect(await screen.findByRole('switch', { name: 'Report a fault button' })).toHaveAttribute('aria-checked', 'false')
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

    // Only what was changed, with what it was when the form opened.
    await waitFor(() =>
      expect(updateTenantSettings).toHaveBeenCalledWith({
        fault_reporting_enabled: false,
        facilities_alert_roles: ['owner', 'gym_manager', 'team_leader'],
        facilities_alert_email: true,
        expected: {
          fault_reporting_enabled: true,
          facilities_alert_roles: ['owner', 'admin', 'gym_manager'],
          facilities_alert_email: false,
        },
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

  it('licences and subscriptions can each be switched off', async () => {
    renderTab()
    const licences = await screen.findByRole('switch', { name: 'Licences' })
    await waitFor(() => expect(licences).toHaveAttribute('aria-checked', 'true'))
    await userEvent.click(licences)
    await userEvent.click(screen.getByRole('switch', { name: 'Subscriptions' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save Facilities Settings' }))

    await waitFor(() =>
      expect(updateTenantSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          facilities_licences_enabled: false,
          facilities_subscriptions_enabled: false,
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

  it("warns instead of saving over someone else's change, and can load theirs", async () => {
    renderTab()
    await waitFor(() => expect(alerted().getByRole('checkbox', { name: 'Gym Manager' })).toBeChecked())
    const saved = await vi.mocked(getTenantSettings)()
    vi.mocked(getTenantSettings).mockResolvedValue({ ...(saved as object), facilities_alert_roles: ['owner'] } as never)

    await userEvent.click(screen.getByRole('button', { name: 'Save Facilities Settings' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Who hears about new faults (now: Owner)')
    expect(updateTenantSettings).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Use their values' }))
    await waitFor(() => expect(alerted().getByRole('checkbox', { name: 'Gym Manager' })).not.toBeChecked())
  })
})
