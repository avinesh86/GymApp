import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { getTenantSettings, updateTenantSettings, getWhatsAppAccount, updateWhatsAppAccount } from '../../../api/settings'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Input } from '../../../components/ui/Input'

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
    <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={[
          'relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
          checked ? 'bg-cyan-500' : 'bg-gray-200',
        ].join(' ')}
        role="switch"
        aria-checked={checked}
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

export function NotificationsTab() {
  const queryClient = useQueryClient()

  const { data: settings } = useQuery({ queryKey: ['tenant', 'settings'], queryFn: getTenantSettings })
  const { data: waAccount } = useQuery({ queryKey: ['tenant', 'whatsapp-account'], queryFn: getWhatsAppAccount })

  // ── Channel toggles ──────────────────────────────────────────────────────────
  const [emailEnabled, setEmailEnabled]         = useState(true)
  const [whatsappEnabled, setWhatsappEnabled]   = useState(false)
  const [coverAlerts, setCoverAlerts]           = useState(false)
  const [invoiceReminders, setInvoiceReminders] = useState(false)

  // ── Outgoing email config ────────────────────────────────────────────────────
  const [fromEmail, setFromEmail]           = useState('')
  const [fromName, setFromName]             = useState('')
  const [emailPassword, setEmailPassword]   = useState('')
  const [passwordSet, setPasswordSet]       = useState(false)
  const [showEmailPassword, setShowEmailPassword] = useState(false)

  // ── WhatsApp Business config ─────────────────────────────────────────────────
  const [waBusinessNumber, setWaBusinessNumber]   = useState('')
  const [waDisplayName, setWaDisplayName]         = useState('')
  const [waPhoneNumberId, setWaPhoneNumberId]     = useState('')
  const [waWabaId, setWaWabaId]                   = useState('')
  const [waAccessToken, setWaAccessToken]         = useState('')
  const [waTokenSet, setWaTokenSet]               = useState(false)
  const [waWebhookToken, setWaWebhookToken]       = useState('')
  const [showWaToken, setShowWaToken]             = useState(false)

  useEffect(() => {
    if (settings) {
      setEmailEnabled(settings.email_enabled ?? true)
      setWhatsappEnabled(settings.whatsapp_enabled ?? false)
      setCoverAlerts(settings.cover_alerts_enabled ?? false)
      setInvoiceReminders(settings.invoice_reminders_enabled ?? false)
      setFromEmail(settings.notification_from_email ?? '')
      setFromName(settings.notification_from_name ?? '')
      setPasswordSet(settings.notification_email_password_set ?? false)
    }
  }, [settings])

  useEffect(() => {
    if (waAccount) {
      setWaBusinessNumber(waAccount.business_phone_number ?? '')
      setWaDisplayName(waAccount.display_name ?? '')
      setWaPhoneNumberId(waAccount.phone_number_id ?? '')
      setWaWabaId(waAccount.waba_id ?? '')
      setWaTokenSet(waAccount.access_token_set ?? false)
      setWaWebhookToken(waAccount.webhook_verify_token ?? '')
    }
  }, [waAccount])

  // ── Auto-save channel toggles ────────────────────────────────────────────────
  const { mutate: saveToggle } = useMutation({
    mutationFn: (patch: Partial<Record<string, boolean>>) => updateTenantSettings(patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tenant', 'settings'] }),
    onError: () => toast.error('Failed to save setting'),
  })

  function handleToggle(field: string, value: boolean, setter: (v: boolean) => void) {
    setter(value)
    saveToggle({ [field]: value })
  }

  // ── Save email settings ──────────────────────────────────────────────────────
  const { mutate: saveEmail, isPending: savingEmail } = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        notification_from_email: fromEmail,
        notification_from_name: fromName,
      }
      if (emailPassword) payload.notification_email_password = emailPassword
      return updateTenantSettings(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant', 'settings'] })
      setEmailPassword('')
      toast.success('Email settings saved')
    },
    onError: () => toast.error('Failed to save email settings'),
  })

  // ── Save WhatsApp settings ───────────────────────────────────────────────────
  const { mutate: saveWhatsApp, isPending: savingWhatsApp } = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        business_phone_number: waBusinessNumber,
        display_name: waDisplayName,
        phone_number_id: waPhoneNumberId,
        waba_id: waWabaId,
        webhook_verify_token: waWebhookToken,
      }
      if (waAccessToken) payload.access_token = waAccessToken
      return updateWhatsAppAccount(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant', 'whatsapp-account'] })
      setWaAccessToken('')
      toast.success('WhatsApp settings saved')
    },
    onError: () => toast.error('Failed to save WhatsApp settings'),
  })

  return (
    <div className="max-w-lg space-y-6">

      {/* ── Channel toggles ─────────────────────────────────────────────── */}
      <Card>
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Notification Channels</h3>
        <Toggle
          label="Email Notifications"
          description="Send cover requests and alerts via email"
          checked={emailEnabled}
          onChange={(v) => handleToggle('email_enabled', v, setEmailEnabled)}
        />
        <Toggle
          label="WhatsApp Notifications"
          description="Send notifications via WhatsApp Business"
          checked={whatsappEnabled}
          onChange={(v) => handleToggle('whatsapp_enabled', v, setWhatsappEnabled)}
        />
        <h3 className="text-sm font-semibold text-gray-900 mt-4 mb-2">Alert Types</h3>
        <Toggle
          label="Cover Request Alerts"
          description="Notify instructors when cover is needed for a class"
          checked={coverAlerts}
          onChange={(v) => handleToggle('cover_alerts_enabled', v, setCoverAlerts)}
        />
        <Toggle
          label="Invoice Reminders"
          description="Remind instructors and managers about pending invoices"
          checked={invoiceReminders}
          onChange={(v) => handleToggle('invoice_reminders_enabled', v, setInvoiceReminders)}
        />
      </Card>

      {/* ── Outgoing email ───────────────────────────────────────────────── */}
      <Card>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Outgoing Email</h3>
        <p className="text-xs text-gray-400 mb-4">
          Emails will be sent from this address. Use a Gmail App Password — not your regular Gmail password.{' '}
          <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="text-cyan-600 hover:underline">
            Generate one here →
          </a>
        </p>
        <div className="space-y-3">
          <Input label="Sender Name" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="FitOps" />
          <Input label="Sender Email" type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="you@gmail.com" />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              Gmail App Password
              {passwordSet && !emailPassword && <span className="ml-2 text-xs font-normal text-green-600">✓ saved</span>}
            </label>
            <div className="relative">
              <input
                type={showEmailPassword ? 'text' : 'password'}
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                placeholder={passwordSet ? '••••••••••••••••' : 'Enter app password'}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-16 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
              <button type="button" onClick={() => setShowEmailPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600">
                {showEmailPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="text-xs text-gray-400">Leave blank to keep the existing password.</p>
          </div>
        </div>
        <div className="mt-5">
          <Button onClick={() => saveEmail()} isLoading={savingEmail}>Save Email Settings</Button>
        </div>
      </Card>

      {/* ── WhatsApp Business ────────────────────────────────────────────── */}
      <Card>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">WhatsApp Business</h3>
        <p className="text-xs text-gray-400 mb-4">
          Messages are sent via the Meta Business Cloud API from your WhatsApp Business number.{' '}
          <a href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started" target="_blank" rel="noreferrer" className="text-cyan-600 hover:underline">
            Setup guide →
          </a>
        </p>
        <div className="space-y-3">
          <Input
            label="Business Phone Number"
            value={waBusinessNumber}
            onChange={(e) => setWaBusinessNumber(e.target.value)}
            placeholder="+64224004910"
          />
          <Input
            label="Display Name"
            value={waDisplayName}
            onChange={(e) => setWaDisplayName(e.target.value)}
            placeholder="FitOps"
          />
          <Input
            label="Phone Number ID"
            value={waPhoneNumberId}
            onChange={(e) => setWaPhoneNumberId(e.target.value)}
            placeholder="Meta phone_number_id"
          />
          <Input
            label="WhatsApp Business Account ID (WABA)"
            value={waWabaId}
            onChange={(e) => setWaWabaId(e.target.value)}
            placeholder="Meta waba_id"
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              Access Token
              {waTokenSet && !waAccessToken && <span className="ml-2 text-xs font-normal text-green-600">✓ saved</span>}
            </label>
            <div className="relative">
              <input
                type={showWaToken ? 'text' : 'password'}
                value={waAccessToken}
                onChange={(e) => setWaAccessToken(e.target.value)}
                placeholder={waTokenSet ? '••••••••••••••••' : 'Paste Meta access token'}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-16 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
              <button type="button" onClick={() => setShowWaToken((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600">
                {showWaToken ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="text-xs text-gray-400">Leave blank to keep the existing token.</p>
          </div>
          <Input
            label="Webhook Verify Token"
            value={waWebhookToken}
            onChange={(e) => setWaWebhookToken(e.target.value)}
            placeholder="Any secret string you choose"
          />
        </div>
        <div className="mt-5">
          <Button onClick={() => saveWhatsApp()} isLoading={savingWhatsApp}>Save WhatsApp Settings</Button>
        </div>
      </Card>

    </div>
  )
}
