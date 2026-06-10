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
} from 'recharts'
import { getPayrollReport } from '../../../api/reports'
import { listStaff } from '../../../api/staff'
import { Table } from '../../../components/ui/Table'
import { Card } from '../../../components/ui/Card'
import { PageSpinner } from '../../../components/ui/Spinner'
import type { InstructorPayrollSummary } from '../../../types'

type PeriodKey = 'this_month' | 'last_month' | 'custom'

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-4">
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}

export function FinancialTab() {
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

  const { data: staffPage } = useQuery({
    queryKey: ['staff', { role: 'instructor', status: 'active' }],
    queryFn: () => listStaff({ role: 'instructor', status: 'active' }),
  })
  const instructorOptions = staffPage?.results ?? []

  const { data: report, isLoading } = useQuery({
    queryKey: ['reports', 'payroll', dateRange.from, dateRange.to, selectedInstructor],
    queryFn: () => getPayrollReport(dateRange.from, dateRange.to, selectedInstructor),
    enabled: !!(dateRange.from && dateRange.to),
  })

  const columns = [
    { key: 'instructor_name', header: 'Instructor', render: (row: InstructorPayrollSummary) => <span className="font-medium text-gray-900">{row.instructor_name}</span> },
    { key: 'invoice_count', header: 'Invoices', render: (row: InstructorPayrollSummary) => <span className="text-gray-700">{row.invoice_count}</span> },
    { key: 'total_amount', header: 'Total Amount', render: (row: InstructorPayrollSummary) => <span className="font-semibold text-gray-900">${row.total_amount}</span> },
    { key: 'status', header: 'Status', render: (row: InstructorPayrollSummary) => <span className="text-gray-600 capitalize">{row.status}</span> },
  ]

  return (
    <div className="flex flex-col gap-6">
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
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} aria-label="From date" className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-500" />
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} aria-label="To date" className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-500" />
          </>
        )}

        <select
          value={selectedInstructor ?? ''}
          onChange={(e) => setSelectedInstructor(e.target.value ? Number(e.target.value) : undefined)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 ml-auto"
          aria-label="Filter by instructor"
        >
          <option value="">All Instructors</option>
          {instructorOptions.map((s) => (
            <option key={s.id} value={s.id}>{s.name || `${s.first_name} ${s.last_name}`.trim()}</option>
          ))}
        </select>
      </div>

      {isLoading || !report ? (
        <PageSpinner />
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatBox label="Total Payroll" value={`$${report.total_payroll}`} />
            <StatBox label="Paid" value={`$${report.paid_amount}`} />
            <StatBox label="Pending" value={`$${report.pending_amount}`} />
            <StatBox label="Avg per Instructor" value={`$${report.avg_per_instructor}`} />
          </div>

          {/* Bar chart */}
          {report.period_breakdown.length > 0 && (
            <Card>
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Payroll by Period</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={report.period_breakdown}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="period" tick={{ fontSize: 12, fill: '#6b7280' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} />
                  <Tooltip formatter={(value: number) => [`$${value}`, 'Amount']} contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                  <Bar dataKey="amount" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <Table
              columns={columns}
              data={report.instructor_breakdown}
              keyExtractor={(row) => row.instructor_id}
              emptyMessage="No instructor payroll data"
            />
          </div>
        </>
      )}
    </div>
  )
}
