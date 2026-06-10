import React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'
import { getClassViabilityReport } from '../../../api/reports'
import { PageSpinner } from '../../../components/ui/Spinner'
import type { ClassViabilityRow, ViabilitySnapshot } from '../../../types'

const SEGMENT_CONFIG = [
  { key: 'red_count',    label: 'Red',    color: '#ef4444' },
  { key: 'amber_count',  label: 'Amber',  color: '#f59e0b' },
  { key: 'green_count',  label: 'Green',  color: '#22c55e' },
  { key: 'purple_count', label: 'Purple', color: '#a855f7' },
] as const

const SNAPSHOT_CONFIG = [
  { key: 'excellent', label: 'Excellent', color: '#a855f7' },
  { key: 'good',      label: 'Good',      color: '#22c55e' },
  { key: 'moderate',  label: 'Moderate',  color: '#f59e0b' },
  { key: 'low',       label: 'Low',       color: '#ef4444' },
  { key: 'pending',   label: 'Pending',   color: '#cbd5e1' },
] as const

function buildPieData(row: ClassViabilityRow) {
  return SEGMENT_CONFIG.map((segment) => ({
    name: segment.label,
    value: row[segment.key],
    color: segment.color,
  })).filter((slice) => slice.value > 0)
}

function OverallSnapshot({ snapshot }: { snapshot: ViabilitySnapshot }) {
  const total = SNAPSHOT_CONFIG.reduce((sum, s) => sum + (snapshot[s.key] || 0), 0)
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Overall Class Viability Snapshot</h3>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100" data-testid="snapshot-bar">
        {total > 0 &&
          SNAPSHOT_CONFIG.map((s) =>
            snapshot[s.key] > 0 ? (
              <div
                key={s.key}
                style={{ width: `${(snapshot[s.key] / total) * 100}%`, backgroundColor: s.color }}
              />
            ) : null,
          )}
      </div>
      <div className="flex flex-wrap gap-4 mt-3">
        {SNAPSHOT_CONFIG.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
            <span className="font-semibold text-gray-900">{snapshot[s.key]}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

export function ViabilityTab() {
  const { data: report, isLoading } = useQuery({
    queryKey: ['reports', 'viability'],
    queryFn: () => getClassViabilityReport(),
  })

  if (isLoading) return <PageSpinner />

  const rows = report?.by_class_type ?? []
  const snapshot = report?.overall_snapshot
  const trend = report?.viability_trend ?? []

  return (
    <div className="flex flex-col gap-4">
      {snapshot && <OverallSnapshot snapshot={snapshot} />}

      {/* Viability trend */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Viability Trend</h3>
        {trend.length > 0 ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trend} margin={{ top: 4, right: 24, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="week_start" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={36} />
              <Tooltip
                contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 12 }}
                formatter={(v: number) => [`${v.toFixed(0)}%`, 'Viability']}
              />
              <Line type="monotone" dataKey="viability_percentage" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-center text-sm text-gray-400 py-8">No viability trend data</p>
        )}
      </div>

      {/* Per-class grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rows.map((row: ClassViabilityRow) => {
          const pieData = buildPieData(row)
          const viabilityPct = parseFloat(String(row.viability_percentage ?? 0))

          return (
            <div key={row.class_type_id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900">{row.class_type_name}</h3>
                <span
                  className={[
                    'text-sm font-bold',
                    viabilityPct >= 80 ? 'text-green-600' : viabilityPct >= 60 ? 'text-yellow-600' : 'text-red-600',
                  ].join(' ')}
                >
                  {viabilityPct.toFixed(0)}% viable
                </span>
              </div>

              <div className="flex items-center gap-4">
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
                      {(pieData.length > 0 ? pieData : [{ name: 'No data', value: 1, color: '#e5e7eb' }]).map((slice, index) => (
                        <Cell key={index} fill={slice.color} />
                      ))}
                    </Pie>
                    {pieData.length > 0 && (
                      <Tooltip
                        contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 12 }}
                        formatter={(value: number, name: string) => [value, name]}
                      />
                    )}
                  </PieChart>
                </div>

                <div className="flex flex-col gap-1.5 flex-1">
                  {SEGMENT_CONFIG.map((segment) => (
                    <div key={segment.key} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-gray-600">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: segment.color }} />
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

        {rows.length === 0 && (
          <p className="text-gray-400 text-sm col-span-2 text-center py-12">No viability data available</p>
        )}
      </div>
    </div>
  )
}
