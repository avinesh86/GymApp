import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  format,
  startOfDay,
  endOfDay,
  subDays,
  startOfWeek,
  endOfWeek,
  subWeeks,
  parseISO,
} from 'date-fns'
import { ClipboardList, Clock, MapPin, User, CheckCircle } from 'lucide-react'
import { listAttendance, countAwaitingAttendance, submitAttendanceForEvent } from '../../api/attendance'
import type { AttendanceRecord } from '../../types'
import { PageHeader } from '../../components/shared/PageHeader'
import { PageSpinner } from '../../components/ui/Spinner'
import { EmptyState } from '../../components/ui/EmptyState'

// ─── Types ────────────────────────────────────────────────────────────────────

type DateTab = 'today' | 'this_week' | 'last_week' | 'older'

// ─── Date helpers ─────────────────────────────────────────────────────────────
//
// We send ISO datetime strings (local time) so the backend can compare against
// UTC-stored start_datetime values correctly, regardless of server timezone.

function toISO(date: Date): string {
  return date.toISOString()
}

function getDateRange(tab: DateTab): { from_datetime?: string; to_datetime?: string } {
  const now = new Date()

  switch (tab) {
    case 'today':
      return {
        from_datetime: toISO(startOfDay(now)),
        to_datetime: toISO(endOfDay(now)),
      }
    case 'this_week':
      return {
        from_datetime: toISO(startOfWeek(now, { weekStartsOn: 1 })),
        to_datetime: toISO(endOfWeek(now, { weekStartsOn: 1 })),
      }
    case 'last_week': {
      const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 })
      const lastWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 })
      return {
        from_datetime: toISO(lastWeekStart),
        to_datetime: toISO(lastWeekEnd),
      }
    }
    case 'older': {
      const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 })
      return {
        to_datetime: toISO(subDays(lastWeekStart, 1)),
      }
    }
  }
}

// ─── Quick-pick values ────────────────────────────────────────────────────────

const QUICK_PICKS = [0, 5, 10, 15, 20, 25, 30]

// ─── Main page ────────────────────────────────────────────────────────────────

export function AttendanceEntryPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<DateTab>('today')
  const [inputValues, setInputValues] = useState<Map<number, string>>(new Map())
  const [submittedIds, setSubmittedIds] = useState<Set<number>>(new Set())

  const dateRange = getDateRange(activeTab)

  const { data: awaitingRecords = [], isLoading } = useQuery({
    queryKey: ['attendance-awaiting', activeTab],
    queryFn: () => listAttendance({ awaiting: true, ...dateRange }),
  })

  // Counts for tab badges — stable ranges computed once at render time
  const todayRange = getDateRange('today')
  const thisWeekRange = getDateRange('this_week')
  const lastWeekRange = getDateRange('last_week')
  const olderRange = getDateRange('older')

  const { data: todayCount = 0 } = useQuery({
    queryKey: ['attendance-count', 'today'],
    queryFn: () => countAwaitingAttendance(todayRange),
  })
  const { data: thisWeekCount = 0 } = useQuery({
    queryKey: ['attendance-count', 'this_week'],
    queryFn: () => countAwaitingAttendance(thisWeekRange),
  })
  const { data: lastWeekCount = 0 } = useQuery({
    queryKey: ['attendance-count', 'last_week'],
    queryFn: () => countAwaitingAttendance(lastWeekRange),
  })
  const { data: olderCount = 0 } = useQuery({
    queryKey: ['attendance-count', 'older'],
    queryFn: () => countAwaitingAttendance(olderRange),
  })

  const tabCounts: Record<DateTab, number> = {
    today: todayCount,
    this_week: thisWeekCount,
    last_week: lastWeekCount,
    older: olderCount,
  }

  const totalAwaiting = todayCount + thisWeekCount + lastWeekCount + olderCount

  const { mutate: submitAttendance, isPending: isSubmitting } = useMutation({
    mutationFn: ({ eventId, count }: { eventId: number; count: number }) =>
      submitAttendanceForEvent(eventId, count),
    onSuccess: (_data, { eventId }) => {
      setSubmittedIds((prev) => new Set(prev).add(eventId))
      queryClient.invalidateQueries({ queryKey: ['attendance-awaiting'] })
      queryClient.invalidateQueries({ queryKey: ['attendance-count'] })
      toast.success('Attendance saved')
    },
    onError: () => toast.error('Failed to save attendance'),
  })

  function setInput(eventId: number, value: string) {
    setInputValues((prev) => {
      const next = new Map(prev)
      next.set(eventId, value)
      return next
    })
  }

  function handleSubmit(eventId: number) {
    const value = inputValues.get(eventId)
    if (value === undefined || value === '') return
    submitAttendance({ eventId, count: Number(value) })
  }

  const DATE_TABS: { key: DateTab; label: string }[] = [
    { key: 'today',     label: 'Today' },
    { key: 'this_week', label: 'This Week' },
    { key: 'last_week', label: 'Last Week' },
    { key: 'older',     label: 'Older' },
  ]

  return (
    <div>
      <PageHeader
        title="Attendance Entry"
        subtitle={`${totalAwaiting} class${totalAwaiting !== 1 ? 'es' : ''} awaiting attendance`}
      />

      {/* Tab bar */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {DATE_TABS.map((tab) => {
          const count = tabCounts[tab.key]
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={[
                'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors',
                isActive
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-cyan-400 hover:text-cyan-600',
              ].join(' ')}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className={[
                    'text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center',
                    isActive ? 'bg-white/25 text-white' : 'bg-red-500 text-white',
                  ].join(' ')}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Content */}
      {isLoading ? (
        <PageSpinner />
      ) : awaitingRecords.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-12 w-12" />}
          title="No classes awaiting attendance"
          description="All classes for this period have been recorded"
        />
      ) : (
        <div className="flex flex-col gap-4">
          {awaitingRecords.map((record) => (
            <AttendanceCard
              key={record.event}
              record={record}
              inputValue={inputValues.get(record.event) ?? ''}
              isSubmitted={submittedIds.has(record.event)}
              isSubmitting={isSubmitting}
              onInputChange={(value) => setInput(record.event, value)}
              onQuickPick={(value) => {
                setInput(record.event, String(value))
              }}
              onSubmit={() => handleSubmit(record.event)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Attendance Card ──────────────────────────────────────────────────────────

interface AttendanceCardProps {
  record: AttendanceRecord
  inputValue: string
  isSubmitted: boolean
  isSubmitting: boolean
  onInputChange: (value: string) => void
  onQuickPick: (value: number) => void
  onSubmit: () => void
}

function AttendanceCard({
  record,
  inputValue,
  isSubmitted,
  isSubmitting,
  onInputChange,
  onQuickPick,
  onSubmit,
}: AttendanceCardProps) {
  const event = record.event_detail
  const isRecorded = isSubmitted || record.count !== null

  if (!event) return null

  return (
    <div className={[
      'bg-white rounded-xl border shadow-sm p-5',
      isRecorded ? 'border-green-200 bg-green-50/30' : 'border-gray-100',
    ].join(' ')}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="font-semibold text-gray-900 text-base">{event.class_type_name}</p>
          <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-gray-400" />
              {event.date ? format(parseISO(event.date), 'EEE, d MMM') : ''} · {event.start_time}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-gray-400" />
              {event.site_name}
            </span>
            {event.instructor_name && (
              <span className="flex items-center gap-1">
                <User className="h-3.5 w-3.5 text-gray-400" />
                {event.instructor_name}
              </span>
            )}
          </div>
        </div>

        {isRecorded ? (
          <span className="flex items-center gap-1.5 text-sm font-semibold text-green-600 bg-green-100 px-3 py-1 rounded-full shrink-0">
            <CheckCircle className="h-4 w-4" />
            Recorded
          </span>
        ) : (
          <span className="text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full shrink-0">
            Pending
          </span>
        )}
      </div>

      {isRecorded ? (
        <p className="text-sm text-green-700 font-medium">
          {record.count !== null ? record.count : inputValue} attendees recorded
        </p>
      ) : (
        <>
          <p className="text-sm font-medium text-gray-600 mb-2">How many attendees?</p>

          {/* Number input */}
          <input
            type="number"
            min="0"
            max="999"
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder="0"
            className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-lg text-center font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 mb-3"
          />

          {/* Quick-pick row */}
          <div className="flex gap-2 flex-wrap mb-4">
            {QUICK_PICKS.map((value) => (
              <button
                key={value}
                onClick={() => onQuickPick(value)}
                className={[
                  'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                  inputValue === String(value)
                    ? 'bg-cyan-600 text-white border-cyan-600'
                    : 'border-gray-200 text-gray-600 hover:border-cyan-400 hover:text-cyan-600 bg-white',
                ].join(' ')}
              >
                {value}
              </button>
            ))}
          </div>

          {/* Submit button */}
          <button
            onClick={onSubmit}
            disabled={inputValue === '' || isSubmitting}
            className="w-full flex items-center justify-center gap-2 bg-indigo-400 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {isSubmitting ? (
              <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4" />
            )}
            Save Attendance
          </button>
        </>
      )}
    </div>
  )
}
