import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { ClipboardCheck } from 'lucide-react'
import { listMyChecks } from '../../api/facilities'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { useFacilitiesConfig } from '../../hooks/useFacilitiesConfig'
import { CheckModal } from './CheckModal'
import { RUN_STATUS } from './labels'
import type { ChecklistRun } from '../../types'

/** Checks due today (and any overdue) for people who do checklists. */
export function ChecksDueCard() {
  const navigate = useNavigate()
  const { data: config } = useFacilitiesConfig()
  const [openRun, setOpenRun] = useState<ChecklistRun | null>(null)
  const { data: runs = [] } = useQuery({
    queryKey: ['facilities', 'my-checks'],
    queryFn: listMyChecks,
    enabled: !!config?.can_do_checklists,
  })

  if (!config?.can_do_checklists) return null
  const overdue = runs.filter((r) => r.status === 'overdue').length

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-6" data-testid="checks-card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-900">Checks to do</h2>
          {runs.length > 0 && <Badge variant={overdue ? 'red' : 'blue'}>{runs.length}</Badge>}
        </div>
        <button onClick={() => navigate('/facilities')} className="text-xs text-cyan-600 hover:text-cyan-800">
          View Facilities &rsaquo;
        </button>
      </div>
      {runs.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">All checks done</p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {runs.slice(0, 5).map((run) => (
            <li key={run.id} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{run.template_name}</p>
                <p className="text-xs text-gray-500">
                  Due {format(parseISO(run.due_at), 'EEE d MMM, h:mma')}
                  {run.site_name && ` · ${run.site_name}`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={RUN_STATUS[run.status].variant}>{RUN_STATUS[run.status].label}</Badge>
                <Button size="sm" onClick={() => setOpenRun(run)} aria-label={`Start: ${run.template_name}`}>
                  Start
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <CheckModal run={openRun} onClose={() => setOpenRun(null)} />
    </div>
  )
}
