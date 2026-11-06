import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { ClipboardCheck, X } from 'lucide-react'
import { listMyChecks } from '../../api/facilities'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { useFacilitiesConfig } from '../../hooks/useFacilitiesConfig'
import { useAuth } from '../../hooks/useAuth'
import { usePermission } from '../../hooks/usePermission'
import { CheckModal } from './CheckModal'
import { RUN_STATUS } from './labels'
import type { ChecklistRun } from '../../types'

const CHECKLISTS_TAB = '/facilities?tab=checklists'

// Browser storage is only a convenience: it can be missing or throw (private
// windows, blocked site data), and then the prompt simply shows again.
function promptKey(tenantId: number, userId: number) {
  return `fitops.checklistSetupPrompt.dismissed.${tenantId}.${userId}`
}

function readDismissed(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function writeDismissed(key: string) {
  try {
    window.localStorage.setItem(key, '1')
  } catch {
    // Not stored: it's hidden for now and may show again next visit.
  }
}

/** Checks due today (and any overdue) for people who do checklists. Hidden
 * until one of the gym's checklists is this person's to do, so nobody is
 * told "All checks done" about checklists that don't exist or aren't theirs.
 * Before the gym has any checklist (paused ones count), the people who set
 * them up see a prompt to do so instead, until they dismiss it. */
export function ChecksDueCard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { can } = usePermission()
  const { data: config } = useFacilitiesConfig()
  const [openRun, setOpenRun] = useState<ChecklistRun | null>(null)
  const show = !!config?.can_do_checklists && !!config?.has_my_checklists
  const dismissKey = user ? promptKey(user.tenant_id, user.id) : ''
  // Read on every render so switching gym or person reads their own choice.
  const [justDismissed, setJustDismissed] = useState('')
  const dismissed = !!dismissKey && (justDismissed === dismissKey || readDismissed(dismissKey))
  const { data: runs = [], isLoading, isError } = useQuery({
    queryKey: ['facilities', 'my-checks'],
    queryFn: listMyChecks,
    enabled: show,
  })

  const showSetupPrompt =
    !!config?.checklists_enabled &&
    !config.has_any_checklists &&
    !!config.can_manage_checklists &&
    can('facilities') &&
    !!dismissKey &&
    !dismissed

  if (showSetupPrompt) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-6" data-testid="checks-setup-prompt">
        <div className="flex items-start gap-3 px-4 py-3">
          <ClipboardCheck className="h-4 w-4 text-gray-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-gray-900">Checks to do</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Set up opening, cleaning or safety checklists for your team.
            </p>
            <Button size="sm" className="mt-3" onClick={() => navigate(CHECKLISTS_TAB)}>
              Set up a checklist
            </Button>
          </div>
          <button
            type="button"
            aria-label="Dismiss checklist setup"
            onClick={() => {
              writeDismissed(dismissKey)
              setJustDismissed(dismissKey)
            }}
            className="-m-1 p-2 rounded-md text-gray-400 hover:text-gray-600 shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  if (!show) return null
  const overdue = runs.filter((r) => r.status === 'overdue').length

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-6" data-testid="checks-card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-900">Checks to do</h2>
          {runs.length > 0 && <Badge variant={overdue ? 'red' : 'blue'}>{runs.length}</Badge>}
        </div>
        <button onClick={() => navigate(CHECKLISTS_TAB)} className="py-2 px-1 text-xs text-cyan-600 hover:text-cyan-800">
          View all checks &rsaquo;
        </button>
      </div>
      {isLoading ? (
        <p className="py-6 text-center text-sm text-gray-400">Loading checks…</p>
      ) : isError ? (
        <p className="py-6 text-center text-sm text-red-600" role="alert">
          Couldn't load your checks. Refresh to try again.
        </p>
      ) : runs.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">Nothing due right now</p>
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
