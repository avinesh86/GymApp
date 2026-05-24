import React, { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { getTenantSettings, updateTenantSettings, getTenantBranding, updateTenantBranding } from '../../../api/settings'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { Card } from '../../../components/ui/Card'

const CURRENCY_OPTIONS = [
  { value: '$',   label: '$ — US Dollar' },
  { value: '£',   label: '£ — British Pound' },
  { value: '€',   label: '€ — Euro' },
  { value: '¥',   label: '¥ — Japanese Yen' },
  { value: '₹',   label: '₹ — Indian Rupee' },
  { value: 'A$',  label: 'A$ — Australian Dollar' },
  { value: 'C$',  label: 'C$ — Canadian Dollar' },
  { value: 'CHF', label: 'CHF — Swiss Franc' },
  { value: 'custom', label: 'Custom...' },
]

const TIMEZONES = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Kolkata',
  'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland',
]

export function GeneralTab() {
  const queryClient = useQueryClient()

  const { data: settings } = useQuery({ queryKey: ['tenant', 'settings'], queryFn: getTenantSettings })
  const { data: branding } = useQuery({ queryKey: ['tenant', 'branding'], queryFn: getTenantBranding })

  const [currency, setCurrency] = useState('$')
  const [customCurrency, setCustomCurrency] = useState('')
  const [appName, setAppName] = useState('')
  const [timezone, setTimezone] = useState('UTC')

  useEffect(() => {
    if (settings) {
      const known = CURRENCY_OPTIONS.find((o) => o.value === settings.currency_symbol && o.value !== 'custom')
      if (known) {
        setCurrency(settings.currency_symbol)
      } else {
        setCurrency('custom')
        setCustomCurrency(settings.currency_symbol)
      }
      setTimezone(settings.timezone)
    }
  }, [settings])

  useEffect(() => {
    if (branding) setAppName(branding.app_name)
  }, [branding])

  const { mutate: saveSettings, isPending: savingSettings } = useMutation({
    mutationFn: () =>
      updateTenantSettings({
        currency_symbol: currency === 'custom' ? customCurrency : currency,
        timezone,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant', 'settings'] })
      toast.success('Settings saved')
    },
    onError: () => toast.error('Failed to save settings'),
  })

  const { mutate: saveBranding, isPending: savingBranding } = useMutation({
    mutationFn: () => updateTenantBranding({ app_name: appName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant', 'branding'] })
      toast.success('App name updated')
    },
    onError: () => toast.error('Failed to update app name'),
  })

  return (
    <div className="flex flex-col gap-6 max-w-lg">
      {/* Currency */}
      <Card>
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Currency</h3>
        <div className="flex flex-col gap-3">
          <Select
            label="Currency Symbol"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            options={CURRENCY_OPTIONS}
          />
          {currency === 'custom' && (
            <Input
              label="Custom Symbol"
              value={customCurrency}
              onChange={(e) => setCustomCurrency(e.target.value)}
              placeholder="e.g. kr"
              maxLength={4}
            />
          )}
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500">Preview</p>
            <p className="text-lg font-bold text-gray-900 mt-0.5">
              {currency === 'custom' ? customCurrency : currency}1,234.56
            </p>
          </div>
          <Button onClick={() => saveSettings()} isLoading={savingSettings} className="w-fit">
            Save Currency
          </Button>
        </div>
      </Card>

      {/* App Name */}
      <Card>
        <h3 className="text-sm font-semibold text-gray-900 mb-4">App Name</h3>
        <div className="flex flex-col gap-3">
          <Input
            label="App Name"
            value={appName}
            onChange={(e) => setAppName(e.target.value)}
            placeholder="FitOps"
          />
          <Button onClick={() => saveBranding()} isLoading={savingBranding} className="w-fit">
            Save App Name
          </Button>
        </div>
      </Card>

      {/* Timezone */}
      <Card>
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Timezone</h3>
        <div className="flex flex-col gap-3">
          <Select
            label="Timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            options={TIMEZONES.map((tz) => ({ value: tz, label: tz }))}
          />
          <Button onClick={() => saveSettings()} isLoading={savingSettings} className="w-fit">
            Save Timezone
          </Button>
        </div>
      </Card>
    </div>
  )
}
