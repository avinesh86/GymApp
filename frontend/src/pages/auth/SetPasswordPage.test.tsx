import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { SetPasswordPage } from './SetPasswordPage'
import { ForgotPasswordPage } from './ForgotPasswordPage'
import { validateInvite, setPasswordWithToken, requestPasswordReset } from '../../api/auth'

vi.mock('../../api/auth', () => ({
  validateInvite: vi.fn(),
  setPasswordWithToken: vi.fn(),
  requestPasswordReset: vi.fn(),
}))

function renderSetPassword(query: string) {
  return render(
    <MemoryRouter initialEntries={[`/set-password${query}`]}>
      <SetPasswordPage />
    </MemoryRouter>,
  )
}

describe('SetPasswordPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('validates the link then sets a new password', async () => {
    vi.mocked(validateInvite).mockResolvedValue({ valid: true, email: 'a@b.com' })
    vi.mocked(setPasswordWithToken).mockResolvedValue()

    renderSetPassword('?uid=U&token=T')

    expect(await screen.findByText('a@b.com')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('New password'), 'Str0ngPass!')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'Str0ngPass!')
    await userEvent.click(screen.getByRole('button', { name: /set password/i }))

    await waitFor(() => expect(setPasswordWithToken).toHaveBeenCalledWith('U', 'T', 'Str0ngPass!'))
    expect(await screen.findByText(/password set/i)).toBeInTheDocument()
  })

  it('surfaces the password-validation error (not "link invalid")', async () => {
    vi.mocked(validateInvite).mockResolvedValue({ valid: true, email: 'a@b.com' })
    vi.mocked(setPasswordWithToken).mockRejectedValue({
      response: { data: { password: ['The password is too similar to the email.'] } },
    })

    renderSetPassword('?uid=U&token=T')
    await screen.findByText('a@b.com')
    await userEvent.type(screen.getByLabelText('New password'), 'Str0ngPass!')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'Str0ngPass!')
    await userEvent.click(screen.getByRole('button', { name: /set password/i }))

    expect(await screen.findByText(/too similar to the email/i)).toBeInTheDocument()
  })

  it('shows expired state for an invalid link', async () => {
    vi.mocked(validateInvite).mockResolvedValue({ valid: false })

    renderSetPassword('?uid=bad&token=bad')

    expect(await screen.findByText(/link expired/i)).toBeInTheDocument()
  })

  it('blocks mismatched passwords', async () => {
    vi.mocked(validateInvite).mockResolvedValue({ valid: true, email: 'a@b.com' })

    renderSetPassword('?uid=U&token=T')
    await screen.findByText('a@b.com')
    await userEvent.type(screen.getByLabelText('New password'), 'Str0ngPass!')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'different1')
    await userEvent.click(screen.getByRole('button', { name: /set password/i }))

    expect(await screen.findByText(/do not match/i)).toBeInTheDocument()
    expect(setPasswordWithToken).not.toHaveBeenCalled()
  })
})

describe('ForgotPasswordPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('submits the email and shows confirmation (no enumeration)', async () => {
    vi.mocked(requestPasswordReset).mockResolvedValue()

    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    )

    await userEvent.type(screen.getByLabelText('Email address'), 'a@b.com')
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }))

    await waitFor(() => expect(requestPasswordReset).toHaveBeenCalledWith('a@b.com'))
    expect(await screen.findByText(/check your email/i)).toBeInTheDocument()
  })
})
