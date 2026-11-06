import React, { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { SetupBanner } from './SetupBanner'
import { GymTimezoneGate } from './GymTimezoneGate'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':     'Dashboard',
  '/timetable':     'Timetable',
  '/staff':         'Staff',
  '/cover':         'Cover Board',
  '/invoices':      'Invoices',
  '/attendance':    'Attendance',
  '/reports':       'Reports',
  '/imports':       'CSV Import',
  '/settings':      'Settings',
}

export function AppLayout() {
  const location = useLocation()
  const title = PAGE_TITLES[location.pathname] ?? 'Northern Arena'
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="flex h-screen bg-[#F0F2F5] overflow-hidden">
      <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar title={title} menuOpen={mobileMenuOpen} onMenuClick={() => setMobileMenuOpen(true)} />
        <SetupBanner />

        <main className="flex-1 overflow-y-auto p-6 bg-[#F0F2F5]">
          <GymTimezoneGate>
            <Outlet />
          </GymTimezoneGate>
        </main>
      </div>
    </div>
  )
}
