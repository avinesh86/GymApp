import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReminderDaysInput } from './RecordFields'

vi.mock('../../api/facilities', () => ({ listFacilitiesPeople: vi.fn().mockResolvedValue([]) }))

function Harness({ initial, onChange }: { initial: number[]; onChange?: (d: number[]) => void }) {
  const [days, setDays] = useState(initial)
  return (
    <ReminderDaysInput
      value={days}
      onChange={(d) => {
        setDays(d)
        onChange?.(d)
      }}
    />
  )
}

describe('Reminder days, chosen per licence', () => {
  it('shows each reminder, with 0 as "On the day"', () => {
    render(<Harness initial={[60, 7, 0]} />)
    expect(screen.getByText('60 days before')).toBeInTheDocument()
    expect(screen.getByText('7 days before')).toBeInTheDocument()
    expect(screen.getByText('On the day')).toBeInTheDocument()
  })

  it('adds one, kept largest first, and removes one', async () => {
    const onChange = vi.fn()
    render(<Harness initial={[30, 7]} onChange={onChange} />)
    await userEvent.type(screen.getByLabelText('Add a reminder (days before)'), '90')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(onChange).toHaveBeenLastCalledWith([90, 30, 7])

    await userEvent.click(screen.getByRole('button', { name: 'Remove reminder 30 days before' }))
    expect(onChange).toHaveBeenLastCalledWith([90, 7])
  })

  it('will not add a repeat or a number out of range', async () => {
    render(<Harness initial={[30]} />)
    const input = screen.getByLabelText('Add a reminder (days before)')
    const add = screen.getByRole('button', { name: 'Add' })
    await userEvent.type(input, '30')
    expect(add).toBeDisabled()
    await userEvent.clear(input)
    await userEvent.type(input, '400')
    expect(add).toBeDisabled()
  })

  it('can have none at all', async () => {
    render(<Harness initial={[7]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove reminder 7 days before' }))
    expect(screen.getByText('No reminders')).toBeInTheDocument()
  })
})
