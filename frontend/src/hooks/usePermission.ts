import { useAuth } from './useAuth'
import type { UserRole } from '../types'

export type Permission =
  | 'dashboard'
  | 'timetable'
  | 'staff'
  | 'cover'
  | 'invoices'
  | 'attendance'
  | 'qr_attendance'
  | 'reports'
  | 'imports'
  | 'settings'

export const ALL_PERMISSIONS: Permission[] = [
  'dashboard',
  'timetable',
  'staff',
  'cover',
  'invoices',
  'attendance',
  'qr_attendance',
  'reports',
  'imports',
  'settings',
]

// Default permissions per role — these are used when no localStorage override exists.
export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, Permission[] | ['*']> = {
  owner:            ['*'],
  admin:            ['dashboard', 'timetable', 'staff', 'cover', 'invoices', 'attendance', 'qr_attendance', 'reports', 'imports', 'settings'],
  gym_manager:      ['dashboard', 'timetable', 'staff', 'cover', 'attendance', 'qr_attendance', 'reports'],
  payroll:          ['dashboard', 'invoices', 'reports'],
  team_leader:      ['dashboard', 'timetable', 'cover', 'attendance', 'qr_attendance'],
  instructor:       ['dashboard', 'timetable', 'attendance', 'invoices'],
  class_count_admin: ['dashboard', 'attendance', 'qr_attendance'],
}

const LOCAL_STORAGE_KEY = 'fitops_role_access'

/**
 * Shape stored in localStorage:
 * { [feature: string]: { [role: string]: boolean } }
 */
type StoredMatrix = Record<string, Record<string, boolean>>

function loadStoredMatrix(): StoredMatrix | null {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoredMatrix) : null
  } catch {
    return null
  }
}

/**
 * Resolve whether a role has a given permission, consulting localStorage
 * overrides first and falling back to the hardcoded defaults.
 */
function resolvePermission(role: UserRole, permission: Permission): boolean {
  // owner always has wildcard access — not overridable
  if (role === 'owner') return true

  const matrix = loadStoredMatrix()

  if (matrix && matrix[permission] && role in matrix[permission]) {
    return matrix[permission][role]
  }

  // Fall back to hardcoded defaults
  const defaults = DEFAULT_ROLE_PERMISSIONS[role]
  if (defaults[0] === '*') return true
  return (defaults as Permission[]).includes(permission)
}

export function usePermission() {
  const { user } = useAuth()

  function can(permission: Permission): boolean {
    if (!user) return false
    return resolvePermission(user.role, permission)
  }

  function canAny(permissions: Permission[]): boolean {
    return permissions.some(can)
  }

  return { can, canAny }
}
