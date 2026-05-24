import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  parseISO,
  startOfWeek,
  addDays,
  addWeeks,
  subWeeks,
  isSameDay,
} from 'date-fns'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
  Cell,
} from 'recharts'
import { ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { getAttendanceReport, getClassTypes } from '../../../api/reports'
import { PageSpinner } from '../../../components/ui/Spinner'
import { Card } from '../../../components/ui/Card'

type PeriodKey = 'this_month' | 'last_month' | 'custom'

const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-4">
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}

function attendanceBg(count: number | null): string {
  if (count === null) return 'bg-gray-100 text-gray-400'
  if (count < 5) return 'bg-red-100 text-red-700'
  if (count < 15) return 'bg-orange-100 text-orange-700'
  if (count < 25) return 'bg-yellow-100 text-yellow-700'
  return 'bg-green-100 text-green-700'
}

function exportCsv(rows: Array<{
  class_name: string
  instructor_name: string | null
  site_name: string | null
  date: string
  time: string
  attendance_count: number
}>) {
  const header = 'Class,Instructor,Location,Date,Time,Attendance\n'
  const body = rows
    .map(
      (r) =>
        [r.class_name, r.instructor_name ?? '', r.site_name ?? '', r.date, r.time, r.attendance_count]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(',')
    )
    .join('\n')
  const blob = new Blob([header + body], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'attendance_log.csv'
  link.click()
  URL.revokeObjectURL(url)
}

export function AttendanceTab() {
  const [period, setPeriod] = useState<PeriodKey>('this_month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [selectedClassType, setSelectedClassType] = useState<number | undefined>(undefined)
  const [calendarWeekOffset, setCalendarWeekOffset] = useState(0)
  const [logPage, setLogPage] = useState(1)

  const now = new Date()

  const dateRange = (() => {
    if (period === 'this_month') {
      return {
        from: format(startOfMonth(now), 'yyyy-MM-dd'),
        to: format(endOfMonth(now), 'yyyy-MM-dd'),
      }
    }
    if (period === 'last_month') {
      const last = subMonths(now, 1)
      return {
        from: format(startOfMonth(last), 'yyyy-MM-dd'),
        to: format(endOfMonth(last), 'yyyy-MM-dd'),
      }
    }
    return { from: customFrom, to: customTo }
  })()

  const { data: classTypes = [] } = useQuery({
    queryKey: ['class-types'],
    queryFn: getClassTypes,
  })

  const { data: report, isLoading } = useQuery({
    queryKey: ['reports', 'attendance', dateRange.from, dateRange.to, selectedClassType],
    queryFn: () => getAttendanceReport(dateRange.from, dateRange.to, selectedClassType),
    enabled: !!(dateRange.from && dateRange.to),
  })

  // Build weeks from daily_breakdown
  const weeks = (() => {
    if (!report?.daily_breakdown?.length) return []
    const dateMap = new Map(report.daily_breakdown.map((d) => [d.date, d.events]))
    const allDates = report.daily_breakdown.map((d) => parseISO(d.date))
    const firstMonday = startOfWeek(allDates[0], { weekStartsOn: 1 })
    const lastDate = allDates[allDates.length - 1]
    const result: Array<{ weekStart: Date; days: Array<{ date: Date; events: typeof report.daily_breakdown[0]['events'] }> }> = []
    let cursor = firstMonday
    while (cursor <= lastDate) {
      const days = Array.from({ length: 7 }, (_, i) => {
        const day = addDays(cursor, i)
        const key = format(day, 'yyyy-MM-dd')
        return { date: day, events: dateMap.get(key) ?? [] }
      })
      result.push({ weekStart: cursor, days })
      cursor = addWeeks(cursor, 1)
    }
    return result
  })()

  const totalWeeks = weeks.length
  const currentWeekIndex = Math.max(0, Math.min(calendarWeekOffset, totalWeeks - 1))
  const currentWeek = weeks[currentWeekIndex]

  const LOG_PAGE_SIZE = 20
  const logRows = report?.class_log ?? []
  const visibleLog = logRows.slice(0, logPage * LOG_PAGE_SIZE)

  // Build unique lines for class_type_weekly_trend
  const trendLines = Object.keys(report?.class_type_weekly_trend ?? {})
  const trendWeekKeys = [
    ...new Set(
      trendLines.flatMap((name) =>
        (report?.class_type_weekly_trend[name] ?? []).map((p) => p.week_start)
      )
    ),
  ].sort()

  const trendData = trendWeekKeys.map((week) => {
    const row: Record<string, string | number> = { week_start: week }
    trendLines.forEach((name) => {
      const point = (report?.class_type_weekly_trend[name] ?? []).find(
        (p) => p.week_start === week
      )
      row[name] = point?.avg_attendance ?? 0
    })
    return row
  })

  // Color map for trend lines (from by_class_type)
  const classTypeColorMap = Object.fromEntries(
    (report?.by_class_type ?? []).map((ct) => [ct.class_type_name, ct.color])
  )

  return (
    <div className="flex flex-col gap-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {(['this_month', 'last_month', 'custom'] as PeriodKey[]).map((key) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            className={[
              'px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors',
              period === key
                ? 'bg-cyan-500 text-white border-cyan-500'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50',
            ].join(' ')}
          >
            {key === 'this_month' ? 'This Month' : key === 'last_month' ? 'Last Month' : 'Custom'}
          </button>
        ))}

        {period === 'custom' && (
          <>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </>
        )}

        <select
          value={selectedClassType ?? ''}
          onChange={(e) => {
            setSelectedClassType(e.target.value ? Number(e.target.value) : undefined)
            setCalendarWeekOffset(0)
            setLogPage(1)
          }}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
        >
          <option value="">All Class Types</option>
          {classTypes.map((ct) => (
            <option key={ct.id} value={ct.id}>
              {ct.name}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : !report ? (
        <p className="text-gray-400 text-sm">Select a period to view attendance data</p>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatBox label="Classes" value={report.total_classes} />
            <StatBox label="With Attendance" value={report.classes_with_attendance} />
            <StatBox
              label="Avg Attendance"
              value={parseFloat(String(report.avg_attendance ?? 0)).toFixed(1)}
            />
            <StatBox label="Total Attendees" value={report.total_attendees} />
          </div>

          {/* Weekly calendar grid */}
          <Card padding={false}>
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Weekly Class Calendar</h3>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <button
                  onClick={() => setCalendarWeekOffset((w) => Math.max(0, w - 1))}
                  disabled={currentWeekIndex === 0}
                  className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-xs font-medium">
                  Week {currentWeekIndex + 1} of {totalWeeks}
                  {currentWeek &&
                    ` · ${format(currentWeek.weekStart, 'd MMM')} – ${format(addDays(currentWeek.weekStart, 6), 'd MMM yyyy')}`}
                </span>
                <button
                  onClick={() => setCalendarWeekOffset((w) => Math.min(totalWeeks - 1, w + 1))}
                  disabled={currentWeekIndex >= totalWeeks - 1}
                  className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Legend */}
            <div className="px-4 pt-3 pb-1 flex flex-wrap gap-3 text-xs text-gray-500">
              {[
                { label: 'No attendance yet', cls: 'bg-gray-100' },
                { label: 'Low (<5)', cls: 'bg-red-100' },
                { label: 'Moderate (5–14)', cls: 'bg-orange-100' },
                { label: 'Good (15–24)', cls: 'bg-yellow-100' },
                { label: 'Excellent (25+)', cls: 'bg-green-100' },
              ].map((item) => (
                <span key={item.label} className="flex items-center gap-1.5">
                  <span className={`inline-block w-3 h-3 rounded-sm ${item.cls}`} />
                  {item.label}
                </span>
              ))}
            </div>

            {currentWeek ? (
              <div className="overflow-x-auto">
                <div className="grid grid-cols-7 min-w-[700px]">
                  {WEEK_DAYS.map((day) => (
                    <div
                      key={day}
                      className="px-2 py-1.5 text-center text-xs font-semibold text-gray-500 border-b border-gray-100 bg-gray-50"
                    >
                      {day}
                    </div>
                  ))}
                  {currentWeek.days.map(({ date, events }) => (
                    <div
                      key={date.toISOString()}
                      className="border-r border-b border-gray-100 p-1.5 min-h-[80px] last:border-r-0"
                    >
                      <p className="text-xs text-gray-400 mb-1">{format(date, 'd')}</p>
                      <div className="flex flex-col gap-0.5">
                        {events.map((ev) => (
                          <div
                            key={ev.event_id}
                            className={`rounded px-1.5 py-0.5 text-xs truncate ${attendanceBg(ev.attendance_count)}`}
                            title={`${ev.class_name} · ${ev.time}${ev.attendance_count !== null ? ` · ${ev.attendance_count}` : ''}`}
                          >
                            <span
                              className="inline-block w-1.5 h-1.5 rounded-full mr-1"
                              style={{ backgroundColor: ev.color }}
                            />
                            {ev.class_name.length > 12
                              ? ev.class_name.slice(0, 12) + '…'
                              : ev.class_name}
                            {ev.attendance_count !== null && ` · ${ev.attendance_count}`}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-center text-sm text-gray-400 py-8">No data for this period</p>
            )}
          </Card>

          {/* Charts 2-column grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Avg Attendance by Class Type — horizontal bar */}
            {report.by_class_type.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Avg Attendance by Class Type
                </h3>
                <ResponsiveContainer width="100%" height={Math.max(200, report.by_class_type.length * 36)}>
                  <BarChart
                    layout="vertical"
                    data={report.by_class_type}
                    margin={{ top: 4, right: 24, bottom: 4, left: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="class_type_name"
                      width={110}
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 12 }}
                      formatter={(v: number) => [v.toFixed(1), 'Avg Attendance']}
                    />
                    <Bar dataKey="avg_attendance" radius={[0, 4, 4, 0]}>
                      {report.by_class_type.map((entry) => (
                        <Cell key={entry.class_type_id} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Avg Attendance by Time Slot */}
            {report.by_time_slot.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Avg Attendance by Time Slot
                </h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={report.by_time_slot} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis
                      dataKey="slot"
                      tick={{ fontSize: 10, fill: '#6b7280' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      axisLine={false}
                      tickLine={false}
                      width={32}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 12 }}
                      formatter={(v: number) => [v.toFixed(1), 'Avg Attendance']}
                    />
                    <Bar dataKey="avg_attendance" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Weekly Attendance Trend */}
            {report.weekly_trend.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Weekly Attendance Trend
                </h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart
                    data={report.weekly_trend}
                    margin={{ top: 4, right: 16, bottom: 4, left: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis
                      dataKey="week_start"
                      tick={{ fontSize: 10, fill: '#6b7280' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => format(parseISO(v), 'd MMM')}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      axisLine={false}
                      tickLine={false}
                      width={32}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 12 }}
                      labelFormatter={(v) => format(parseISO(String(v)), 'd MMM yyyy')}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="avg_attendance"
                      stroke="#06b6d4"
                      strokeWidth={2}
                      dot={false}
                      name="Avg Attendance"
                    />
                    <Line
                      type="monotone"
                      dataKey="total_classes"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      dot={false}
                      name="Total Classes"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Avg Attendance by Day of Week */}
            {report.by_day_of_week.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Average Attendance by Day of Week
                </h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={report.by_day_of_week}
                    margin={{ top: 4, right: 16, bottom: 4, left: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      axisLine={false}
                      tickLine={false}
                      width={32}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 12 }}
                      formatter={(v: number) => [v.toFixed(1), 'Avg Attendance']}
                    />
                    <Bar dataKey="avg_attendance" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Attendance Trend by Class Type — full width */}
          {trendLines.length > 0 && trendData.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Attendance Trend by Class Type
              </h3>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={trendData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis
                    dataKey="week_start"
                    tick={{ fontSize: 10, fill: '#6b7280' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => format(parseISO(v), 'd MMM')}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    axisLine={false}
                    tickLine={false}
                    width={32}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 12 }}
                    labelFormatter={(v) => format(parseISO(String(v)), 'd MMM yyyy')}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {trendLines.map((name) => (
                    <Line
                      key={name}
                      type="monotone"
                      dataKey={name}
                      stroke={classTypeColorMap[name] ?? '#94a3b8'}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Class Log */}
          <Card padding={false}>
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">
                Class Log
                <span className="ml-2 text-xs font-normal text-gray-400">
                  ({logRows.length} classes)
                </span>
              </h3>
              <button
                onClick={() => exportCsv(logRows)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 font-medium">
                    <th className="px-4 py-2 text-left">Class</th>
                    <th className="px-4 py-2 text-left">Instructor</th>
                    <th className="px-4 py-2 text-left">Location</th>
                    <th className="px-4 py-2 text-left">Date / Time</th>
                    <th className="px-4 py-2 text-right">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleLog.map((row) => (
                    <tr key={row.event_id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium text-gray-900 flex items-center gap-2">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: row.color }}
                        />
                        {row.class_name}
                      </td>
                      <td className="px-4 py-2 text-gray-600">{row.instructor_name ?? '—'}</td>
                      <td className="px-4 py-2 text-gray-600">{row.site_name ?? '—'}</td>
                      <td className="px-4 py-2 text-gray-600 whitespace-nowrap">
                        {row.date} · {row.time}
                      </td>
                      <td className="px-4 py-2 text-right font-semibold text-gray-900">
                        {row.attendance_count}
                      </td>
                    </tr>
                  ))}
                  {logRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                        No attendance records in this period
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {visibleLog.length < logRows.length && (
              <div className="px-4 py-3 text-center border-t border-gray-100">
                <button
                  onClick={() => setLogPage((p) => p + 1)}
                  className="text-sm text-cyan-600 hover:text-cyan-700 font-medium"
                >
                  Load more ({logRows.length - visibleLog.length} remaining)
                </button>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
