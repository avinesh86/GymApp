import React from 'react'
import { useQuery } from '@tanstack/react-query'
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
import { Table } from '../../../components/ui/Table'
import { Card } from '../../../components/ui/Card'
import { PageSpinner } from '../../../components/ui/Spinner'
import type { InstructorPayrollSummary } from '../../../types'

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-4">
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}

export function FinancialTab() {
  const { data: report, isLoading } = useQuery({
    queryKey: ['reports', 'payroll'],
    queryFn: () => getPayrollReport(),
  })

  const columns = [
    {
      key: 'instructor_name',
      header: 'Instructor',
      render: (row: InstructorPayrollSummary) => (
        <span className="font-medium text-gray-900">{row.instructor_name}</span>
      ),
    },
    {
      key: 'invoice_count',
      header: 'Invoices',
      render: (row: InstructorPayrollSummary) => (
        <span className="text-gray-700">{row.invoice_count}</span>
      ),
    },
    {
      key: 'total_amount',
      header: 'Total Amount',
      render: (row: InstructorPayrollSummary) => (
        <span className="font-semibold text-gray-900">${row.total_amount}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: InstructorPayrollSummary) => (
        <span className="text-gray-600 capitalize">{row.status}</span>
      ),
    },
  ]

  if (isLoading) return <PageSpinner />
  if (!report) return <p className="text-gray-400 text-sm">No financial data available</p>

  return (
    <div className="flex flex-col gap-6">
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
              <Tooltip
                formatter={(value: number) => [`$${value}`, 'Amount']}
                contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
              />
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
    </div>
  )
}
