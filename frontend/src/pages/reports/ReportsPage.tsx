import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { getPayrollReport, getClassViabilityReport, getAttendanceReport } from '../../api/reports'
import { AttendanceTab } from './tabs/AttendanceTab'
import { ClassesTab } from './tabs/ClassesTab'
import { InstructorsTab } from './tabs/InstructorsTab'
import { FinancialTab } from './tabs/FinancialTab'
import { ViabilityTab } from './tabs/ViabilityTab'
import { AIInsightsTab } from './tabs/AIInsightsTab'
import { PageHeader } from '../../components/shared/PageHeader'

type TabKey = 'attendance' | 'classes' | 'instructors' | 'financial' | 'viability' | 'ai_insights'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'attendance',  label: 'Attendance' },
  { key: 'classes',     label: 'Classes' },
  { key: 'instructors', label: 'Instructors' },
  { key: 'financial',   label: 'Financial' },
  { key: 'viability',   label: 'Viability' },
  { key: 'ai_insights', label: 'AI Insights' },
]

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-3">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-lg font-bold text-gray-900 mt-0.5">{value}</p>
    </div>
  )
}

export function ReportsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('attendance')

  const now = new Date()
  const thisMonthFrom = format(startOfMonth(now), 'yyyy-MM-dd')
  const thisMonthTo = format(endOfMonth(now), 'yyyy-MM-dd')

  const { data: payroll } = useQuery({
    queryKey: ['reports', 'payroll'],
    queryFn: () => getPayrollReport(),
  })

  const { data: viability = [] } = useQuery({
    queryKey: ['reports', 'viability'],
    queryFn: () => getClassViabilityReport(),
  })

  const { data: attendanceSummary } = useQuery({
    queryKey: ['reports', 'attendance', thisMonthFrom, thisMonthTo, undefined],
    queryFn: () => getAttendanceReport(thisMonthFrom, thisMonthTo),
  })

  const goodViabilityCount = viability.filter(
    (v) => parseFloat(String(v.viability_percentage ?? 0)) >= 60
  ).length

  const tabComponents: Record<TabKey, React.ReactNode> = {
    attendance:  <AttendanceTab />,
    classes:     <ClassesTab />,
    instructors: <InstructorsTab />,
    financial:   <FinancialTab />,
    viability:   <ViabilityTab />,
    ai_insights: <AIInsightsTab />,
  }

  return (
    <div>
      <PageHeader title="Reports" />

      {/* Stats summary row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <SummaryCard
          label="Classes This Month"
          value={attendanceSummary?.total_classes ?? '—'}
        />
        <SummaryCard
          label="Avg Attendance"
          value={
            attendanceSummary
              ? parseFloat(String(attendanceSummary.avg_attendance ?? 0)).toFixed(1)
              : '—'
          }
        />
        <SummaryCard
          label="Total Payroll"
          value={payroll?.total_payroll ? `$${payroll.total_payroll}` : '—'}
        />
        <SummaryCard
          label="Good Viability"
          value={`${goodViabilityCount}/${viability.length}`}
        />
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={[
              'px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px',
              activeTab === tab.key
                ? 'border-cyan-500 text-cyan-600'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tabComponents[activeTab]}
    </div>
  )
}
