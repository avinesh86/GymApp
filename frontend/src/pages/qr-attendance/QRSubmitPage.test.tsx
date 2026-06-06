import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QRSubmitPage } from './QRSubmitPage'
import { getQRTokenInfo, submitQRAttendance } from '../../api/attendance'

vi.mock('../../api/attendance', () => ({
  getQRTokenInfo: vi.fn(),
  submitQRAttendance: vi.fn(),
}))

const INFO = {
  valid: true,
  is_used: false,
  class_type_name: 'Yoga',
  date: '2026-06-08',
  start_time: '09:00',
  site_name: 'Studio 1',
  instructor_name: 'Sarah',
}

function renderAt(token: string) {
  return render(
    <MemoryRouter initialEntries={[`/attendance/qr?token=${token}`]}>
      <QRSubmitPage />
    </MemoryRouter>,
  )
}

describe('QRSubmitPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the session and submits a head count', async () => {
    vi.mocked(getQRTokenInfo).mockResolvedValue(INFO)
    vi.mocked(submitQRAttendance).mockResolvedValue()

    renderAt('abc')

    expect(await screen.findByText('Yoga')).toBeInTheDocument()
    await userEvent.type(screen.getByPlaceholderText('e.g. 12'), '15')
    await userEvent.click(screen.getByRole('button', { name: /record attendance/i }))

    await waitFor(() => expect(submitQRAttendance).toHaveBeenCalledWith('abc', 15))
    expect(await screen.findByText(/attendance recorded/i)).toBeInTheDocument()
  })

  it('shows an error for an invalid/expired token', async () => {
    vi.mocked(getQRTokenInfo).mockRejectedValue(new Error('bad'))

    renderAt('bad')

    expect(await screen.findByText(/invalid or has expired/i)).toBeInTheDocument()
  })

  it('disables submission when the token is already used', async () => {
    vi.mocked(getQRTokenInfo).mockResolvedValue({ ...INFO, is_used: true })

    renderAt('used')

    expect(await screen.findByText(/already recorded/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /record attendance/i })).toBeDisabled()
  })
})
