import React from 'react'
import { usePermission } from '../../hooks/usePermission'

type Permission =
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

interface RoleGuardProps {
  permission: Permission
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function RoleGuard({ permission, children, fallback = null }: RoleGuardProps) {
  const { can } = usePermission()

  if (!can(permission)) {
    return <>{fallback}</>
  }

  return <>{children}</>
}
