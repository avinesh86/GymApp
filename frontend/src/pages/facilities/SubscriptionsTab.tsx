import React, { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import { Plus } from 'lucide-react'
import {
  attachSubscriptionDocument,
  deleteSubscription,
  getSubscriptionTotals,
  listSubscriptions,
  removeSubscriptionDocument,
  saveSubscription,
  type SubscriptionInput,
} from '../../api/facilities'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Modal } from '../../components/ui/Modal'
import { Table } from '../../components/ui/Table'
import { PageSpinner } from '../../components/ui/Spinner'
import { useFacilitiesConfig } from '../../hooks/useFacilitiesConfig'
import { DocumentField, PersonSelect, ReminderDaysInput } from './RecordFields'
import { BILLING_CYCLE, SUBSCRIPTION_CATEGORY, SUBSCRIPTION_STATUS, options } from './labels'
import type { BillingCycle, Subscription } from '../../types'

const day = (iso: string | null) => (iso ? format(parseISO(iso), 'd MMM yyyy') : '—')

/** Unless chosen, reminders suit the cycle (as the server does). */
const DEFAULT_REMINDERS: Record<BillingCycle, number[]> = { monthly: [], quarterly: [14], yearly: [30, 7] }

export function SubscriptionsTab({ site }: { site: number | '' }) {
  const { data: config } = useFacilitiesConfig()
  const [editing, setEditing] = useState<Subscription | 'new' | null>(null)
  const { data: subs = [], isLoading } = useQuery({
    queryKey: ['facilities', 'subscriptions', site],
    queryFn: () => listSubscriptions({ site }),
  })
  const { data: totals } = useQuery({
    queryKey: ['facilities', 'subscriptions', 'totals', site],
    queryFn: () => getSubscriptionTotals({ site }),
  })

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        {totals && (
          <div className="flex gap-3" data-testid="subscription-totals">
            <div className="rounded-xl border border-gray-100 bg-white px-4 py-2 shadow-sm">
              <p className="text-xs text-gray-500">Per month</p>
              <p className="text-lg font-semibold text-gray-900">${totals.per_month}</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-white px-4 py-2 shadow-sm">
              <p className="text-xs text-gray-500">Per year</p>
              <p className="text-lg font-semibold text-gray-900">${totals.per_year}</p>
            </div>
            <p className="self-end text-xs text-gray-500 pb-1">
              {totals.count} active subscription{totals.count !== 1 ? 's' : ''}
            </p>
          </div>
        )}
        {config?.can_manage_records && (
          <Button className="sm:ml-auto" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
            Add subscription
          </Button>
        )}
      </div>
      {isLoading ? (
        <PageSpinner />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <Table
            data={subs}
            keyExtractor={(s) => s.id}
            onRowClick={setEditing}
            emptyMessage="No subscriptions recorded yet"
            columns={[
              {
                key: 'name',
                header: 'Subscription',
                render: (s) => (
                  <span>
                    <span className="font-medium text-gray-900">{s.name}</span>
                    {s.provider && <span className="text-gray-500"> · {s.provider}</span>}
                  </span>
                ),
              },
              { key: 'category', header: 'Type', render: (s) => SUBSCRIPTION_CATEGORY[s.category] },
              {
                key: 'cost',
                header: 'Cost',
                render: (s) => (s.cost ? `$${s.cost} ${BILLING_CYCLE[s.billing_cycle].toLowerCase()}` : '—'),
              },
              {
                key: 'renews',
                header: 'Renews',
                render: (s) => (
                  <span>
                    {day(s.next_renewal)}
                    {s.notice_days > 0 && s.act_by && (
                      <span className="block text-xs text-gray-500">Notice by {day(s.act_by)}</span>
                    )}
                  </span>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                render: (s) => (
                  <Badge variant={SUBSCRIPTION_STATUS[s.status].variant}>{SUBSCRIPTION_STATUS[s.status].label}</Badge>
                ),
              },
              { key: 'who', header: 'Responsible', render: (s) => s.responsible_name || '—' },
            ]}
          />
        </div>
      )}
      <SubscriptionModal
        sub={editing === 'new' ? null : editing}
        isOpen={editing !== null}
        site={site}
        readOnly={!config?.can_manage_records}
        onClose={() => setEditing(null)}
      />
    </div>
  )
}

const BLANK: SubscriptionInput = {
  name: '',
  provider: '',
  category: 'software',
  cost: null,
  billing_cycle: 'monthly',
  next_renewal: null,
  auto_renew: true,
  notice_days: 0,
  responsible: null,
  notes: '',
  is_active: true,
  reminder_days: DEFAULT_REMINDERS.monthly,
}

function SubscriptionModal({
  sub,
  isOpen,
  site,
  readOnly,
  onClose,
}: {
  sub: Subscription | null
  isOpen: boolean
  site: number | ''
  readOnly: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { data: config } = useFacilitiesConfig()
  const [form, setForm] = useState<SubscriptionInput>(BLANK)
  const [file, setFile] = useState<File | null>(null)
  // A new subscription's reminders follow the cycle until someone edits them.
  const [remindersTouched, setRemindersTouched] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setForm(sub ? { ...sub } : { ...BLANK, site: site || null })
    setFile(null)
    setRemindersTouched(!!sub)
  }, [isOpen, sub, site])

  const set = <K extends keyof SubscriptionInput>(key: K, value: SubscriptionInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['facilities', 'subscriptions'] })

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        site: form.site ?? null,
        name: form.name,
        provider: form.provider,
        category: form.category,
        cost: form.cost === '' ? null : form.cost ?? null,
        billing_cycle: form.billing_cycle,
        next_renewal: form.next_renewal || null,
        auto_renew: form.auto_renew,
        notice_days: Number(form.notice_days) || 0,
        responsible: form.responsible ?? null,
        notes: form.notes,
        is_active: form.is_active,
        reminder_days: form.reminder_days,
      }
      const saved = await saveSubscription(sub?.id, payload)
      if (file) await attachSubscriptionDocument(saved.id, file)
      return saved
    },
    onSuccess: () => {
      toast.success(sub ? 'Subscription saved' : 'Subscription added')
      refresh()
      onClose()
    },
    onError: () => toast.error('Could not save the subscription. Check the details.'),
  })
  const remove = useMutation({
    mutationFn: () => deleteSubscription(sub!.id),
    onSuccess: () => {
      toast.success('Subscription removed')
      refresh()
      onClose()
    },
    onError: () => toast.error('Could not remove the subscription'),
  })
  const dropDocument = useMutation({
    mutationFn: () => removeSubscriptionDocument(sub!.id),
    onSuccess: (updated) => {
      setForm((f) => ({ ...f, ...updated }))
      refresh()
      toast.success('Document removed')
    },
  })

  const sites = config?.sites ?? []

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={sub ? sub.name : 'Add subscription'}
      size="xl"
      footer={
        readOnly ? (
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>Close</Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {sub && (
              <Button variant="danger" onClick={() => remove.mutate()} isLoading={remove.isPending}>
                Remove
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button onClick={() => save.mutate()} isLoading={save.isPending} disabled={!form.name?.trim()}>
                Save
              </Button>
            </div>
          </div>
        )
      }
    >
      <fieldset disabled={readOnly} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="Name" placeholder="e.g. Booking software" value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} />
        <Input label="Provider" value={form.provider ?? ''} onChange={(e) => set('provider', e.target.value)} />
        <Select
          label="Type"
          value={form.category ?? 'software'}
          onChange={(e) => set('category', e.target.value as Subscription['category'])}
          options={options(SUBSCRIPTION_CATEGORY)}
        />
        {sites.length > 0 && (
          <Select
            label="Site"
            value={form.site ? String(form.site) : ''}
            onChange={(e) => set('site', e.target.value ? Number(e.target.value) : null)}
            placeholder="Whole gym"
            options={sites.map((s) => ({ value: String(s.id), label: s.name }))}
          />
        )}
        <Input
          label="Cost"
          type="number"
          min="0"
          step="0.01"
          value={form.cost ?? ''}
          onChange={(e) => set('cost', e.target.value)}
        />
        <Select
          label="Billed"
          value={form.billing_cycle ?? 'monthly'}
          onChange={(e) => {
            const cycle = e.target.value as BillingCycle
            setForm((f) => ({
              ...f,
              billing_cycle: cycle,
              reminder_days: remindersTouched ? f.reminder_days : DEFAULT_REMINDERS[cycle],
            }))
          }}
          options={options(BILLING_CYCLE)}
        />
        <Input
          label="Next renewal"
          type="date"
          value={form.next_renewal ?? ''}
          onChange={(e) => set('next_renewal', e.target.value)}
        />
        <Input
          label="Notice to cancel (days)"
          hint="Reminders count back from the last day to give notice"
          type="number"
          min={0}
          max={365}
          value={form.notice_days ?? 0}
          onChange={(e) => set('notice_days', Number(e.target.value))}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-cyan-500"
            checked={!!form.auto_renew}
            onChange={(e) => set('auto_renew', e.target.checked)}
          />
          Renews automatically
        </label>
        <PersonSelect value={form.responsible ?? null} onChange={(id) => set('responsible', id)} />
        <div className="sm:col-span-2">
          <ReminderDaysInput
            value={form.reminder_days ?? []}
            onChange={(days) => {
              setRemindersTouched(true)
              set('reminder_days', days)
            }}
            hint={
              form.notice_days
                ? 'Days before the last day to give notice.'
                : 'Days before it renews. Reminders go to the responsible person and your alert roles.'
            }
          />
        </div>
        <div className="sm:col-span-2">
          <DocumentField
            url={(form as Subscription).document_url ?? null}
            name={(form as Subscription).document_name ?? ''}
            picked={file}
            onPick={setFile}
            onRemove={sub && !readOnly ? () => dropDocument.mutate() : undefined}
          />
        </div>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-sm font-medium text-gray-700">Notes</span>
          <textarea
            rows={2}
            value={form.notes ?? ''}
            onChange={(e) => set('notes', e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        {sub && (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              className="accent-cyan-500"
              checked={!form.is_active}
              onChange={(e) => set('is_active', !e.target.checked)}
            />
            Cancelled (keeps the record, stops reminders and leaves it out of the totals)
          </label>
        )}
      </fieldset>
    </Modal>
  )
}
