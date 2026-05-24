import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { PieChart, Pie, Cell, Tooltip } from 'recharts'
import { getClassViabilityReport } from '../../../api/reports'
import { PageSpinner } from '../../../components/ui/Spinner'
import type { ClassViabilityReport } from '../../../types'

const SEGMENT_CONFIG = [
  { key: 'red_count',    label: 'Red',    color: '#ef4444' },
  { key: 'amber_count',  label: 'Amber',  color: '#f59e0b' },
  { key: 'green_count',  label: 'Green',  color: '#22c55e' },
  { key: 'purple_count', label: 'Purple', color: '#a855f7' },
] as const

function buildPieData(row: ClassViabilityReport) {
  return SEGMENT_CONFIG.map((segment) => ({
    name: segment.label,
    value: row[segment.key],
    color: segment.color,
  })).filter((slice) => slice.value > 0)
}

export function ViabilityTab() {
  const { data: viability = [], isLoading } = useQuery({
    queryKey: ['reports', 'viability'],
    queryFn: () => getClassViabilityReport(),
  })

  if (isLoading) return <PageSpinner />

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {viability.map((row: ClassViabilityReport) => {
        const pieData = buildPieData(row)
        const viabilityPct = parseFloat(String(row.viability_percentage ?? 0))

        return (
          <div key={row.class_type_id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">{row.class_type_name}</h3>
              <span
                className={[
                  'text-sm font-bold',
                  viabilityPct >= 80
                    ? 'text-green-600'
                    : viabilityPct >= 60
                    ? 'text-yellow-600'
                    : 'text-red-600',
                ].join(' ')}
              >
                {viabilityPct.toFixed(0)}% viable
              </span>
            </div>

            <div className="flex items-center gap-4">
              {/* Pie chart */}
              <div className="shrink-0">
                <PieChart width={120} height={120}>
                  <Pie
                    data={pieData.length > 0 ? pieData : [{ name: 'No data', value: 1, color: '#e5e7eb' }]}
                    cx={60}
                    cy={60}
                    outerRadius={55}
                    dataKey="value"
                    strokeWidth={1}
                    stroke="#fff"
                  >
                    {(pieData.length > 0 ? pieData : [{ name: 'No data', value: 1, color: '#e5e7eb' }]).map(
                      (slice, index) => (
                        <Cell key={index} fill={slice.color} />
                      )
                    )}
                  </Pie>
                  {pieData.length > 0 && (
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 12 }}
                      formatter={(value: number, name: string) => [value, name]}
                    />
                  )}
                </PieChart>
              </div>

              {/* Stats */}
              <div className="flex flex-col gap-1.5 flex-1">
                {SEGMENT_CONFIG.map((segment) => (
                  <div key={segment.key} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-gray-600">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: segment.color }}
                      />
                      {segment.label}
                    </span>
                    <span className="font-medium text-gray-800">{row[segment.key]}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between mt-3 pt-3 border-t border-gray-50 text-xs text-gray-400">
              <span>{row.total_classes} classes total</span>
              <span>Avg: {parseFloat(String(row.avg_attendance ?? 0)).toFixed(1)} attendees</span>
            </div>
          </div>
        )
      })}

      {viability.length === 0 && (
        <p className="text-gray-400 text-sm col-span-2 text-center py-12">
          No viability data available
        </p>
      )}
    </div>
  )
}
