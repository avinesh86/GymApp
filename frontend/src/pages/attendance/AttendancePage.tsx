import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { MapPin, Clock, User, Check } from 'lucide-react'
import { subWeeks, startOfWeek, endOfWeek, startOfDay, endOfDay, parseISO } from 'date-fns'
import { listAttendance, submitAttendanceForEvent } from '../../api/attendance'
import type { AttendanceRecord } from '../../types'
import { PageHeader } from '../../components/shared/PageHeader'
import { PageSpinner } from '../../components/ui/Spinner'
import { EmptyState } from '../../components/ui/EmptyState'
import { ClipboardList } from 'lucide-react'
import { format } from 'date-fns'

type TabKey = 'today' | 'this_week' | 'last_week' | 'older'

const QUICK_PICKS = [0, 5, 10, 15, 20, 25, 30]

interface AttendanceCardProps {
  record: AttendanceRecord
}

function AttendanceCard({ record }: AttendanceCardProps) {
  const queryClient = useQueryClient()
  const [count, setCount] = useState(record.count ?? 0)
  const [saved, setSaved] = useState(record.is_verified)

  const event = record.event_detail

  const { mutate: saveCount, isPending } = useMutation({
    mutationFn: () => submitAttendanceForEvent(event.id, count),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
      toast.success('Attendance saved')
      setSaved(true)
    },
    onError: () => toast.error('Failed to save attendance'),
  })

  return (
    <div className={[
      'bg-white rounded-xl border shadow-sm p-4',
      saved ? 'border-green-200' : 'border-gray-100',
    ].join(' ')}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-gray-900">{event.class_type_name}</p>
          <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-gray-400" />
              {format(parseISO(event.start_datetime ?? event.date), 'EEE, MMM d')} · {event.start_time} – {event.end_time}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-gray-400" />
              {event.site_name}
            </span>
            <span className="flex items-center gap-1">
              <User className="h-3.5 w-3.5 text-gray-400" />
              {event.instructor_name ?? 'Unassigned'}
            </span>
          </div>
        </div>
        {saved ? (
          <span className="flex items-center gap-1 text-xs text-green-600 font-medium bg-green-50 px-2 py-1 rounded-full">
            <Check className="h-3.5 w-3.5" />
            Saved
          </span>
        ) : (
          <span className="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-1 rounded-full">
            Pending
          </span>
        )}
      </div>

      {/* Count input */}
      <div className="mt-3">
        <p className="text-xs font-medium text-gray-500 mb-2">How many attendees?</p>
        <div className="flex items-center gap-3 mb-3">
          <input
            type="number"
            min="0"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="w-24 text-center text-2xl font-bold text-gray-900 rounded-lg border-2 border-gray-200 py-2 focus:outline-none focus:border-cyan-500 transition-colors"
          />
        </div>

        {/* Quick picks */}
        <div className="flex flex-wrap gap-2 mb-4">
          {QUICK_PICKS.map((value) => (
            <button
              key={value}
              onClick={() => setCount(value)}
              className={[
                'w-10 h-10 rounded-lg text-sm font-medium border transition-colors',
                count === value
                  ? 'bg-cyan-500 text-white border-cyan-500'
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100',
              ].join(' ')}
            >
              {value}
            </button>
          ))}
        </div>

        <button
          onClick={() => saveCount()}
          disabled={isPending}
          className="w-full flex items-center justify-center gap-2 bg-cyan-500 text-white font-medium rounded-lg py-2.5 hover:bg-cyan-600 transition-colors disabled:opacity-60"
        >
          {isPending ? (
            <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Save Attendance
        </button>
      </div>
    </div>
  )
}

export function AttendancePage() {
  const [activeTab, setActiveTab] = useState<TabKey>('today')

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['attendance', 'awaiting'],
    queryFn: () => listAttendance({ awaiting: true }),
  })

  // Compute UTC ISO boundaries from local day/week boundaries.
  // Comparing ISO strings directly (lexicographic) is timezone-safe — it does
  // not rely on isToday/isThisWeek which use the browser's local timezone and
  // fail when the OS timezone differs from the gym's timezone.
  const now = new Date()
  const todayFrom    = startOfDay(now).toISOString()
  const todayTo      = endOfDay(now).toISOString()
  const weekFrom     = startOfWeek(now, { weekStartsOn: 1 }).toISOString()
  const weekTo       = endOfWeek(now, { weekStartsOn: 1 }).toISOString()
  const lastWeekFrom = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }).toISOString()
  const lastWeekTo   = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }).toISOString()

  function getStartDt(record: AttendanceRecord): string {
    return record.event_detail.start_datetime ?? record.event_detail.date
  }

  function inRange(dt: string, from: string, to: string): boolean {
    return dt >= from && dt <= to
  }

  function filterByTab(record: AttendanceRecord): boolean {
    const dt = getStartDt(record)
    switch (activeTab) {
      case 'today':
        return inRange(dt, todayFrom, todayTo)
      case 'this_week':
        return inRange(dt, weekFrom, weekTo) && !inRange(dt, todayFrom, todayTo)
      case 'last_week':
        return inRange(dt, lastWeekFrom, lastWeekTo)
      case 'older':
        return dt < lastWeekFrom
      default:
        return true
    }
  }

  const todayCount = records.filter((r) => inRange(getStartDt(r), todayFrom, todayTo)).length
  const weekCount  = records.filter((r) => inRange(getStartDt(r), weekFrom, weekTo) && !inRange(getStartDt(r), todayFrom, todayTo)).length
  const filteredRecords = records.filter(filterByTab)

  const TABS: { key: TabKey; label: string; count?: number }[] = [
    { key: 'today',     label: 'Today',     count: todayCount },
    { key: 'this_week', label: 'This Week',  count: weekCount },
    { key: 'last_week', label: 'Last Week' },
    { key: 'older',     label: 'Older' },
  ]

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader
        title="Attendance Entry"
        subtitle={`${records.length} class${records.length !== 1 ? 'es' : ''} awaiting attendance`}
      />

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={[
              'flex items-center gap-1.5 flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              activeTab === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="h-5 min-w-5 px-1 rounded-full bg-cyan-500 text-white text-xs font-bold flex items-center justify-center">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Records */}
      {isLoading ? (
        <PageSpinner />
      ) : filteredRecords.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-12 w-12" />}
          title="No classes awaiting attendance"
          description="All classes for this period have been recorded"
        />
      ) : (
        <div className="flex flex-col gap-4">
          {filteredRecords.map((record) => (
            <AttendanceCard key={`${record.id}-${record.event}`} record={record} />
          ))}
        </div>
      )}
    </div>
  )
}
