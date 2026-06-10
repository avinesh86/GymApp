import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { Star } from 'lucide-react'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { getInstructorReliabilityReport, getInstructorCharts } from '../../../api/reports'
import { Table } from '../../../components/ui/Table'
import { PageSpinner } from '../../../components/ui/Spinner'
import type { InstructorReliabilityReport } from '../../../types'

type PeriodKey = 'this_month' | 'last_month' | 'custom'

function truncateName(name: string, maxLength: number): string {
  return name.length > maxLength ? name.slice(0, maxLength) + '…' : name
}

const axisTick = { fontSize: 11, fill: '#6b7280' }
const tooltipStyle = { borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 12 }

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
      {children}
    </div>
  )
}

export function InstructorsTab() {
  const [period, setPeriod] = useState<PeriodKey>('this_month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [selectedInstructor, setSelectedInstructor] = useState<number | undefined>(undefined)

  const now = new Date()

  const dateRange = (() => {
    if (period === 'this_month') {
      return { from: format(startOfMonth(now), 'yyyy-MM-dd'), to: format(endOfMonth(now), 'yyyy-MM-dd') }
    }
    if (period === 'last_month') {
      const last = subMonths(now, 1)
      return { from: format(startOfMonth(last), 'yyyy-MM-dd'), to: format(endOfMonth(last), 'yyyy-MM-dd') }
    }
    return { from: customFrom, to: customTo }
  })()

  const { data: instructors = [], isLoading } = useQuery({
    queryKey: ['reports', 'instructors', dateRange.from, dateRange.to],
    queryFn: () => getInstructorReliabilityReport(dateRange.from, dateRange.to),
    enabled: !!(dateRange.from && dateRange.to),
  })

  const { data: charts } = useQuery({
    queryKey: ['reports', 'instructor-charts', dateRange.from, dateRange.to, selectedInstructor],
    queryFn: () => getInstructorCharts(dateRange.from, dateRange.to, selectedInstructor),
    enabled: !!(dateRange.from && dateRange.to && selectedInstructor),
  })

  // "Filter by instructor" — narrows the table and the reliability chart.
  const visibleInstructors = selectedInstructor
    ? instructors.filter((i) => i.instructor_id === selectedInstructor)
    : instructors

  const reliabilityData = visibleInstructors.map((instructor) => ({
    name: truncateName(instructor.instructor_name, 12),
    reliability: parseFloat(String(instructor.reliability_score ?? 0)),
  }))

  const perClass = charts?.avg_attendance_per_class ?? []
  const trend = charts?.attendance_trend ?? []

  const columns = [
    { key: 'instructor_name', header: 'Instructor', render: (row: InstructorReliabilityReport) => <span className="font-medium text-gray-900">{row.instructor_name}</span> },
    { key: 'total_classes', header: 'Classes', render: (row: InstructorReliabilityReport) => <span className="text-gray-700">{row.total_classes}</span> },
    { key: 'avg_attendance', header: 'Avg Attendance', render: (row: InstructorReliabilityReport) => <span className="text-gray-700">{parseFloat(String(row.avg_attendance ?? 0)).toFixed(1)}</span> },
    {
      key: 'reliability_score',
      header: 'Reliability',
      render: (row: InstructorReliabilityReport) => {
        const score = parseFloat(String(row.reliability_score ?? 0))
        return (
          <span className="flex items-center gap-1.5">
            <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
            <span className={['font-semibold', score >= 90 ? 'text-green-600' : score >= 75 ? 'text-yellow-600' : 'text-red-600'].join(' ')}>{score.toFixed(0)}%</span>
          </span>
        )
      },
    },
    {
      key: 'cover_requests_count',
      header: 'Cover Requests',
      render: (row: InstructorReliabilityReport) => (
        <span className={['text-gray-700', row.cover_requests_count > 3 ? 'text-orange-600 font-semibold' : ''].join(' ')}>{row.cover_requests_count}</span>
      ),
    },
  ]

  if (isLoading) return <PageSpinner />

  return (
    <div className="flex flex-col gap-4">
      {/* Period + instructor filters */}
      <div className="flex flex-wrap items-center gap-2">
        {(['this_month', 'last_month', 'custom'] as PeriodKey[]).map((key) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            className={[
              'px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors',
              period === key ? 'bg-cyan-500 text-white border-cyan-500' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50',
            ].join(' ')}
          >
            {key === 'this_month' ? 'This Month' : key === 'last_month' ? 'Last Month' : 'Custom'}
          </button>
        ))}

        {period === 'custom' && (
          <>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-500" />
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-500" />
          </>
        )}

        <select
          value={selectedInstructor ?? ''}
          onChange={(e) => setSelectedInstructor(e.target.value ? Number(e.target.value) : undefined)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 ml-auto"
          aria-label="Filter by instructor"
        >
          <option value="">All Instructors</option>
          {instructors.map((i) => (
            <option key={i.instructor_id} value={i.instructor_id}>{i.instructor_name}</option>
          ))}
        </select>
      </div>

      {/* Reliability score bar chart */}
      {reliabilityData.length > 0 && (
        <ChartCard title="Reliability Scores">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={reliabilityData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={axisTick} axisLine={false} tickLine={false} width={32} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [`${value.toFixed(0)}%`, 'Reliability']} />
              <Bar dataKey="reliability" fill="#06b6d4" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Per-instructor charts (shown once an instructor is selected) */}
      {selectedInstructor && (
        <>
          <ChartCard title="Average Attendance per Class">
            {perClass.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(200, perClass.length * 36)}>
                <BarChart layout="vertical" data={perClass} margin={{ top: 4, right: 24, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                  <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="class_type_name" width={120} tick={axisTick} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v.toFixed(1), 'Avg Attendance']} />
                  <Bar dataKey="avg_attendance" radius={[0, 4, 4, 0]}>
                    {perClass.map((entry, idx) => <Cell key={idx} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-sm text-gray-400 py-8">No attendance recorded for this instructor</p>
            )}
          </ChartCard>

          <ChartCard title="Attendance Trend">
            {trend.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={trend} margin={{ top: 4, right: 24, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="week_start" tick={axisTick} axisLine={false} tickLine={false} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v.toFixed(1), 'Avg Attendance']} />
                  <Line type="monotone" dataKey="avg_attendance" stroke="#06b6d4" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-sm text-gray-400 py-8">No attendance recorded for this instructor</p>
            )}
          </ChartCard>
        </>
      )}

      {/* Instructor table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <Table
          columns={columns}
          data={visibleInstructors}
          keyExtractor={(row) => row.instructor_id}
          emptyMessage="No instructor data available"
        />
      </div>
    </div>
  )
}
