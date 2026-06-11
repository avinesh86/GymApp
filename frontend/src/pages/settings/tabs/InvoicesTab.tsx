import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { getTenantSettings, updateTenantSettings } from '../../../api/settings'
import { Button } from '../../../components/ui/Button'
import { Select } from '../../../components/ui/Select'
import { Card } from '../../../components/ui/Card'

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
  const queryClient = useQueryClient()
  const { data: settings } = useQuery({ queryKey: ['tenant', 'settings'], queryFn: getTenantSettings })

  const [frequency, setFrequency] = useState('monthly')
  const [anchorDate, setAnchorDate] = useState('')
  const [approvalRequired, setApprovalRequired] = useState(true)

  useEffect(() => {
    if (settings) {
      setFrequency(settings.invoice_frequency)
      setAnchorDate(settings.pay_period_anchor_date ?? '')
      setApprovalRequired(settings.payroll_approval_required)
    }
  }, [settings])

  const { mutate: save, isPending } = useMutation({
    mutationFn: () =>
      updateTenantSettings({
        invoice_frequency: frequency as never,
        ...(anchorDate ? { pay_period_anchor_date: anchorDate } : {}),
        payroll_approval_required: approvalRequired,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant', 'settings'] })
      toast.success('Invoice settings saved')
    },
    onError: () => toast.error('Failed to save invoice settings'),
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

          <Button onClick={() => save()} isLoading={isPending} className="w-fit">
            Save Invoice Settings
          </Button>
        </div>
      </Card>
    </div>
  )
}
