import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChecksDueCard } from './ChecksDueCard'
import { listMyChecks } from '../../api/facilities'
import { useFacilitiesConfig } from '../../hooks/useFacilitiesConfig'
import type { ChecklistRun, FacilitiesConfig } from '../../types'

vi.mock('../../api/facilities', () => ({
  listMyChecks: vi.fn(),
  completeChecklistRun: vi.fn(),
  uploadCheckPhoto: vi.fn(),
}))
vi.mock('../../hooks/useFacilitiesConfig', () => ({ useFacilitiesConfig: vi.fn() }))

const baseConfig: FacilitiesConfig = {
  equipment_enabled: true,
  maintenance_enabled: true,
  fault_reporting_enabled: true,
  checklists_enabled: true,
  can_do_checklists: true,
  has_checklists: true,
  can_manage_checklists: true,
  can_manage: true,
  is_alert_recipient: true,
  sites: [],
}

const run = {
  id: 1,
  template: 1,
  template_name: 'Opening check',
  category: 'opening',
  site: null,
  site_name: '',
  due_date: '2026-11-06',
  due_at: '2026-11-05T17:00:00Z',
  status: 'due',
  completed_at: null,
  completed_by_name: '',
  notes: '',
  can_complete: true,
  items: [],
  answers: [],
  failed_count: 0,
} as ChecklistRun

function renderCard(config: Partial<FacilitiesConfig>) {
  vi.mocked(useFacilitiesConfig).mockReturnValue({ data: { ...baseConfig, ...config } } as ReturnType<
    typeof useFacilitiesConfig
  >)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ChecksDueCard />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Checks to do card', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listMyChecks).mockResolvedValue([])
  })

  it('stays hidden until the gym has set up a checklist', () => {
    renderCard({ has_checklists: false })

    expect(screen.queryByTestId('checks-card')).not.toBeInTheDocument()
    expect(screen.queryByText('All checks done')).not.toBeInTheDocument()
    expect(listMyChecks).not.toHaveBeenCalled()
  })

  it('stays hidden from people who do not do checklists', () => {
    renderCard({ can_do_checklists: false })

    expect(screen.queryByTestId('checks-card')).not.toBeInTheDocument()
    expect(listMyChecks).not.toHaveBeenCalled()
  })

  it('says all checks are done once there are checklists but nothing is due', async () => {
    renderCard({})

    expect(await screen.findByText('All checks done')).toBeInTheDocument()
  })

  it('lists the checks that are due', async () => {
    vi.mocked(listMyChecks).mockResolvedValue([run])
    renderCard({})

    expect(await screen.findByRole('button', { name: 'Start: Opening check' })).toBeInTheDocument()
  })
})
