import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { getTenantSettings, updateTenantSettings, getTenantBranding, updateTenantBranding } from '../../../api/settings'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { Card } from '../../../components/ui/Card'
import type { TenantBranding, TenantSettings } from '../../../types'
import { WhenLoaded } from './WhenLoaded'

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
  // Both start loading at once; the form waits for both.
  const settingsQuery = useQuery({ queryKey: ['tenant', 'settings'], queryFn: getTenantSettings })
  const brandingQuery = useQuery({ queryKey: ['tenant', 'branding'], queryFn: getTenantBranding })
  return (
    <WhenLoaded query={settingsQuery} savesKey={['tenant', 'settings']} what="the general settings">
      {(settings) => (
        <WhenLoaded query={brandingQuery} savesKey={['tenant', 'branding']} what="the general settings">
          {(branding) => <GeneralForm settings={settings} branding={branding} />}
        </WhenLoaded>
      )}
    </WhenLoaded>
  )
}

function isKnownCurrency(symbol: string) {
  return CURRENCY_OPTIONS.some((o) => o.value === symbol && o.value !== 'custom')
}

function GeneralForm({ settings, branding }: { settings: TenantSettings; branding: TenantBranding }) {
  const queryClient = useQueryClient()
  const savedCurrencyKnown = isKnownCurrency(settings.currency_symbol)
  const [currency, setCurrency] = useState(savedCurrencyKnown ? settings.currency_symbol : 'custom')
  const [customCurrency, setCustomCurrency] = useState(savedCurrencyKnown ? '' : settings.currency_symbol)
  const [appName, setAppName] = useState(branding.app_name)
  const [timezone, setTimezone] = useState(settings.timezone)

  const { mutate: saveSettings, isPending: savingSettings } = useMutation({
    mutationKey: ['tenant', 'settings'],
    mutationFn: () =>
      updateTenantSettings({
        currency_symbol: currency === 'custom' ? customCurrency : currency,
        timezone,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant', 'settings'] })
      // Every date and "today" on the site follows the gym's timezone.
      queryClient.invalidateQueries({ queryKey: ['tenant', 'locale'] })
      toast.success('Settings saved')
    },
    onError: () => toast.error('Failed to save settings'),
  })

  const { mutate: saveBranding, isPending: savingBranding } = useMutation({
    mutationKey: ['tenant', 'branding'],
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
