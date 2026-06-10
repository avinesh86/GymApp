import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClassCard } from './ClassCard'
import type { TimetableEvent } from '../../types'

function makeEvent(overrides: Partial<TimetableEvent> = {}): TimetableEvent {
  return {
    id: 1,
    class_type: 1,
    class_type_name: 'Aqua 45',
    site: 1,
    site_name: 'Studio 1',
    instructor: null,
    instructor_name: null,
    start_datetime: '2026-06-08T21:00:00Z',
    end_datetime: '2026-06-08T22:00:00Z',
    // Backend now serializes these in the gym's local timezone.
    start_time: '09:00',
    end_time: '10:00',
    date: '2026-06-09',
    status: 'scheduled',
    attendance_count: null,
    ...overrides,
  } as TimetableEvent
}

describe('ClassCard', () => {
  it('renders the local time range, not an inverted overnight range', () => {
    render(<ClassCard event={makeEvent()} onClick={() => {}} />)

    // The "9:00pm – 10:00am" bug would render a pm→am range; assert the fix.
    expect(screen.getByText('9:00am – 10:00am')).toBeInTheDocument()
  })

  it('shows the status label for the event', () => {
    render(<ClassCard event={makeEvent({ status: 'completed' })} onClick={() => {}} />)
    expect(screen.getByText('Completed')).toBeInTheDocument()
  })

  it('shows the attendance count when present', () => {
    render(<ClassCard event={makeEvent({ status: 'completed', attendance_count: 12 })} onClick={() => {}} />)
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('fires onClick with the event', async () => {
    const onClick = vi.fn()
    const event = makeEvent()
    render(<ClassCard event={event} onClick={onClick} />)

    await userEvent.click(screen.getByText('Aqua 45'))
    expect(onClick).toHaveBeenCalledWith(event)
  })
})
