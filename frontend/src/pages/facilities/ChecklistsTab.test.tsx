import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChecklistsTab } from './ChecklistsTab'
import { listChecklists, listChecklistRuns, listMyChecks } from '../../api/facilities'
import { useFacilitiesConfig } from '../../hooks/useFacilitiesConfig'
import type { FacilitiesConfig } from '../../types'

vi.mock('../../api/facilities', () => ({
  listChecklists: vi.fn(),
  listChecklistRuns: vi.fn(),
  listMyChecks: vi.fn(),
  completeChecklistRun: vi.fn(),
  uploadCheckPhoto: vi.fn(),
  createChecklist: vi.fn(),
  updateChecklist: vi.fn(),
  deleteChecklist: vi.fn(),
  listEquipment: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../hooks/useFacilitiesConfig', () => ({ useFacilitiesConfig: vi.fn() }))

const manager: FacilitiesConfig = {
  equipment_enabled: true,
  maintenance_enabled: true,
  fault_reporting_enabled: true,
  checklists_enabled: true,
  can_do_checklists: true,
  has_checklists: false,
  has_my_checklists: false,
  can_manage_checklists: true,
  can_manage: true,
  is_alert_recipient: true,
  sites: [],
}

function renderTab(config: Partial<FacilitiesConfig>) {
  vi.mocked(useFacilitiesConfig).mockReturnValue({ data: { ...manager, ...config } } as ReturnType<
    typeof useFacilitiesConfig
  >)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ChecklistsTab site="" />
    </QueryClientProvider>,
  )
}

describe('Checklists tab before any checklist exists', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listChecklists).mockResolvedValue([])
    vi.mocked(listChecklistRuns).mockResolvedValue({ results: [] } as never)
    vi.mocked(listMyChecks).mockResolvedValue([])
  })

  it('opens on the list and invites a manager to set one up, not "All your checks are done"', async () => {
    renderTab({})

    expect(await screen.findByText('No checklists yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Set up a checklist' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Checklists' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('All your checks are done.')).not.toBeInTheDocument()
  })

  it('tells others their manager has not set any up', async () => {
    renderTab({ can_manage_checklists: false })

    expect(await screen.findByText("Your gym manager hasn't set up any checklists yet.")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Set up a checklist' })).not.toBeInTheDocument()
  })
})
