import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CalendarEventChip, type CalendarEvent } from './AttendanceTab'

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    event_id: 1,
    class_name: 'Aqua 45',
    time: '09:00',
    attendance_count: 10,
    color: '#6b7280',
    ...overrides,
  }
}

describe('CalendarEventChip (F6 — show class time)', () => {
  it('shows the class time in the cell', () => {
    render(<CalendarEventChip ev={makeEvent({ time: '18:30' })} />)
    expect(screen.getByText('18:30')).toBeInTheDocument()
  })

  it('shows time alongside name and attendance count', () => {
    const { container } = render(<CalendarEventChip ev={makeEvent({ time: '06:15', attendance_count: 22 })} />)
    expect(screen.getByText('06:15')).toBeInTheDocument()
    expect(container.textContent).toContain('Aqua 45')
    expect(container.textContent).toContain('· 22')
  })

  it('shows time even when attendance is not yet recorded', () => {
    const { container } = render(<CalendarEventChip ev={makeEvent({ time: '12:00', attendance_count: null })} />)
    expect(screen.getByText('12:00')).toBeInTheDocument()
    expect(container.textContent).not.toContain('· ')
  })

  it('keeps the full class name + time in the title tooltip', () => {
    render(<CalendarEventChip ev={makeEvent({ class_name: 'Les Mills BodyAttack', time: '07:45' })} />)
    expect(screen.getByTitle(/Les Mills BodyAttack · 07:45/)).toBeInTheDocument()
  })
})
