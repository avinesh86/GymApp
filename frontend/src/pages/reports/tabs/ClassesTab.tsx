import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { getClassesReport } from '../../../api/reports'
import { Table } from '../../../components/ui/Table'
import { PageSpinner } from '../../../components/ui/Spinner'
import type { ClassesReport } from '../../../types'

type PeriodKey = 'this_month' | 'last_month' | 'custom'

export function ClassesTab() {
  const [period, setPeriod] = useState<PeriodKey>('this_month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

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

  const { data: classes = [], isLoading } = useQuery({
    queryKey: ['reports', 'classes', dateRange.from, dateRange.to],
    queryFn: () => getClassesReport(dateRange.from, dateRange.to),
    enabled: !!(dateRange.from && dateRange.to),
  })

  const columns = [
    {
      key: 'class_type_name',
      header: 'Class Type',
      render: (row: ClassesReport) => (
        <span className="flex items-center gap-2 font-medium text-gray-900">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: row.color }}
          />
          {row.class_type_name}
        </span>
      ),
    },
    {
      key: 'total_classes',
      header: 'Total Classes',
      render: (row: ClassesReport) => (
        <span className="text-gray-700">{row.total_classes}</span>
      ),
    },
    {
      key: 'avg_attendance',
      header: 'Avg Attendance',
      render: (row: ClassesReport) => (
        <span className="text-gray-700">{parseFloat(String(row.avg_attendance ?? 0)).toFixed(1)}</span>
      ),
    },
    {
      key: 'viability_percentage',
      header: 'Viability %',
      render: (row: ClassesReport) => {
        const pct = parseFloat(String(row.viability_percentage ?? 0))
        return (
          <span
            className={[
              'font-semibold',
              pct >= 80 ? 'text-green-600' : pct >= 60 ? 'text-yellow-600' : 'text-red-600',
            ].join(' ')}
          >
            {pct.toFixed(0)}%
          </span>
        )
      },
    },
    {
      key: 'cancellation_percentage',
      header: 'Cancellation %',
      render: (row: ClassesReport) => {
        const pct = parseFloat(String(row.cancellation_percentage ?? 0))
        return (
          <span
            className={[
              'font-semibold',
              pct < 5 ? 'text-green-600' : pct < 15 ? 'text-yellow-600' : 'text-red-600',
            ].join(' ')}
          >
            {pct.toFixed(0)}%
          </span>
        )
      },
    },
  ]

  if (isLoading) return <PageSpinner />

  return (
    <div className="flex flex-col gap-4">
      {/* Period filters */}
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
      </div>

      {/* Avg attendance bar chart */}
      {classes.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Avg Attendance by Class Type
          </h3>
          <ResponsiveContainer width="100%" height={Math.max(200, classes.length * 36)}>
            <BarChart
              layout="vertical"
              data={classes}
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
                width={120}
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 12 }}
                formatter={(v: number) => [v.toFixed(1), 'Avg Attendance']}
              />
              <Bar dataKey="avg_attendance" radius={[0, 4, 4, 0]}>
                {classes.map((entry) => (
                  <Cell key={entry.class_type_id} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <Table
          columns={columns}
          data={classes}
          keyExtractor={(row) => row.class_type_id}
          emptyMessage="No class data available"
        />
      </div>
    </div>
  )
}
