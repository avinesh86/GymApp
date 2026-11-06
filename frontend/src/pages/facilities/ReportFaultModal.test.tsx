import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReportFaultModal } from './ReportFaultModal'
import {
  getFacilitiesConfig,
  listFaultBoard,
  listReportableEquipment,
  reportFault,
} from '../../api/facilities'

vi.mock('../../api/facilities', () => ({
  getFacilitiesConfig: vi.fn(),
  listFaultBoard: vi.fn(),
  listReportableEquipment: vi.fn(),
  reportFault: vi.fn(),
}))
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { role: 'instructor', first_name: 'Sam', last_name: 'Lee', email: 'sam@example.com' } }) }))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))

const onClose = vi.fn()

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ReportFaultModal isOpen onClose={onClose} />
    </QueryClientProvider>,
  )
}

const fault = {
  id: 7,
  site: null,
  site_name: '',
  equipment: 3,
  equipment_name: 'Rower 2',
  title: 'Seat sticks',
  description: '',
  location: '',
  severity: 'medium',
  status: 'in_progress',
  status_note: 'Part ordered',
  reported_by_name: 'Jo Bloggs',
  resolved_at: null,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getFacilitiesConfig).mockResolvedValue({
    equipment_enabled: true,
    maintenance_enabled: true,
    fault_reporting_enabled: true,
    checklists_enabled: true,
    can_do_checklists: false,
    has_checklists: false,
    has_my_checklists: false,
    has_any_checklists: false,
    can_manage_checklists: false,
    can_manage: false,
    is_alert_recipient: false,
    sites: [],
  })
  vi.mocked(listReportableEquipment).mockResolvedValue([
    { id: 3, name: 'Rower 2', location: 'Cardio', site: null, site_name: '', status: 'in_service' },
    { id: 4, name: 'Bike 1', location: 'Cardio', site: null, site_name: '', status: 'in_service' },
  ])
  vi.mocked(listFaultBoard).mockResolvedValue([fault] as never)
  vi.mocked(reportFault).mockResolvedValue(fault as never)
})

describe('Report a fault', () => {
  it('shows it will be logged under the signed-in person', async () => {
    renderModal()
    expect(await screen.findByTestId('logged-by')).toHaveTextContent('Logged by Sam Lee')
  })

  it('shows what is already reported on the chosen machine, with no Me too button', async () => {
    renderModal()
    const picker = await screen.findByLabelText('Equipment')
    await waitFor(() => expect(screen.getByRole('option', { name: /Rower 2/ })).toBeInTheDocument())
    await userEvent.selectOptions(picker, '3')

    expect(await screen.findByText('Already reported on this equipment')).toBeInTheDocument()
    expect(screen.getByText('Seat sticks')).toBeInTheDocument()
    expect(screen.getByText(/Part ordered/)).toBeInTheDocument()
    expect(screen.getByText('by Jo Bloggs')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Me too/i })).not.toBeInTheDocument()
  })

  it('no warning for a machine with nothing reported', async () => {
    renderModal()
    const picker = await screen.findByLabelText('Equipment')
    await waitFor(() => expect(screen.getByRole('option', { name: /Bike 1/ })).toBeInTheDocument())
    await userEvent.selectOptions(picker, '4')
    expect(screen.queryByText('Already reported on this equipment')).not.toBeInTheDocument()
  })

  it('a fault that is not equipment needs a place before it can be sent', async () => {
    renderModal()
    await screen.findByLabelText('Equipment')
    await userEvent.type(screen.getByLabelText("What's wrong?"), 'Leaking shower')
    const send = screen.getByRole('button', { name: 'Report fault' })
    expect(send).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Where is it?'), "Women's changing")
    expect(send).toBeEnabled()
    await userEvent.click(send)
    await waitFor(() =>
      expect(reportFault).toHaveBeenCalledWith(
        expect.objectContaining({ equipment: null, title: 'Leaking shower', location: "Women's changing" }),
      ),
    )
  })
})
