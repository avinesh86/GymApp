import React, { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search, Users } from 'lucide-react'
import { listStaff } from '../../api/staff'
import type { StaffMember } from '../../types'
import { StaffCard } from './StaffCard'
import { AddStaffModal } from './AddStaffModal'
import { StaffDetailModal } from './StaffDetailModal'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/shared/PageHeader'
import { PageSpinner } from '../../components/ui/Spinner'
import { EmptyState } from '../../components/ui/EmptyState'
import { RoleGuard } from '../../components/shared/RoleGuard'

// ─── Debounce hook ────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_OPTIONS = [
  { value: '',                label: 'All Roles' },
  { value: 'instructor',      label: 'Instructor' },
  { value: 'team_leader',     label: 'Team Leader' },
  { value: 'gym_manager',     label: 'Gym Manager' },
  { value: 'payroll',         label: 'Payroll' },
  { value: 'admin',           label: 'Admin' },
  { value: 'class_count_admin', label: 'Class Count Admin' },
]

// ─── Staff Page ───────────────────────────────────────────────────────────────

export function StaffPage() {
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('active')
  const [page, setPage] = useState(1)

  const search = useDebounce(searchInput, 300)

  const { data: staffPage, isLoading } = useQuery({
    queryKey: ['staff', { search, role: roleFilter, status: statusFilter, page }],
    queryFn: () =>
      listStaff({
        search: search || undefined,
        role: roleFilter || undefined,
        status: statusFilter || undefined,
        page,
        page_size: 20,
      }),
  })

  const staffList = staffPage?.results ?? []
  const totalPages = Math.ceil((staffPage?.count ?? 0) / 20)

  const selectClass =
    'rounded-lg border border-gray-300 px-3 py-1.5 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-500'

  return (
    <div>
      <PageHeader
        title="Staff"
        subtitle={staffPage ? `${staffPage.count} members` : undefined}
        actions={
          <RoleGuard permission="staff">
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setShowAddModal(true)}>
              Add Staff
            </Button>
          </RoleGuard>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search staff..."
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value)
              setPage(1)
            }}
            className="pl-9 pr-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent w-48"
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1) }}
          className={selectClass}
        >
          {ROLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className={selectClass}
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="suspended">Suspended</option>
          <option value="">All</option>
        </select>
      </div>

      {/* Grid */}
      {isLoading ? (
        <PageSpinner />
      ) : staffList.length === 0 ? (
        <EmptyState
          icon={<Users className="h-12 w-12" />}
          title="No staff members found"
          description="Add your first staff member to get started"
          action={{ label: 'Add Staff', onClick: () => setShowAddModal(true) }}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            {staffList.map((staff) => (
              <StaffCard
                key={staff.id}
                staff={staff}
                onClick={(s: StaffMember) => setSelectedStaffId(s.id)}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage(page - 1)}
                  disabled={page <= 1}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={page >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      <AddStaffModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />

      <StaffDetailModal
        staffId={selectedStaffId}
        onClose={() => setSelectedStaffId(null)}
      />
    </div>
  )
}
