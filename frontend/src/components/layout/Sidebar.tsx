import React, { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Calendar,
  CalendarDays,
  Users,
  RefreshCcw,
  FileText,
  ClipboardList,
  ClipboardCheck,
  QrCode,
  BarChart2,
  Upload,
  Settings,
  LogOut,
  Menu,
  X,
  User,
} from 'lucide-react'
import { usePermission } from '../../hooks/usePermission'
import { useAuth } from '../../hooks/useAuth'
import { useTenantBranding } from '../../hooks/useTenant'

import type { Permission } from '../../hooks/usePermission'

import type { UserRole } from '../../types'

// Roles that have a StaffProfile — only these users can access personal schedule views.
const STAFF_ROLES: UserRole[] = ['instructor', 'team_leader', 'gym_manager']

interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
  permission?: Permission  // undefined = always shown to authenticated users
  roles?: UserRole[]       // undefined = no role restriction
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard',        label: 'Dashboard',       icon: <LayoutDashboard className="h-5 w-5" />, permission: 'dashboard' },
  { to: '/my-schedule',      label: 'My Schedule',     icon: <CalendarDays className="h-5 w-5" />,    roles: STAFF_ROLES },
  { to: '/calendar',         label: 'My Calendar',     icon: <Calendar className="h-5 w-5" />,         roles: STAFF_ROLES },
  { to: '/timetable',        label: 'Timetable',       icon: <Calendar className="h-5 w-5" />,        permission: 'timetable' },
  { to: '/staff',            label: 'Staff',           icon: <Users className="h-5 w-5" />,           permission: 'staff' },
  { to: '/cover',            label: 'Cover Board',     icon: <RefreshCcw className="h-5 w-5" />,      permission: 'cover' },
  { to: '/invoices',         label: 'Invoices',        icon: <FileText className="h-5 w-5" />,        permission: 'invoices' },
  { to: '/attendance',       label: 'Attendance',      icon: <ClipboardList className="h-5 w-5" />,   permission: 'attendance' },
  { to: '/attendance-entry', label: 'Bulk Attendance', icon: <ClipboardCheck className="h-5 w-5" />, permission: 'attendance' },
  { to: '/qr-attendance',    label: 'QR Attendance',   icon: <QrCode className="h-5 w-5" />,          permission: 'qr_attendance' },
  { to: '/reports',          label: 'Reports',         icon: <BarChart2 className="h-5 w-5" />,       permission: 'reports' },
  { to: '/imports',          label: 'CSV Import',      icon: <Upload className="h-5 w-5" />,          permission: 'imports' },
  { to: '/settings',         label: 'Settings',        icon: <Settings className="h-5 w-5" />,        permission: 'settings' },
]

function WaveIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 18C5 14 8 10 11 14C14 18 17 10 20 8C23 6 25 10 26 14" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M2 22C5 18 8 14 11 18C14 22 17 14 20 12C23 10 25 14 26 18" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.5"/>
    </svg>
  )
}

export function Sidebar() {
  const { can } = usePermission()
  const { user, logout } = useAuth()
  const { data: branding } = useTenantBranding()
  const [mobileOpen, setMobileOpen] = useState(false)

  const appName = branding?.app_name ?? 'Northern Arena'

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-white/10">
        <WaveIcon />
        <span className="text-sm font-bold text-white truncate">{appName}</span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto">
        {NAV_ITEMS.filter((item) => {
          if (item.permission && !can(item.permission)) return false
          if (item.roles && (!user || !item.roles.includes(user.role))) return false
          return true
        }).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 px-3 py-2.5 mb-0.5 text-sm font-medium transition-colors duration-150',
                isActive
                  ? 'border-l-2 border-cyan-400 bg-white/5 text-cyan-400'
                  : 'text-white/70 hover:bg-white/5 hover:text-white rounded-lg',
                isActive ? 'rounded-r-lg' : '',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                <span className={isActive ? 'text-cyan-400' : 'text-[#94A3B8]'}>
                  {item.icon}
                </span>
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      <div className="border-t border-white/10 px-3 py-3">
        <div className="flex items-center gap-2 mb-2 px-1">
          <div className="h-7 w-7 rounded-full bg-cyan-500 flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-medium">
              {user?.first_name?.charAt(0) ?? '?'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white truncate">
              {user?.first_name} {user?.last_name}
            </p>
            <p className="text-xs text-[#94A3B8] truncate">{user?.role}</p>
          </div>
        </div>
        <NavLink
          to="/profile"
          onClick={() => setMobileOpen(false)}
          className="flex items-center gap-2 w-full px-3 py-2 text-xs text-[#94A3B8] hover:text-white hover:bg-white/5 rounded-lg transition-colors mb-1"
        >
          <User className="h-4 w-4" />
          My Profile
        </NavLink>
        <button
          onClick={logout}
          className="flex items-center gap-2 w-full px-3 py-2 text-xs text-[#94A3B8] hover:text-red-400 hover:bg-white/5 rounded-lg transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-40 shrink-0 bg-[#0A0D14] h-screen sticky top-0">
        {sidebarContent}
      </aside>

      {/* Mobile hamburger */}
      <button
        className="md:hidden fixed top-4 left-4 z-50 p-2 bg-[#0A0D14] rounded-lg shadow-md border border-white/10"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="h-5 w-5 text-white" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-56 bg-[#0A0D14] h-full shadow-xl">
            <button
              className="absolute top-4 right-4 p-1 text-[#94A3B8] hover:text-white"
              onClick={() => setMobileOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  )
}
