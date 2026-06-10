import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { getClassesReport, getClassTypes } from '../../../api/reports'
import { Table } from '../../../components/ui/Table'
import { PageSpinner } from '../../../components/ui/Spinner'
import type { ClassReportRow } from '../../../types'

type PeriodKey = 'this_month' | 'last_month' | 'custom'

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
      {children}
    </div>
  )
}

const axisTick = { fontSize: 11, fill: '#6b7280' }
const tooltipStyle = { borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 12 }

export function ClassesTab() {
  const [period, setPeriod] = useState<PeriodKey>('this_month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [selectedClassType, setSelectedClassType] = useState<number | undefined>(undefined)

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

  const { data: classTypes = [] } = useQuery({
    queryKey: ['class-types'],
    queryFn: getClassTypes,
  })

  const { data: report, isLoading } = useQuery({
    queryKey: ['reports', 'classes', dateRange.from, dateRange.to, selectedClassType],
    queryFn: () => getClassesReport(dateRange.from, dateRange.to, selectedClassType),
    enabled: !!(dateRange.from && dateRange.to),
  })

  const rows = report?.by_class_type ?? []
  const trend = report?.attendance_trend ?? []
  const byDay = report?.by_day_of_week ?? []

  const columns = [
    {
      key: 'class_type_name',
      header: 'Class Type',
      render: (row: ClassReportRow) => (
        <span className="flex items-center gap-2 font-medium text-gray-900">
          <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} />
          {row.class_type_name}
        </span>
      ),
    },
    { key: 'total_classes', header: 'Total Classes', render: (row: ClassReportRow) => <span className="text-gray-700">{row.total_classes}</span> },
    { key: 'avg_attendance', header: 'Avg Attendance', render: (row: ClassReportRow) => <span className="text-gray-700">{parseFloat(String(row.avg_attendance ?? 0)).toFixed(1)}</span> },
    { key: 'capacity', header: 'Avg Capacity', render: (row: ClassReportRow) => <span className="text-gray-700">{parseFloat(String(row.capacity ?? 0)).toFixed(1)}</span> },
    {
      key: 'viability_percentage',
      header: 'Viability %',
      render: (row: ClassReportRow) => {
        const pct = parseFloat(String(row.viability_percentage ?? 0))
        return <span className={['font-semibold', pct >= 80 ? 'text-green-600' : pct >= 60 ? 'text-yellow-600' : 'text-red-600'].join(' ')}>{pct.toFixed(0)}%</span>
      },
    },
    {
      key: 'cancellation_percentage',
      header: 'Cancellation %',
      render: (row: ClassReportRow) => {
        const pct = parseFloat(String(row.cancellation_percentage ?? 0))
        return <span className={['font-semibold', pct < 5 ? 'text-green-600' : pct < 15 ? 'text-yellow-600' : 'text-red-600'].join(' ')}>{pct.toFixed(0)}%</span>
      },
    },
  ]

  if (isLoading) return <PageSpinner />

  return (
    <div className="flex flex-col gap-4">
      {/* Period + class-type filters */}
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
          value={selectedClassType ?? ''}
          onChange={(e) => setSelectedClassType(e.target.value ? Number(e.target.value) : undefined)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 ml-auto"
          aria-label="Filter by class type"
        >
          <option value="">All Class Types</option>
          {classTypes.map((ct) => (
            <option key={ct.id} value={ct.id}>{ct.name}</option>
          ))}
        </select>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">
          No class data available
        </div>
      ) : (
        <>
          {/* Avg attendance by class type */}
          <ChartCard title="Avg Attendance by Class Type">
            <ResponsiveContainer width="100%" height={Math.max(200, rows.length * 36)}>
              <BarChart layout="vertical" data={rows} margin={{ top: 4, right: 24, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="class_type_name" width={120} tick={axisTick} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v.toFixed(1), 'Avg Attendance']} />
                <Bar dataKey="avg_attendance" radius={[0, 4, 4, 0]}>
                  {rows.map((entry) => <Cell key={entry.class_type_id} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Attendance trend */}
          <ChartCard title="Attendance Trend">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trend} margin={{ top: 4, right: 24, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="week_start" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v.toFixed(1), 'Avg Attendance']} />
                <Line type="monotone" dataKey="avg_attendance" stroke="#06b6d4" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Average attendance by day of week */}
          <ChartCard title="Average Attendance by Day of Week">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byDay} margin={{ top: 4, right: 24, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="day" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v.toFixed(1), 'Avg Attendance']} />
                <Bar dataKey="avg_attendance" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Class type vs Capacity */}
          <ChartCard title="Attendance vs Capacity">
            <ResponsiveContainer width="100%" height={Math.max(240, rows.length * 44)}>
              <BarChart layout="vertical" data={rows} margin={{ top: 4, right: 24, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="class_type_name" width={120} tick={axisTick} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar name="Avg Attendance" dataKey="avg_attendance" fill="#06b6d4" radius={[0, 4, 4, 0]} />
                <Bar name="Avg Capacity" dataKey="capacity" fill="#cbd5e1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Average attendance vs Target */}
          <ChartCard title="Average Attendance vs Target">
            <ResponsiveContainer width="100%" height={Math.max(240, rows.length * 44)}>
              <BarChart layout="vertical" data={rows} margin={{ top: 4, right: 24, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="class_type_name" width={120} tick={axisTick} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar name="Avg Attendance" dataKey="avg_attendance" fill="#10b981" radius={[0, 4, 4, 0]} />
                <Bar name="Target" dataKey="target" fill="#f59e0b" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <Table columns={columns} data={rows} keyExtractor={(row) => row.class_type_id} emptyMessage="No class data available" />
          </div>
        </>
      )}
    </div>
  )
}
