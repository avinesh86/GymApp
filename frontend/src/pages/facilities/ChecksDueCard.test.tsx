import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChecksDueCard } from './ChecksDueCard'
import { listMyChecks } from '../../api/facilities'
import { useFacilitiesConfig } from '../../hooks/useFacilitiesConfig'
import { useAuthStore } from '../../store/auth'
import type { AuthUser, ChecklistRun, FacilitiesConfig, UserRole } from '../../types'

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
  has_my_checklists: true,
  has_any_checklists: true,
  can_manage_checklists: true,
  licences_enabled: true,
  subscriptions_enabled: true,
  can_manage_records: true,
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

function signIn(role: UserRole = 'gym_manager', id = 7, tenant_id = 3) {
  useAuthStore.setState({
    user: { id, tenant_id, role, email: 'm@example.com', first_name: 'M', last_name: 'G', is_active: true } as AuthUser,
    isAuthenticated: true,
  })
}

function Where() {
  const location = useLocation()
  return <p data-testid="where">{location.pathname + location.search}</p>
}

function renderCard(config: Partial<FacilitiesConfig>) {
  vi.mocked(useFacilitiesConfig).mockReturnValue({ data: { ...baseConfig, ...config } } as ReturnType<
    typeof useFacilitiesConfig
  >)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<ChecksDueCard />} />
          <Route path="/facilities" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const noChecklistsYet = { has_checklists: false, has_my_checklists: false, has_any_checklists: false }

describe('Checks to do card', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listMyChecks).mockResolvedValue([])
    window.localStorage.clear()
    signIn()
  })

  it('stays hidden from people who do not set checklists up until the gym has one', () => {
    signIn('team_leader')
    renderCard({ ...noChecklistsYet, can_manage_checklists: false })

    expect(screen.queryByTestId('checks-card')).not.toBeInTheDocument()
    expect(screen.queryByText('All checks done')).not.toBeInTheDocument()
    expect(listMyChecks).not.toHaveBeenCalled()
  })

  it('stays hidden when none of the checklists are this person\'s to do', () => {
    renderCard({ has_my_checklists: false })

    expect(screen.queryByTestId('checks-card')).not.toBeInTheDocument()
    expect(listMyChecks).not.toHaveBeenCalled()
  })

  it('stays hidden from people who do not do checklists', () => {
    renderCard({ can_do_checklists: false })

    expect(screen.queryByTestId('checks-card')).not.toBeInTheDocument()
    expect(listMyChecks).not.toHaveBeenCalled()
  })

  it('says nothing is due once there are checklists but none are due', async () => {
    renderCard({})

    expect(await screen.findByText('Nothing due right now')).toBeInTheDocument()
  })

  it('says so when the checks could not be loaded, rather than "nothing due"', async () => {
    vi.mocked(listMyChecks).mockRejectedValue(new Error('offline'))
    renderCard({})

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your checks")
    expect(screen.queryByText('Nothing due right now')).not.toBeInTheDocument()
  })

  it('lists the checks that are due', async () => {
    vi.mocked(listMyChecks).mockResolvedValue([run])
    renderCard({})

    expect(await screen.findByRole('button', { name: 'Start: Opening check' })).toBeInTheDocument()
  })

  it('"View all checks" opens the Checklists tab', async () => {
    renderCard({})

    await userEvent.click(await screen.findByRole('button', { name: /View all checks/ }))

    expect(screen.getByTestId('where')).toHaveTextContent('/facilities?tab=checklists')
  })
})

describe('Checklist setup prompt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listMyChecks).mockResolvedValue([])
    window.localStorage.clear()
    signIn()
  })

  it('invites a manager to set up the first checklist, and the button opens the Checklists tab', async () => {
    renderCard(noChecklistsYet)

    expect(screen.getByRole('heading', { name: 'Checks to do' })).toBeInTheDocument()
    expect(screen.getByText(/Set up opening, cleaning or safety checklists/)).toBeInTheDocument()
    expect(screen.queryByText('Nothing due right now')).not.toBeInTheDocument()
    expect(listMyChecks).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Set up a checklist' }))

    expect(screen.getByTestId('where')).toHaveTextContent('/facilities?tab=checklists')
  })

  it.each<UserRole>(['owner', 'admin', 'gym_manager'])('shows for %s', (role) => {
    signIn(role)
    renderCard(noChecklistsYet)

    expect(screen.getByTestId('checks-setup-prompt')).toBeInTheDocument()
  })

  it.each<UserRole>(['team_leader', 'payroll', 'instructor'])('stays hidden for %s', (role) => {
    signIn(role)
    renderCard({ ...noChecklistsYet, can_manage_checklists: false, can_do_checklists: role === 'team_leader' })

    expect(screen.queryByTestId('checks-setup-prompt')).not.toBeInTheDocument()
    expect(screen.queryByTestId('checks-card')).not.toBeInTheDocument()
  })

  it('stays hidden when checklists are switched off', () => {
    renderCard({ ...noChecklistsYet, checklists_enabled: false, can_do_checklists: false })

    expect(screen.queryByTestId('checks-setup-prompt')).not.toBeInTheDocument()
  })

  it('stays hidden when all the gym\'s checklists are paused: they exist, so "Set up" would be wrong', () => {
    renderCard({ ...noChecklistsYet, has_any_checklists: true })

    expect(screen.queryByTestId('checks-setup-prompt')).not.toBeInTheDocument()
  })

  it('stays hidden if the server is older and does not send the flag', () => {
    renderCard({ ...noChecklistsYet, has_any_checklists: undefined as unknown as boolean })

    expect(screen.queryByTestId('checks-setup-prompt')).not.toBeInTheDocument()
  })

  it('gives way to the checks card once the gym has a checklist', async () => {
    renderCard({})

    expect(screen.queryByTestId('checks-setup-prompt')).not.toBeInTheDocument()
    expect(await screen.findByText('Nothing due right now')).toBeInTheDocument()
  })

  it('stays dismissed for that person at that gym, and only them', async () => {
    const { unmount } = renderCard(noChecklistsYet)
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss checklist setup' }))
    expect(screen.queryByTestId('checks-setup-prompt')).not.toBeInTheDocument()
    unmount()

    renderCard(noChecklistsYet) // next visit
    expect(screen.queryByTestId('checks-setup-prompt')).not.toBeInTheDocument()
    cleanup()

    signIn('owner', 8) // someone else at the same gym
    renderCard(noChecklistsYet)
    expect(screen.getAllByTestId('checks-setup-prompt')).toHaveLength(1)
  })

  it('still works, and can be dismissed, when browser storage is blocked', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    try {
      renderCard(noChecklistsYet)
      await userEvent.click(screen.getByRole('button', { name: 'Dismiss checklist setup' }))
      expect(screen.queryByTestId('checks-setup-prompt')).not.toBeInTheDocument()
    } finally {
      getItem.mockRestore()
      setItem.mockRestore()
    }
  })
})
