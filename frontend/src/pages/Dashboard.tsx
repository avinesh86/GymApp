import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  Calendar,
  AlertTriangle,
  RefreshCcw,
  FileText,
  Clock,
  MapPin,
  ChevronRight,
} from 'lucide-react'
import { format, isToday, parseISO } from 'date-fns'
import { listEvents } from '../api/timetable'
import { listAttendance } from '../api/attendance'
import { listCoverRequests } from '../api/cover'
import { listInvoices } from '../api/invoices'
import { PageSpinner } from '../components/ui/Spinner'
import { Badge } from '../components/ui/Badge'
import type { TimetableEvent, CoverRequest, Invoice } from '../types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  const period = hours >= 12 ? 'pm' : 'am'
  const displayHours = hours % 12 || 12
  return `${displayHours}:${String(minutes).padStart(2, '0')}${period}`
}

function todayIso(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

function isEventOngoing(event: TimetableEvent): boolean {
  const now = new Date()
  const today = todayIso()
  if (event.date !== today) return false
  const [sh, sm] = event.start_time.split(':').map(Number)
  const [eh, em] = event.end_time.split(':').map(Number)
  const start = new Date()
  start.setHours(sh, sm, 0, 0)
  const end = new Date()
  end.setHours(eh, em, 0, 0)
  return now >= start && now <= end
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string
  value: number | string
  subtext: string
  icon: React.ReactNode
  iconBg: string
  highlight?: boolean
  onClick?: () => void
}

function StatCard({ label, value, subtext, icon, iconBg, highlight, onClick }: StatCardProps) {
  return (
    <div
      onClick={onClick}
      className={[
        'bg-white rounded-xl p-4 shadow-sm border cursor-pointer hover:shadow-md transition-shadow duration-150',
        highlight ? 'border-amber-300' : 'border-gray-100',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-sm text-gray-500 leading-tight">{label}</p>
          <p className={`text-xs mt-0.5 ${highlight ? 'text-amber-600 font-medium' : 'text-gray-400'}`}>
            {subtext}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Today Schedule Row ───────────────────────────────────────────────────────

interface ScheduleRowProps {
  event: TimetableEvent
  awaitingIds: Set<number>
}

function ScheduleRow({ event, awaitingIds }: ScheduleRowProps) {
  const awaiting = awaitingIds.has(event.id)
  const ongoing = isEventOngoing(event)

  return (
    <div
      className={[
        'flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0',
        awaiting ? 'border-l-4 border-l-amber-400 pl-3' : '',
      ].join(' ')}
    >
      {/* Status dot */}
      <span
        className={[
          'h-2 w-2 rounded-full shrink-0',
          ongoing ? 'bg-blue-500' : awaiting ? 'bg-amber-500' : 'bg-gray-300',
        ].join(' ')}
      />

      {/* Class info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{event.class_type_name}</p>
        <p className="text-xs text-gray-400">{event.site_name}</p>
      </div>

      {/* Time */}
      <p className="text-xs text-gray-500 shrink-0 text-right">
        {formatTime(event.start_time)} – {formatTime(event.end_time)}
      </p>
    </div>
  )
}

// ─── Cover Request Card ───────────────────────────────────────────────────────

function CoverCard({ request }: { request: CoverRequest }) {
  const event = request.event_detail

  const urgencyVariant = {
    critical: 'red' as const,
    high: 'orange' as const,
    low: 'grey' as const,
  }[request.urgency] ?? ('grey' as const)

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-semibold text-gray-900">{event.class_type_name}</p>
        <Badge variant={urgencyVariant}>{request.urgency}</Badge>
      </div>
      <div className="flex flex-col gap-1 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {format(parseISO(event.date), 'd MMM')} · {formatTime(event.start_time)}
        </span>
        <span className="flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          {event.site_name}
        </span>
      </div>
      {request.notes && (
        <p className="text-xs text-gray-400 mt-2 italic line-clamp-2">{request.notes}</p>
      )}
    </div>
  )
}

// ─── Invoice Approval Card ────────────────────────────────────────────────────

const INVOICE_STATUS_VARIANT: Record<string, 'blue' | 'orange' | 'green' | 'grey'> = {
  submitted:        'blue',
  manager_approved: 'orange',
  payroll_approved: 'green',
}

function InvoiceApprovalCard({ invoice, onView }: { invoice: Invoice; onView: () => void }) {
  const statusVariant = INVOICE_STATUS_VARIANT[invoice.status] ?? 'grey'
  const statusLabel =
    invoice.status === 'submitted' ? 'Submitted' :
    invoice.status === 'manager_approved' ? 'Manager Approved' :
    invoice.status

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-gray-900">{invoice.invoice_number}</p>
          <Badge variant={statusVariant}>{statusLabel}</Badge>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          {invoice.instructor_name} · {format(parseISO(invoice.period_start), 'd MMM')} – {format(parseISO(invoice.period_end), 'd MMM yyyy')}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-bold text-gray-900">${invoice.total_amount}</p>
        <button
          onClick={onView}
          className="text-xs text-cyan-600 hover:text-cyan-800 transition-colors mt-0.5"
        >
          View Details &rsaquo;
        </button>
      </div>
    </div>
  )
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({
  title,
  linkLabel,
  onLinkClick,
  badge,
}: {
  title: string
  linkLabel?: string
  onLinkClick?: () => void
  badge?: number
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      {linkLabel && (
        <button
          onClick={onLinkClick}
          className="text-xs text-cyan-600 hover:text-cyan-800 transition-colors flex items-center gap-1"
        >
          {badge !== undefined && badge > 0 && (
            <span className="bg-amber-500 text-white text-xs font-bold rounded-full h-4 w-4 flex items-center justify-center">
              {badge}
            </span>
          )}
          {linkLabel}
          <ChevronRight className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────

export function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const today = todayIso()

  // Attendance-awaiting and pending-invoice widgets are manager/admin tools —
  // instructors aren't permitted to read those endpoints (they'd 403), so only
  // fetch them for roles that can see them.
  const isManagerial = !!user && user.role !== 'instructor'

  const { data: todayEvents = [], isLoading: eventsLoading } = useQuery({
    queryKey: ['timetable-events', 'today', today],
    queryFn: () => listEvents({ from: today, to: today }),
    enabled: !!user,
  })

  const { data: awaitingAttendance = [], isLoading: attendanceLoading } = useQuery({
    queryKey: ['attendance', 'awaiting'],
    queryFn: () => listAttendance({ awaiting: true }),
    enabled: isManagerial,
  })

  // "Open" here means still unfilled — covers auto-dispatch (offered), critical,
  // and manager-gated (pending_approval), not just the literal 'open' status.
  const { data: allCoverRequests = [], isLoading: coverLoading } = useQuery({
    queryKey: ['cover-requests', 'dashboard'],
    queryFn: () => listCoverRequests({}),
    enabled: !!user,
  })
  const UNFILLED_COVER = ['open', 'offered', 'critical', 'pending_approval']
  const openCoverRequests = allCoverRequests.filter((r) => UNFILLED_COVER.includes(r.status))

  const { data: pendingInvoicesPage, isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoices', { status: ['submitted', 'manager_approved'] }],
    queryFn: () => listInvoices({ status: ['submitted', 'manager_approved'] }),
    enabled: isManagerial,
  })

  const isLoading = eventsLoading || attendanceLoading || coverLoading || invoicesLoading

  if (isLoading) return <PageSpinner />

  // Build set of event IDs that are awaiting attendance for quick lookup
  const awaitingEventIds = new Set(awaitingAttendance.map((record) => record.event))

  // Today's events sorted by start time
  const sortedTodayEvents = [...todayEvents].sort((a, b) =>
    a.start_time.localeCompare(b.start_time)
  )
  const displayedScheduleEvents = sortedTodayEvents.slice(0, 8)
  const hasMoreScheduleEvents = sortedTodayEvents.length > 8

  // Count completed today
  const completedTodayCount = todayEvents.filter((e) => e.status === 'completed').length

  // Pending invoices
  const pendingInvoices = pendingInvoicesPage?.results ?? []
  const pendingInvoicesCount = pendingInvoicesPage?.count ?? 0
  const displayedInvoices = pendingInvoices.slice(0, 4)

  return (
    <div className="max-w-6xl mx-auto">
      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Today's Classes"
          value={todayEvents.length}
          subtext={`${completedTodayCount} completed`}
          icon={<Calendar className="h-5 w-5 text-blue-600" />}
          iconBg="bg-blue-50"
          onClick={() => navigate('/timetable')}
        />
        <StatCard
          label="Awaiting Attendance"
          value={awaitingAttendance.length}
          subtext="Need recording"
          icon={<AlertTriangle className="h-5 w-5 text-amber-600" />}
          iconBg="bg-amber-50"
          highlight={awaitingAttendance.length > 0}
          onClick={() => navigate('/attendance')}
        />
        <StatCard
          label="Open Cover Requests"
          value={openCoverRequests.length}
          subtext={openCoverRequests.length === 1 ? '1 open request' : `${openCoverRequests.length} open requests`}
          icon={<RefreshCcw className="h-5 w-5 text-orange-600" />}
          iconBg="bg-orange-50"
          onClick={() => navigate('/cover')}
        />
        <StatCard
          label="Pending Invoices"
          value={pendingInvoicesCount}
          subtext="Awaiting approval"
          icon={<FileText className="h-5 w-5 text-green-600" />}
          iconBg="bg-green-50"
          onClick={() => navigate('/invoices')}
        />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">
        {/* Left: Today's Schedule (60%) */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <SectionHeader
            title="Today's Schedule"
            linkLabel="View All"
            onLinkClick={() => navigate('/timetable')}
          />
          {sortedTodayEvents.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-gray-400">No classes scheduled for today</p>
            </div>
          ) : (
            <>
              {displayedScheduleEvents.map((event) => (
                <ScheduleRow
                  key={event.id}
                  event={event}
                  awaitingIds={awaitingEventIds}
                />
              ))}
              {hasMoreScheduleEvents && (
                <div className="px-4 py-3 text-center">
                  <button
                    onClick={() => navigate('/timetable')}
                    className="text-xs text-cyan-600 hover:text-cyan-800 transition-colors"
                  >
                    View all {sortedTodayEvents.length} classes &rsaquo;
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: Awaiting Attendance (40%) */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <SectionHeader
            title="Awaiting Attendance"
            linkLabel="Submit All"
            onLinkClick={() => navigate('/attendance')}
            badge={awaitingAttendance.length}
          />
          {awaitingAttendance.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-gray-400">All attendance recorded</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {awaitingAttendance.map((record) => {
                const event = record.event_detail
                return (
                  <div
                    key={record.id}
                    onClick={() => navigate('/attendance')}
                    className="px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <p className="text-sm font-bold text-gray-900 truncate">
                      {event.class_type_name}
                    </p>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-xs text-gray-500">
                        {event.instructor_name ?? 'Unassigned'}
                      </p>
                      <p className="text-xs text-gray-400 shrink-0">
                        {format(parseISO(event.date), 'd MMM')} · {formatTime(event.start_time)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Full-width: Open Cover Requests */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-6">
        <SectionHeader
          title="Open Cover Requests"
          linkLabel="View All"
          onLinkClick={() => navigate('/cover')}
        />
        {openCoverRequests.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-gray-400">No open cover requests</p>
          </div>
        ) : (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {openCoverRequests.map((request) => (
              <CoverCard key={request.id} request={request} />
            ))}
          </div>
        )}
      </div>

      {/* Full-width: Pending Invoice Approvals */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <SectionHeader
          title="Pending Invoice Approvals"
          linkLabel="View All"
          onLinkClick={() => navigate('/invoices')}
        />
        {displayedInvoices.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-gray-400">No pending invoice approvals</p>
          </div>
        ) : (
          displayedInvoices.map((invoice) => (
            <InvoiceApprovalCard
              key={invoice.id}
              invoice={invoice}
              onView={() => navigate(`/invoices/${invoice.id}`)}
            />
          ))
        )}
      </div>
    </div>
  )
}
