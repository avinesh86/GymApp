import React from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':     'Dashboard',
  '/timetable':     'Timetable',
  '/staff':         'Staff',
  '/cover':         'Cover Board',
  '/invoices':      'Invoices',
  '/attendance':    'Attendance',
  '/qr-attendance': 'QR Attendance',
  '/reports':       'Reports',
  '/imports':       'CSV Import',
  '/settings':      'Settings',
}

export function AppLayout() {
  const location = useLocation()
  const title = PAGE_TITLES[location.pathname] ?? 'Northern Arena'

  return (
    <div className="flex h-screen bg-[#F0F2F5] overflow-hidden">
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar title={title} />

        <main className="flex-1 overflow-y-auto p-6 bg-[#F0F2F5]">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
