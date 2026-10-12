import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StaffDetailModal } from './StaffDetailModal'
import {
  getStaff,
  updateStaff,
  listQualifications,
  createQualification,
  listAvailability,
  listPayRates,
  listPayRateOverrides,
  getPaymentDetails,
  createOrUpdatePaymentDetails,
} from '../../api/staff'
import { listClassTypes } from '../../api/timetable'
import type { StaffMember } from '../../types'

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../../api/staff', () => ({
  getStaff: vi.fn(),
  updateStaff: vi.fn(),
  deleteStaff: vi.fn(),
  listPayRates: vi.fn(),
  createPayRate: vi.fn(),
  deletePayRate: vi.fn(),
  updatePayRate: vi.fn(),
  listPayRateOverrides: vi.fn(),
  createPayRateOverride: vi.fn(),
  deletePayRateOverride: vi.fn(),
  listQualifications: vi.fn(),
  createQualification: vi.fn(),
  deleteQualification: vi.fn(),
  listCapabilities: vi.fn(),
  createCapability: vi.fn(),
  deleteCapability: vi.fn(),
  listAvailability: vi.fn(),
  createAvailability: vi.fn(),
  deleteAvailability: vi.fn(),
  getPaymentDetails: vi.fn(),
  createOrUpdatePaymentDetails: vi.fn(),
}))
vi.mock('../../api/timetable', () => ({ listClassTypes: vi.fn() }))

const auth = vi.hoisted(() => ({ role: 'owner' }))
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { role: auth.role } }) }))

function makeStaff(overrides: Partial<StaffMember> = {}): StaffMember {
  return {
    id: 7,
    name: 'Mia Chen',
    first_name: 'Mia',
    last_name: 'Chen',
    email: 'mia@example.com',
    phone: '021 555 0100',
    role: 'instructor',
    status: 'active',
    priority_tier: 3,
    reliability_score: 100,
    avatar: null,
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}

function renderModal(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const onClose = vi.fn()
  const view = render(
    <QueryClientProvider client={client}>
      <StaffDetailModal staffId={7} onClose={onClose} />
    </QueryClientProvider>,
  )
  return { ...view, client, onClose }
}

describe('StaffDetailModal — Info tab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.role = 'owner'
    vi.mocked(getStaff).mockResolvedValue(makeStaff())
    vi.mocked(listQualifications).mockResolvedValue([])
    vi.mocked(listClassTypes).mockResolvedValue([])
  })

  it('opens showing the saved priority tier and status', async () => {
    vi.mocked(getStaff).mockResolvedValue(makeStaff({ priority_tier: 3, status: 'inactive' }))

    renderModal()

    // The tier used to start blank whatever was stored, so every reopen
    // looked as though the last save had been lost.
    expect(await screen.findByLabelText('Priority Tier')).toHaveValue('3')
    expect(screen.getByLabelText('Status')).toHaveValue('inactive')
  })

  it('saves the priority tier and status under the names the API stores', async () => {
    vi.mocked(updateStaff).mockResolvedValue(makeStaff({ priority_tier: 2, status: 'inactive' }))

    const { onClose } = renderModal()
    await userEvent.selectOptions(await screen.findByLabelText('Priority Tier'), '2')
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'inactive')
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(updateStaff).toHaveBeenCalledTimes(1))
    const [id, payload] = vi.mocked(updateStaff).mock.calls[0]
    expect(id).toBe(7)
    expect(payload).toMatchObject({ priority_tier: 2, status: 'inactive' })
    // `is_active` is not a field on a staff profile — the API ignored it and
    // answered 200, which is how the status change vanished without an error.
    expect(payload).not.toHaveProperty('is_active')
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('reopens with the values that were just saved', async () => {
    const saved = makeStaff({ priority_tier: 1, status: 'inactive', updated_at: '2026-10-12T00:00:00Z' })
    vi.mocked(updateStaff).mockResolvedValue(saved)

    const { client, unmount } = renderModal()
    await userEvent.selectOptions(await screen.findByLabelText('Priority Tier'), '1')
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'inactive')
    // The refetch a save triggers has not come back yet when the popup is
    // reopened, so the form is built from the cache — which must already hold
    // the saved record.
    vi.mocked(getStaff).mockReturnValue(new Promise(() => {}))
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(updateStaff).toHaveBeenCalled())
    unmount()

    renderModal(client)

    expect(await screen.findByLabelText('Priority Tier')).toHaveValue('1')
    expect(screen.getByLabelText('Status')).toHaveValue('inactive')
  })

  it('leaves the role alone for a manager, who may not change it', async () => {
    auth.role = 'gym_manager'
    vi.mocked(updateStaff).mockResolvedValue(makeStaff({ priority_tier: 2 }))

    renderModal()
    expect(await screen.findByLabelText('Role')).toBeDisabled()
    await userEvent.selectOptions(screen.getByLabelText('Priority Tier'), '2')
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(updateStaff).toHaveBeenCalled())
    expect(vi.mocked(updateStaff).mock.calls[0][1]).not.toHaveProperty('role')
  })

  it('sends a qualification\'s dates as issued_at / expires_at', async () => {
    vi.mocked(createQualification).mockResolvedValue({} as never)

    const { container } = renderModal()
    await userEvent.click(await screen.findByRole('button', { name: /Add Qualification/ }))
    await userEvent.type(screen.getByPlaceholderText('Qualification name'), 'First Aid')
    const [issued, expiry] = Array.from(container.ownerDocument.querySelectorAll('input[type="date"]'))
    await userEvent.type(issued, '2026-01-15')
    await userEvent.type(expiry, '2028-01-15')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(createQualification).toHaveBeenCalledWith(7, {
        name: 'First Aid',
        issued_at: '2026-01-15',
        expires_at: '2028-01-15',
      }),
    )
  })
})

describe('StaffDetailModal — other tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.role = 'owner'
    vi.mocked(getStaff).mockResolvedValue(makeStaff())
    vi.mocked(listQualifications).mockResolvedValue([])
    vi.mocked(listClassTypes).mockResolvedValue([])
  })

  it('shows availability saved from My Profile, whatever time its band started', async () => {
    // Saved by an older screen whose Morning began at 06:00 and Evening at 18:00.
    vi.mocked(listAvailability).mockResolvedValue([
      { id: 1, staff_id: 7, day_of_week: 0, start_time: '06:00:00', end_time: '12:00:00' },
      { id: 2, staff_id: 7, day_of_week: 6, start_time: '18:00:00', end_time: '23:59:00' },
    ])

    renderModal()
    await userEvent.click(await screen.findByRole('button', { name: 'Availability' }))

    expect(await screen.findByLabelText('Monday Morning')).toBeChecked()
    expect(screen.getByLabelText('Sunday Evening')).toBeChecked()
    expect(screen.getByLabelText('Monday Evening')).not.toBeChecked()
  })

  it('loads the saved per-head rate back into the pay rate form', async () => {
    vi.mocked(listPayRateOverrides).mockResolvedValue([])
    vi.mocked(listPayRates).mockResolvedValue([
      {
        id: 3, rate_type: 'blended', amount: '30.00', per_head_rate: '2.50',
        rate_per_hour: '30.00', effective_from: '2026-01-01', effective_to: null,
      },
    ])

    renderModal()
    await userEvent.click(await screen.findByRole('button', { name: 'Pay Rates' }))

    expect(await screen.findByDisplayValue('2.50')).toBeInTheDocument()
  })

  it('uploads the business logo with the payment details', async () => {
    vi.mocked(getPaymentDetails).mockResolvedValue({
      business_name: 'Mia Fitness', bank_name: '', account_name: '', account_number: '',
      sort_code: '', payment_reference: '', additional_notes: '', business_logo: null,
    })
    vi.mocked(createOrUpdatePaymentDetails).mockResolvedValue({} as never)
    const logo = new File(['png'], 'logo.png', { type: 'image/png' })

    const { container } = renderModal()
    await userEvent.click(await screen.findByRole('button', { name: 'Business & Invoice' }))
    await screen.findByDisplayValue('Mia Fitness')
    await userEvent.upload(container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement, logo)
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(createOrUpdatePaymentDetails).toHaveBeenCalled())
    const [id, fields, file] = vi.mocked(createOrUpdatePaymentDetails).mock.calls[0]
    expect(id).toBe(7)
    expect(fields).toMatchObject({ business_name: 'Mia Fitness' })
    expect(file).toBe(logo)
  })
})
