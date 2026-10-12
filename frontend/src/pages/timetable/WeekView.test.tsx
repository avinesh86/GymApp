import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WeekView } from './WeekView'
import type { TimetableEvent } from '../../types'

function makeEvent(overrides: Partial<TimetableEvent> = {}): TimetableEvent {
  return {
    id: 1,
    class_type: 1,
    class_type_name: 'Early Spin',
    site: 1,
    site_name: 'Main Floor',
    instructor: null,
    instructor_name: null,
    start_time: '05:05',
    end_time: '05:50',
    date: '2030-03-04',
    status: 'scheduled',
    attendance_count: null,
    ...overrides,
  } as TimetableEvent
}

/** The column for a day, found by its date number in the header. */
function column(dayOfMonth: string) {
  return screen.getByText(dayOfMonth, { selector: 'p' }).closest('div.flex-col') as HTMLElement
}

describe('WeekView — which day a class goes on', () => {
  // Monday 4 March 2030.
  const weekStart = new Date(2030, 2, 4)

  it("places a class on the gym's day, not the viewer's", () => {
    // A 5:05am Monday class at an NZ gym starts on Sunday afternoon in UTC.
    // A viewer whose computer isn't on the gym's timezone saw it on Sunday —
    // last week — so it disappeared from the calendar. The server's `date` is
    // the gym's calendar day, so that decides the column.
    //
    // This start_datetime is earlier than 4 March in every timezone, so the
    // test fails on browser-day placement wherever it runs.
    const event = makeEvent({ start_datetime: '2030-03-02T12:00:00Z' })

    render(<WeekView weekStart={weekStart} events={[event]} onEventClick={() => {}} />)

    expect(column('4')).toHaveTextContent('Early Spin')
  })

  it('still places classes that have no start_datetime', () => {
    render(
      <WeekView
        weekStart={weekStart}
        events={[makeEvent({ date: '2030-03-06', start_datetime: undefined })]}
        onEventClick={() => {}}
      />,
    )

    expect(column('6')).toHaveTextContent('Early Spin')
  })
})
