import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { afterLoginPath, LoginPage } from './Login'
import { login } from '../api/auth'

vi.mock('../api/auth', async (actual) => ({
  ...(await actual<typeof import('../api/auth')>()),
  login: vi.fn(),
}))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))

describe('where signing in takes you', () => {
  it('back to the page you were sent from, such as a scanned QR code', () => {
    expect(afterLoginPath({ from: '/equipment/12' })).toBe('/equipment/12')
  })

  it('to the dashboard otherwise', () => {
    expect(afterLoginPath(null)).toBe('/dashboard')
    expect(afterLoginPath({})).toBe('/dashboard')
  })

  it('never to another site or back to sign-in', () => {
    expect(afterLoginPath({ from: 'https://evil.example' })).toBe('/dashboard')
    expect(afterLoginPath({ from: '//evil.example' })).toBe('/dashboard')
    expect(afterLoginPath({ from: '/login' })).toBe('/dashboard')
  })

  it('not via a backslash, which browsers read as a slash', () => {
    expect(afterLoginPath({ from: '/\\evil.example' })).toBe('/dashboard')
    expect(afterLoginPath({ from: '/\\/evil.example' })).toBe('/dashboard')
  })
})

describe('what signing in says when it fails', () => {
  async function signInFailing(error: unknown) {
    vi.mocked(login).mockRejectedValueOnce(error)
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )
    await userEvent.type(screen.getByLabelText('Email address'), 'owner@gym.example')
    await userEvent.type(screen.getByLabelText('Password'), 'right-password')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
  }

  it("doesn't call the password wrong when the server never answered", async () => {
    // A timeout or dropped connection used to say "Invalid email or password",
    // sending people to reset a password that was fine.
    await signInFailing(new AxiosError('timeout of 30000ms exceeded', AxiosError.ECONNABORTED))
    expect(await screen.findByText(/Couldn't reach the server/)).toBeInTheDocument()
    expect(screen.queryByText(/Invalid email or password/)).not.toBeInTheDocument()
  })

  it('says the details are wrong when the server says so', async () => {
    const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig
    await signInFailing(
      new AxiosError('Unauthorized', '401', config, null, { status: 401, statusText: 'Unauthorized', data: {}, headers: {}, config }),
    )
    expect(await screen.findByText(/Invalid email or password/)).toBeInTheDocument()
  })
})
