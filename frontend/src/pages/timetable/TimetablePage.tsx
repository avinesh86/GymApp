import React, { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  format,
  isSameWeek,
  parseISO,
} from 'date-fns'
import { ChevronLeft, ChevronRight, Plus, LayoutGrid, List, Search } from 'lucide-react'
import { getWeekEvents, listEventsPaginated, listClassTypes } from '../../api/timetable'
import { listStaff } from '../../api/staff'
import { listSites } from '../../api/settings'
import type { TimetableEvent } from '../../types'
import { WeekView } from './WeekView'
import { ListView } from './ListView'
import { ClassDetailModal } from './ClassDetailModal'
import { AddClassModal } from './AddClassModal'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/shared/PageHeader'
import { PageSpinner } from '../../components/ui/Spinner'
import { RoleGuard } from '../../components/shared/RoleGuard'
import { SetupGuard } from '../../components/shared/SetupGuard'

// ─── Debounce hook ────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

// ─── Timetable Page ───────────────────────────────────────────────────────────

type ViewMode = 'week' | 'list'

export function TimetablePage() {
  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  )
  const [selectedEvent, setSelectedEvent] = useState<TimetableEvent | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [siteFilter, setSiteFilter] = useState('')
  const [instructorFilter, setInstructorFilter] = useState('')
  const [classTypeFilter, setClassTypeFilter] = useState('')
  const [listPage, setListPage] = useState(1)

  const search = useDebounce(searchInput, 300)

  const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 })
  const isCurrentWeek = isSameWeek(currentWeekStart, new Date(), { weekStartsOn: 1 })

  // Week view events
  const { data: weekEvents = [], isLoading: weekLoading } = useQuery({
    queryKey: [
      'timetable-events', 'week',
      format(currentWeekStart, 'yyyy-MM-dd'),
      statusFilter, siteFilter, instructorFilter, classTypeFilter, search,
    ],
    queryFn: () =>
      getWeekEvents({
        from: format(currentWeekStart, 'yyyy-MM-dd'),
        search: search || undefined,
        status: statusFilter || undefined,
        site: siteFilter ? Number(siteFilter) : undefined,
        instructor: instructorFilter ? Number(instructorFilter) : undefined,
        class_type: classTypeFilter ? Number(classTypeFilter) : undefined,
      }),
    enabled: viewMode === 'week',
  })

  // List view events (paginated)
  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: [
      'timetable-events', 'list',
      format(currentWeekStart, 'yyyy-MM-dd'),
      listPage, statusFilter, siteFilter, instructorFilter, classTypeFilter, search,
    ],
    queryFn: () =>
      listEventsPaginated({
        from: format(currentWeekStart, 'yyyy-MM-dd'),
        to: format(weekEnd, 'yyyy-MM-dd'),
        search: search || undefined,
        status: statusFilter || undefined,
        site: siteFilter ? Number(siteFilter) : undefined,
        instructor: instructorFilter ? Number(instructorFilter) : undefined,
        class_type: classTypeFilter ? Number(classTypeFilter) : undefined,
        page: listPage,
        page_size: 20,
      }),
    enabled: viewMode === 'list',
  })

  const { data: sites = [] } = useQuery({
    queryKey: ['sites'],
    queryFn: listSites,
  })

  const { data: staffPage } = useQuery({
    queryKey: ['staff', { status: 'active' }],
    queryFn: () => listStaff({ status: 'active' }),
  })

  const { data: classTypes = [] } = useQuery({
    queryKey: ['class-types'],
    queryFn: listClassTypes,
  })

  function navigatePrev() {
    setCurrentWeekStart((w) => subWeeks(w, 1))
    setListPage(1)
  }

  function navigateNext() {
    setCurrentWeekStart((w) => addWeeks(w, 1))
    setListPage(1)
  }

  function goToToday() {
    setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
    setListPage(1)
  }

  function goToDateWeek(dateStr: string) {
    // dateStr is YYYY-MM-DD (UTC date from API). Parse as local midnight so
    // startOfWeek calculates in the user's timezone, not UTC.
    const eventDate = parseISO(dateStr + 'T00:00:00')
    setCurrentWeekStart(startOfWeek(eventDate, { weekStartsOn: 1 }))
    setListPage(1)
  }

  const staffList = staffPage?.results ?? []
  const isLoading = viewMode === 'week' ? weekLoading : listLoading

  const selectClass =
    'rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500'

  return (
    <div className="max-w-full">
      <PageHeader
        title="Timetable"
        actions={
          <RoleGuard permission="timetable">
            <SetupGuard>
              <Button
                leftIcon={<Plus className="h-4 w-4" />}
                onClick={() => setShowAddModal(true)}
                className="bg-cyan-500 hover:bg-cyan-600 text-white"
              >
                Add Class
              </Button>
            </SetupGuard>
          </RoleGuard>
        }
      />

      {/* Controls row: week nav + view toggle */}
      <div className="flex flex-col lg:flex-row gap-3 mb-4">
        {/* Week navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={navigatePrev}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <button
            onClick={goToToday}
            className={[
              'px-3 py-1.5 text-sm font-medium rounded-lg transition-colors',
              isCurrentWeek
                ? 'bg-cyan-500 text-white'
                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50',
            ].join(' ')}
          >
            Today
          </button>

          <button
            onClick={navigateNext}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            aria-label="Next week"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <span className="text-sm font-medium text-gray-700 ml-2">
            {format(currentWeekStart, 'MMM yyyy')} · {format(currentWeekStart, 'd')}–{format(weekEnd, 'd MMM')}
          </span>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 ml-auto">
          <button
            onClick={() => setViewMode('week')}
            className={[
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              viewMode === 'week'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Week
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={[
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              viewMode === 'list'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            <List className="h-3.5 w-3.5" />
            List
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search classes..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 pr-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent w-44"
          />
        </div>

        <select
          value={siteFilter}
          onChange={(e) => setSiteFilter(e.target.value)}
          className={selectClass}
        >
          <option value="">All Locations</option>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>{site.name}</option>
          ))}
        </select>

        <select
          value={classTypeFilter}
          onChange={(e) => setClassTypeFilter(e.target.value)}
          className={selectClass}
          aria-label="Filter by class"
        >
          <option value="">All Classes</option>
          {classTypes.map((ct) => (
            <option key={ct.id} value={ct.id}>{ct.name}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={selectClass}
        >
          <option value="">All Status</option>
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
          <option value="unfilled">Awaiting Attendance</option>
          <option value="needs_cover">Needs Cover</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <select
          value={instructorFilter}
          onChange={(e) => setInstructorFilter(e.target.value)}
          className={selectClass}
        >
          <option value="">All Instructors</option>
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.first_name} {s.last_name}
            </option>
          ))}
        </select>
      </div>

      {/* Main content */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        {isLoading ? (
          <PageSpinner />
        ) : viewMode === 'week' ? (
          <WeekView
            weekStart={currentWeekStart}
            events={weekEvents}
            onEventClick={setSelectedEvent}
          />
        ) : (
          <ListView
            events={listData?.results ?? []}
            onEventClick={setSelectedEvent}
            page={listPage}
            onPageChange={setListPage}
            totalCount={listData?.count ?? 0}
          />
        )}
      </div>

      <ClassDetailModal
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />

      <AddClassModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onCreated={goToDateWeek}
      />
    </div>
  )
}
