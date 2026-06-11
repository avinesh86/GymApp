import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CoverRequestCard } from './CoverRequestCard'
import type { CoverRequest } from '../../types'

function makeRequest(overrides: Partial<CoverRequest> = {}): CoverRequest {
  return {
    id: 1,
    timetable_event: 10,
    event: 10,
    event_detail: {
      id: 10,
      class_type: 1,
      class_type_name: 'Yoga',
      instructor: 2,
      instructor_name: 'Bob',
      site: 1,
      site_name: 'Studio 1',
      start_datetime: '2099-06-08T21:00:00Z',
      end_datetime: '2099-06-08T22:00:00Z',
      date: '2099-06-09',
      start_time: '09:00',
      end_time: '10:00',
      capacity: 20,
      status: 'needs_cover',
      attendance_count: null,
      notes: '',
    } as never,
    original_instructor_name: 'Alice',
    urgency: 'high',
    bonus_amount: null,
    status: 'pending_approval',
    notes: '',
    cancellation_reason: '',
    cancelled_at: null,
    cancelled_by_name: null,
    created_at: '',
    updated_at: '',
    offers: [],
    ...overrides,
  } as CoverRequest
}

describe('CoverRequestCard (cover redesign)', () => {
  it('renders the new statuses without crashing', () => {
    render(<CoverRequestCard request={makeRequest({ status: 'critical' })} onViewDetails={() => {}} />)
    expect(screen.getByText('Critical')).toBeInTheDocument()
  })

  it('shows Approve/Deny for pending_approval and fires the handlers', async () => {
    const onApprove = vi.fn()
    const onDeny = vi.fn()
    const request = makeRequest({ status: 'pending_approval' })
    render(
      <CoverRequestCard request={request} onViewDetails={() => {}} onApprove={onApprove} onDeny={onDeny} />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(onApprove).toHaveBeenCalledWith(request)

    await userEvent.click(screen.getByRole('button', { name: 'Deny' }))
    expect(onDeny).toHaveBeenCalledWith(request)
  })

  it('does not show Approve/Deny for open requests', () => {
    render(<CoverRequestCard request={makeRequest({ status: 'open' })} onViewDetails={() => {}} onApprove={() => {}} onDeny={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
  })
})
