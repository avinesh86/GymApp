import React, { useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Lock } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { DEFAULT_ROLE_PERMISSIONS, ALL_PERMISSIONS, type Permission } from '../../hooks/usePermission'
import type { UserRole } from '../../types'

// ─── Feature display config ───────────────────────────────────────────────────

interface FeatureRow {
  permission: Permission
  label: string
}

const FEATURES: FeatureRow[] = [
  { permission: 'dashboard',     label: 'Dashboard' },
  { permission: 'timetable',     label: 'Timetable (view)' },
  { permission: 'timetable',     label: 'Timetable (edit)' },
  { permission: 'staff',         label: 'Staff Management' },
  { permission: 'cover',         label: 'Cover Board' },
  { permission: 'invoices',      label: 'Invoices' },
  { permission: 'attendance',    label: 'Attendance Entry' },
  { permission: 'qr_attendance', label: 'QR Attendance' },
  { permission: 'reports',       label: 'Reports' },
  { permission: 'imports',       label: 'CSV Import' },
  { permission: 'settings',      label: 'Settings' },
]

// ─── Role display config ──────────────────────────────────────────────────────

interface RoleColumn {
  role: UserRole
  label: string
  locked: boolean
}

const ROLES: RoleColumn[] = [
  { role: 'owner',            label: 'Owner',             locked: true },
  { role: 'admin',            label: 'Admin',             locked: true },
  { role: 'gym_manager',      label: 'Gym Mgr',           locked: false },
  { role: 'payroll',          label: 'Payroll',           locked: false },
  { role: 'team_leader',      label: 'Team Leader',       locked: false },
  { role: 'instructor',       label: 'Instructor',        locked: false },
  { role: 'class_count_admin', label: 'Class Count Admin', locked: false },
]

const LOCAL_STORAGE_KEY = 'fitops_role_access'

// ─── Types ────────────────────────────────────────────────────────────────────

/** Keyed by "featureIndex-role" to handle duplicate permission rows cleanly. */
type MatrixState = Record<string, Record<UserRole, boolean>>

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildDefaultMatrix(): MatrixState {
  const matrix: MatrixState = {}

  FEATURES.forEach((feature, rowIndex) => {
    const rowKey = `${rowIndex}-${feature.permission}`
    matrix[rowKey] = {} as Record<UserRole, boolean>

    for (const { role } of ROLES) {
      const defaults = DEFAULT_ROLE_PERMISSIONS[role]
      if (defaults[0] === '*') {
        matrix[rowKey][role] = true
      } else {
        matrix[rowKey][role] = (defaults as Permission[]).includes(feature.permission)
      }
    }
  })

  return matrix
}

function loadFromStorage(): MatrixState | null {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as MatrixState) : null
  } catch {
    return null
  }
}

function mergeWithDefaults(stored: MatrixState | null): MatrixState {
  const defaults = buildDefaultMatrix()
  if (!stored) return defaults

  const merged: MatrixState = { ...defaults }
  for (const rowKey of Object.keys(stored)) {
    if (rowKey in merged) {
      merged[rowKey] = { ...merged[rowKey], ...stored[rowKey] }
    }
  }
  return merged
}

function persistToStorage(matrix: MatrixState): void {
  // Only persist the non-locked roles — locked roles are always at their default.
  const toStore: MatrixState = {}
  for (const rowKey of Object.keys(matrix)) {
    toStore[rowKey] = {} as Record<UserRole, boolean>
    for (const { role, locked } of ROLES) {
      if (!locked) {
        toStore[rowKey][role] = matrix[rowKey][role]
      }
    }
  }
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(toStore))
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RoleAccessTab() {
  const [matrix, setMatrix] = useState<MatrixState>(() =>
    mergeWithDefaults(loadFromStorage())
  )

  const toggleCell = useCallback((rowKey: string, role: UserRole) => {
    setMatrix((prev) => ({
      ...prev,
      [rowKey]: {
        ...prev[rowKey],
        [role]: !prev[rowKey][role],
      },
    }))
  }, [])

  function handleSave() {
    persistToStorage(matrix)
    toast.success('Access control saved')
  }

  function handleReset() {
    const defaults = buildDefaultMatrix()
    setMatrix(defaults)
    localStorage.removeItem(LOCAL_STORAGE_KEY)
    toast.success('Reset to defaults')
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-gray-900">Role Access Control</h2>
        <p className="text-sm text-gray-500 mt-1">
          Configure which features each role can access. Owner and Admin columns are always enabled
          and cannot be changed.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-44">
                Feature
              </th>
              {ROLES.map(({ role, label, locked }) => (
                <th
                  key={role}
                  className="py-3 px-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                >
                  <span className="flex items-center justify-center gap-1">
                    {label}
                    {locked && <Lock className="h-3 w-3 text-gray-400" />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FEATURES.map((feature, rowIndex) => {
              const rowKey = `${rowIndex}-${feature.permission}`
              return (
                <tr key={rowKey} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="py-3 px-4 text-gray-700 font-medium">{feature.label}</td>
                  {ROLES.map(({ role, locked }) => {
                    const isChecked = matrix[rowKey]?.[role] ?? false
                    return (
                      <td key={role} className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={locked}
                          onChange={() => !locked && toggleCell(rowKey, role)}
                          className={[
                            'h-4 w-4 rounded border-gray-300 text-cyan-500',
                            'focus:ring-cyan-500 focus:ring-2',
                            locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                          ].join(' ')}
                          aria-label={`${feature.label} — ${role}`}
                        />
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4">
        <button
          type="button"
          onClick={handleReset}
          className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2 transition-colors"
        >
          Reset to defaults
        </button>
        <Button onClick={handleSave}>Save Access Control</Button>
      </div>
    </div>
  )
}
