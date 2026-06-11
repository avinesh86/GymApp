import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import { Toaster } from 'react-hot-toast'
import axios from 'axios'
import { useAuthStore } from './store/auth'
import { useAuth } from './hooks/useAuth'
import { usePermission } from './hooks/usePermission'
import type { AuthUser } from './types'
import { AppLayout } from './components/layout/AppLayout'
import { LoginPage } from './pages/Login'
import { DashboardPage } from './pages/Dashboard'
import { TimetablePage } from './pages/timetable/TimetablePage'
import { StaffPage } from './pages/staff/StaffPage'
import { StaffDetailPage } from './pages/staff/StaffDetailPage'
import { CoverBoardPage } from './pages/cover/CoverBoardPage'
import { InvoicesPage } from './pages/invoices/InvoicesPage'
import { InvoiceDetailPage } from './pages/invoices/InvoiceDetailPage'
import { AttendancePage } from './pages/attendance/AttendancePage'
import { QRAttendancePage } from './pages/qr-attendance/QRAttendancePage'
import { QRSubmitPage } from './pages/qr-attendance/QRSubmitPage'
import { ReportsPage } from './pages/reports/ReportsPage'
import { CSVImportPage } from './pages/imports/CSVImportPage'
import { SettingsPage } from './pages/settings/SettingsPage'
import { MySchedulePage } from './pages/schedule/MySchedulePage'
import { InstructorCalendarPage } from './pages/schedule/InstructorCalendarPage'
import { AttendanceEntryPage } from './pages/attendance/AttendanceEntryPage'
import { ProfilePage } from './pages/profile/ProfilePage'
import { AcceptCoverPage } from './pages/cover/AcceptCoverPage'
import { SignupPage } from './pages/auth/SignupPage'
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage'
import { SetPasswordPage } from './pages/auth/SetPasswordPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

// ─── Restore access token on cold reload ──────────────────────────────────────
// accessToken is memory-only (not persisted). On reload: isAuthenticated and
// refreshToken survive localStorage rehydration, but accessToken is null.
// UserInitializer detects that state and restores a fresh access token before
// any page queries fire, preventing a 401 flood.

function UserInitializer() {
  const { isAuthenticated, login, logout } = useAuth()
  const accessToken = useAuthStore((s) => s.accessToken)
  const refreshToken = useAuthStore((s) => s.refreshToken)
  const setIsRestoring = useAuthStore((s) => s.setIsRestoring)

  useEffect(() => {
    // Nothing to do: either not logged in, or access token already in memory.
    if (!isAuthenticated || accessToken) return

    setIsRestoring(true)

    async function restore() {
      try {
        if (!refreshToken) {
          logout()
          return
        }
        const refreshRes = await axios.post<{ access: string; refresh: string }>(
          '/api/v1/auth/token/refresh/',
          { refresh: refreshToken }
        )
        const newAccess = refreshRes.data.access
        const newRefresh = refreshRes.data.refresh ?? refreshToken
        const userRes = await axios.get<AuthUser>('/api/v1/users/me/', {
          headers: { Authorization: `Bearer ${newAccess}` },
        })
        login({ access: newAccess, refresh: newRefresh }, userRes.data)
      } catch {
        logout()
      }
    }

    restore()
  }, [isAuthenticated, accessToken, refreshToken, login, logout, setIsRestoring])

  return null
}

// ─── Route guard ──────────────────────────────────────────────────────────────

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  const isRestoring = useAuthStore((s) => s.isRestoring)

  if (isRestoring) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F0F2F5]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function PermissionRoute({
  permission,
  children,
}: {
  permission: 'dashboard' | 'timetable' | 'staff' | 'cover' | 'invoices' | 'attendance' | 'qr_attendance' | 'reports' | 'imports' | 'settings'
  children: React.ReactNode
}) {
  const { can } = usePermission()
  if (!can(permission)) {
    return <Navigate to="/dashboard" replace />
  }
  return <>{children}</>
}

// ─── Reset cached data when the logged-in user changes ────────────────────────
// The QueryClient lives for the whole SPA session and query keys aren't scoped
// per user, so without this a logout→login as a different user would serve the
// previous user's cached timetable / calendar data until a hard refresh.

export function CacheReset() {
  const queryClient = useQueryClient()
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const prevUserId = useRef<number | null | undefined>(undefined)

  useEffect(() => {
    if (prevUserId.current !== undefined && prevUserId.current !== userId) {
      queryClient.clear()
    }
    prevUserId.current = userId
  }, [userId, queryClient])

  return null
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <UserInitializer />
        <CacheReset />
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/set-password" element={<SetPasswordPage />} />
          <Route path="/cover/accept/:code" element={<AcceptCoverPage />} />
          <Route path="/attendance/qr" element={<QRSubmitPage />} />

          {/* Protected */}
          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />

            <Route path="/dashboard" element={<DashboardPage />} />

            <Route
              path="/timetable"
              element={
                <PermissionRoute permission="timetable">
                  <TimetablePage />
                </PermissionRoute>
              }
            />

            <Route
              path="/staff"
              element={
                <PermissionRoute permission="staff">
                  <StaffPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/staff/:id"
              element={
                <PermissionRoute permission="staff">
                  <StaffDetailPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/cover"
              element={
                <PermissionRoute permission="cover">
                  <CoverBoardPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/invoices"
              element={
                <PermissionRoute permission="invoices">
                  <InvoicesPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/invoices/:id"
              element={
                <PermissionRoute permission="invoices">
                  <InvoiceDetailPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/attendance"
              element={
                <PermissionRoute permission="attendance">
                  <AttendancePage />
                </PermissionRoute>
              }
            />

            <Route
              path="/qr-attendance"
              element={
                <PermissionRoute permission="qr_attendance">
                  <QRAttendancePage />
                </PermissionRoute>
              }
            />

            <Route
              path="/reports"
              element={
                <PermissionRoute permission="reports">
                  <ReportsPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/imports"
              element={
                <PermissionRoute permission="imports">
                  <CSVImportPage />
                </PermissionRoute>
              }
            />

            <Route
              path="/settings"
              element={
                <PermissionRoute permission="settings">
                  <SettingsPage />
                </PermissionRoute>
              }
            />

            <Route path="/my-schedule" element={<MySchedulePage />} />
            <Route path="/calendar" element={<InstructorCalendarPage />} />
            <Route
              path="/attendance-entry"
              element={
                <PermissionRoute permission="attendance">
                  <AttendanceEntryPage />
                </PermissionRoute>
              }
            />
            <Route path="/profile" element={<ProfilePage />} />

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>

        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              borderRadius: '10px',
              background: '#1a1a1a',
              color: '#fff',
              fontSize: '14px',
            },
            success: {
              iconTheme: { primary: '#06b6d4', secondary: '#fff' },
            },
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
