import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { getTenantSettings, updateTenantSettings } from '../../../api/settings'
import { Button } from '../../../components/ui/Button'
import { Select } from '../../../components/ui/Select'
import { Card } from '../../../components/ui/Card'
import type { TenantSettings } from '../../../types'
import { WhenLoaded } from './WhenLoaded'
import { SaveConflictWarning, useGuardedSave, type ConflictField } from './SaveConflict'

const FREQUENCY_OPTIONS = [
  { value: 'weekly',       label: 'Weekly' },
  { value: 'fortnightly',  label: 'Fortnightly (every 2 weeks)' },
  { value: 'monthly',      label: 'Monthly' },
  { value: '8-weekly',     label: 'Every 8 Weeks' },
]

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={[
          'relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors',
          checked ? 'bg-cyan-500' : 'bg-gray-200',
        ].join(' ')}
      >
        <span
          className={[
            'inline-block h-5 w-5 rounded-full bg-white shadow-sm transform transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0',
          ].join(' ')}
        />
      </button>
    </div>
  )
}

export function InvoicesTab() {
  const query = useQuery({ queryKey: ['tenant', 'settings'], queryFn: getTenantSettings })
  return (
    <WhenLoaded query={query} savesKey={['tenant', 'settings']} what="the invoice settings">
      {(settings) => <InvoicesForm settings={settings} />}
    </WhenLoaded>
  )
}

const FIELDS: ConflictField<TenantSettings>[] = [
  {
    key: 'invoice_frequency',
    label: 'Invoice Frequency',
    show: (v) => FREQUENCY_OPTIONS.find((o) => o.value === v)?.label ?? String(v),
  },
  {
    key: 'pay_period_anchor_date',
    label: 'Pay Period Start Date',
    show: (v) => (typeof v === 'string' && v ? format(parseISO(v), 'd MMM yyyy') : '(blank)'),
  },
  {
    key: 'payroll_approval_required',
    label: 'Payroll Approval Required',
  },
]

function InvoicesForm({ settings }: { settings: TenantSettings }) {
  const [frequency, setFrequency] = useState<string>(settings.invoice_frequency)
  const [anchorDate, setAnchorDate] = useState(settings.pay_period_anchor_date ?? '')
  const [approvalRequired, setApprovalRequired] = useState(settings.payroll_approval_required)

  const guard = useGuardedSave({
    data: settings,
    fields: FIELDS,
    queryKey: ['tenant', 'settings'],
    queryFn: getTenantSettings,
    send: updateTenantSettings,
    current: () => ({
      invoice_frequency: frequency as TenantSettings['invoice_frequency'],
      // A blank date isn't sent: clearing it isn't supported.
      pay_period_anchor_date: anchorDate || undefined,
      payroll_approval_required: approvalRequired,
    }),
    apply: (v) => {
      if (v.invoice_frequency !== undefined) setFrequency(v.invoice_frequency)
      if (v.pay_period_anchor_date !== undefined) setAnchorDate(v.pay_period_anchor_date ?? '')
      if (v.payroll_approval_required !== undefined) setApprovalRequired(v.payroll_approval_required)
    },
    savedMessage: 'Invoice settings saved',
    failedMessage: 'Failed to save invoice settings',
  })

  return (
    <div className="max-w-md">
      <Card>
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Invoice Configuration</h3>
        <div className="flex flex-col gap-4">
          <Select
            label="Invoice Frequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
            options={FREQUENCY_OPTIONS}
          />

          <div className="flex flex-col gap-1">
            <label htmlFor="pay-period-anchor" className="text-sm font-medium text-gray-700">
              Pay Period Start Date
            </label>
            <input
              id="pay-period-anchor"
              type="date"
              value={anchorDate}
              onChange={(e) => setAnchorDate(e.target.value)}
              aria-label="Pay period start date"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            <p className="text-xs text-gray-400">Recurring fortnightly / 8-weekly periods are counted from this date.</p>
          </div>

          <div className="border-t border-gray-100 pt-3">
            <Toggle
              label="Payroll Approval Required"
              description="Invoices must be approved by a payroll admin before being marked as paid"
              checked={approvalRequired}
              onChange={setApprovalRequired}
            />
          </div>

          <SaveConflictWarning conflict={guard.conflict} onLoadTheirs={guard.loadTheirs} onSaveMine={guard.saveMine} />
          <Button onClick={() => void guard.save()} isLoading={guard.isSaving} className="w-fit">
            Save Invoice Settings
          </Button>
        </div>
      </Card>
    </div>
  )
}
