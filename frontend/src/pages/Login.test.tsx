import { describe, it, expect } from 'vitest'
import { afterLoginPath } from './Login'

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
})
