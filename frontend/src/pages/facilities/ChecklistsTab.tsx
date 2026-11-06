import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO, subDays } from 'date-fns'
import { Plus } from 'lucide-react'
import { listChecklistRuns, listChecklists, listMyChecks } from '../../api/facilities'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Table } from '../../components/ui/Table'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageSpinner } from '../../components/ui/Spinner'
import { useFacilitiesConfig } from '../../hooks/useFacilitiesConfig'
import { CheckModal } from './CheckModal'
import { ChecklistModal } from './ChecklistModal'
import { CHECKLIST_CATEGORY, RUN_STATUS, describeSchedule } from './labels'
import type { ChecklistRun, ChecklistTemplate } from '../../types'

type View = 'todo' | 'checklists' | 'history'

export function ChecklistsTab({ site }: { site: number | '' }) {
  const { data: config } = useFacilitiesConfig()
  const [view, setView] = useState<View>(config?.can_do_checklists ? 'todo' : 'history')
  const [openRun, setOpenRun] = useState<ChecklistRun | null>(null)
  const [editing, setEditing] = useState<ChecklistTemplate | null>(null)
  const [adding, setAdding] = useState(false)

  const views: { key: View; label: string }[] = [
    ...(config?.can_do_checklists ? [{ key: 'todo' as const, label: 'To do' }] : []),
    { key: 'checklists', label: 'Checklists' },
    { key: 'history', label: 'History' },
  ]

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5 w-fit" role="group" aria-label="Checklists view">
          {views.map((v) => (
            <button
              key={v.key}
              type="button"
              aria-pressed={view === v.key}
              onClick={() => setView(v.key)}
              className={`px-3 py-1.5 text-sm rounded-md ${view === v.key ? 'bg-cyan-500 text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >
              {v.label}
            </button>
          ))}
        </div>
        {config?.can_manage_checklists && (
          <Button className="sm:ml-auto" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
            Add checklist
          </Button>
        )}
      </div>

      {view === 'todo' && <ToDo onOpen={setOpenRun} />}
      {view === 'checklists' && <Templates site={site} onEdit={config?.can_manage_checklists ? setEditing : undefined} />}
      {view === 'history' && <History site={site} onOpen={setOpenRun} />}

      <CheckModal run={openRun} onClose={() => setOpenRun(null)} />
      <ChecklistModal
        template={editing}
        isOpen={adding || editing !== null}
        site={site}
        onClose={() => {
          setAdding(false)
          setEditing(null)
        }}
      />
    </div>
  )
}

function RunRow({ run, onOpen }: { run: ChecklistRun; onOpen: (r: ChecklistRun) => void }) {
  return (
    <li className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-gray-900">{run.template_name}</p>
          <Badge variant={RUN_STATUS[run.status].variant}>{RUN_STATUS[run.status].label}</Badge>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Due {format(parseISO(run.due_at), 'EEE d MMM, h:mma')}
          {run.site_name && ` · ${run.site_name}`} · {run.items.length} item{run.items.length !== 1 ? 's' : ''}
        </p>
      </div>
      <Button size="sm" onClick={() => onOpen(run)} aria-label={`Start: ${run.template_name}`}>
        Start check
      </Button>
    </li>
  )
}

function ToDo({ onOpen }: { onOpen: (r: ChecklistRun) => void }) {
  const { data: runs = [], isLoading } = useQuery({ queryKey: ['facilities', 'my-checks'], queryFn: listMyChecks })
  if (isLoading) return <PageSpinner />
  if (runs.length === 0) return <EmptyState title="Nothing to check right now" description="All your checks are done." />
  return (
    <ul className="flex flex-col gap-3" aria-label="Checks to do">
      {runs.map((run) => (
        <RunRow key={run.id} run={run} onOpen={onOpen} />
      ))}
    </ul>
  )
}

function Templates({ site, onEdit }: { site: number | ''; onEdit?: (t: ChecklistTemplate) => void }) {
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['facilities', 'checklists', site],
    queryFn: () => listChecklists({ site }),
  })
  if (isLoading) return <PageSpinner />
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <Table
        data={templates}
        keyExtractor={(t) => t.id}
        onRowClick={onEdit}
        emptyMessage="No checklists yet"
        columns={[
          { key: 'name', header: 'Checklist', render: (t) => <span className="font-medium text-gray-900">{t.name}</span> },
          { key: 'type', header: 'Type', render: (t) => CHECKLIST_CATEGORY[t.category] },
          { key: 'when', header: 'When', render: (t) => describeSchedule(t) },
          { key: 'where', header: 'Where', render: (t) => [t.equipment_name, t.site_name].filter(Boolean).join(' · ') || 'Whole gym' },
          { key: 'items', header: 'Items', render: (t) => t.items.length },
          {
            key: 'active',
            header: 'Status',
            render: (t) => (t.is_active ? <Badge variant="green">Active</Badge> : <Badge variant="grey">Paused</Badge>),
          },
        ]}
      />
    </div>
  )
}

function History({ site, onOpen }: { site: number | ''; onOpen: (r: ChecklistRun) => void }) {
  const from = format(subDays(new Date(), 30), 'yyyy-MM-dd')
  const { data: runs = [], isLoading } = useQuery({
    queryKey: ['facilities', 'checklist-history', site, from],
    queryFn: () => listChecklistRuns({ site, from }),
  })
  if (isLoading) return <PageSpinner />
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <p className="px-4 pt-3 text-xs text-gray-500">Last 30 days</p>
      <Table
        data={runs}
        keyExtractor={(r) => r.id}
        onRowClick={onOpen}
        emptyMessage="No checks in the last 30 days"
        columns={[
          { key: 'name', header: 'Check', render: (r) => <span className="font-medium text-gray-900">{r.template_name}</span> },
          { key: 'due', header: 'Due', render: (r) => format(parseISO(r.due_at), 'EEE d MMM, h:mma') },
          {
            key: 'status',
            header: 'Status',
            render: (r) => <Badge variant={RUN_STATUS[r.status].variant}>{RUN_STATUS[r.status].label}</Badge>,
          },
          { key: 'by', header: 'Done by', render: (r) => r.completed_by_name || '—' },
          {
            key: 'problems',
            header: 'Problems',
            render: (r) => (r.completed_at ? (r.failed_count ? <Badge variant="red">{r.failed_count}</Badge> : 'None') : '—'),
          },
        ]}
      />
    </div>
  )
}
