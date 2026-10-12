import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { ALL_PERMISSIONS, usePermission } from './usePermission'

const auth = vi.hoisted(() => ({ role: 'owner' }))
vi.mock('./useAuth', () => ({ useAuth: () => ({ user: { role: auth.role } }) }))

describe('usePermission', () => {
  beforeEach(() => localStorage.clear())

  it('gives a gym manager every section the owner has', () => {
    auth.role = 'gym_manager'
    const { result } = renderHook(() => usePermission())

    for (const permission of ALL_PERMISSIONS) {
      expect(result.current.can(permission), permission).toBe(true)
    }
  })

  it('does not let a stored role-access setting take it away', () => {
    localStorage.setItem('fitops_role_access', JSON.stringify({ settings: { gym_manager: false } }))
    auth.role = 'gym_manager'
    const { result } = renderHook(() => usePermission())

    expect(result.current.can('settings')).toBe(true)
  })

  it('still limits an instructor', () => {
    auth.role = 'instructor'
    const { result } = renderHook(() => usePermission())

    expect(result.current.can('settings')).toBe(false)
  })
})
