import React, { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { getTenantSettings, updateTenantSettings } from '../../../api/settings'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import type { UserRole } from '../../../types'

const ALERT_ROLES: { role: UserRole; label: string }[] = [
  { role: 'owner', label: 'Owner' },
  { role: 'admin', label: 'Admin' },
  { role: 'gym_manager', label: 'Gym Manager' },
  { role: 'team_leader', label: 'Team Leader' },
  { role: 'payroll', label: 'Payroll' },
]

function Switch({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className={`flex items-center justify-between gap-4 py-3 border-b border-gray-50 last:border-0 ${disabled ? 'opacity-50' : ''}`}>
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={[
          'relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
          checked ? 'bg-cyan-500' : 'bg-gray-200',
        ].join(' ')}
      >
        <span
          className={[
            'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transform transition-transform duration-200',
            checked ? 'translate-x-5' : 'translate-x-0',
          ].join(' ')}
        />
      </button>
    </div>
  )
}

export function FacilitiesTab() {
  const queryClient = useQueryClient()
  const { data: settings } = useQuery({ queryKey: ['tenant', 'settings'], queryFn: getTenantSettings })

  const [equipment, setEquipment] = useState(true)
  const [maintenance, setMaintenance] = useState(true)
  const [reporting, setReporting] = useState(true)
  const [alertRoles, setAlertRoles] = useState<UserRole[]>([])
  const [alertEmail, setAlertEmail] = useState(false)

  useEffect(() => {
    if (!settings) return
    setEquipment(settings.facilities_equipment_enabled ?? true)
    setMaintenance(settings.facilities_maintenance_enabled ?? true)
    setReporting(settings.fault_reporting_enabled ?? true)
    setAlertRoles(settings.facilities_alert_roles ?? ['owner', 'admin', 'gym_manager'])
    setAlertEmail(settings.facilities_alert_email ?? false)
  }, [settings])

  const { mutate: save, isPending } = useMutation({
    mutationFn: () =>
      updateTenantSettings({
        facilities_equipment_enabled: equipment,
        facilities_maintenance_enabled: maintenance,
        fault_reporting_enabled: reporting,
        facilities_alert_roles: alertRoles,
        facilities_alert_email: alertEmail,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant', 'settings'] })
      queryClient.invalidateQueries({ queryKey: ['facilities'] })
      toast.success('Facilities settings saved')
    },
    onError: () => toast.error('Failed to save settings'),
  })

  const toggleRole = (role: UserRole) =>
    setAlertRoles((roles) => (roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role]))

  return (
    <div className="max-w-xl flex flex-col gap-6">
      <Card>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">What Facilities tracks</h3>
        <p className="text-xs text-gray-500 mb-3">
          Switch off anything you already manage in another system, so nobody keeps two records.
        </p>
        <Switch
          label="Equipment inventory"
          description="A register of every machine and item, with serials, warranty and status."
          checked={equipment}
          onChange={setEquipment}
        />
        <Switch
          label="Maintenance tracking"
          description="Work faults through from reported to fixed."
          checked={maintenance}
          onChange={setMaintenance}
        />
        <Switch
          label="Report a fault button"
          description={
            maintenance
              ? 'Lets every staff member, including instructors and PTs, report a fault and see its status under Maintenance in their menu.'
              : 'Needs maintenance tracking switched on — reported faults are worked through there.'
          }
          checked={maintenance && reporting}
          disabled={!maintenance}
          onChange={setReporting}
        />
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Who hears about new faults</h3>
        <p className="text-xs text-gray-500 mb-3">
          They get an alert in the app (notification bell and dashboard). Facilities alerts are never sent to WhatsApp.
        </p>
        <fieldset className="flex flex-wrap gap-x-5 gap-y-2 mb-3">
          <legend className="sr-only">Roles alerted about new faults</legend>
          {ALERT_ROLES.map(({ role, label }) => (
            <label key={role} className="flex items-center gap-2 text-sm text-gray-800">
              <input
                type="checkbox"
                className="accent-cyan-500"
                checked={alertRoles.includes(role)}
                onChange={() => toggleRole(role)}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <Switch
          label="Also send alerts by email"
          description="Emails the people above as well. Needs email turned on under Notifications."
          checked={alertEmail}
          onChange={setAlertEmail}
        />
      </Card>

      <Button onClick={() => save()} isLoading={isPending} className="w-fit">
        Save Facilities Settings
      </Button>
    </div>
  )
}
