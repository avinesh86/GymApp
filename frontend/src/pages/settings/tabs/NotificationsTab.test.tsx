import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NotificationsTab } from './NotificationsTab'
import {
  getTenantSettings,
  updateTenantSettings,
  getWhatsAppAccount,
  updateWhatsAppAccount,
} from '../../../api/settings'

vi.mock('../../../api/settings', () => ({
  getTenantSettings: vi.fn(),
  updateTenantSettings: vi.fn(),
  getWhatsAppAccount: vi.fn(),
  updateWhatsAppAccount: vi.fn(),
}))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <NotificationsTab />
    </QueryClientProvider>,
  )
}

// Channel switches are the opposite of the form's old starting values
// (email on, everything else off) so a wrong default would show up.
const SETTINGS = {
  email_enabled: false,
  whatsapp_enabled: true,
  cover_alerts_enabled: true,
  invoice_reminders_enabled: true,
  notification_from_email: 'hello@harbourgym.co.nz',
  notification_from_name: 'Harbour Gym',
  notification_email_password_set: false,
  email_sending_managed: false,
}

const WA_ACCOUNT = {
  id: 1,
  business_phone_number: '+64221234567',
  display_name: 'Harbour Gym',
  phone_number_id: '1098765',
  waba_id: '5550001',
  access_token_set: true,
  webhook_verify_token: 'harbour-secret',
  is_active: true,
}

/** A request that stays in flight until the test calls `finish`. */
function pending<T>() {
  let finish: (value: T) => void = () => {}
  const promise = new Promise<T>((resolve) => (finish = resolve))
  return { promise, finish: (value: T) => finish(value) }
}

/** Email, WhatsApp, Cover Request Alerts, Invoice Reminders — in page order. */
const channelSwitches = () => screen.getAllByRole('switch').map((s) => s.getAttribute('aria-checked'))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getTenantSettings).mockResolvedValue(SETTINGS as never)
  vi.mocked(getWhatsAppAccount).mockResolvedValue(WA_ACCOUNT as never)
  vi.mocked(updateTenantSettings).mockResolvedValue({} as never)
  vi.mocked(updateWhatsAppAccount).mockResolvedValue({} as never)
})

describe('Settings → Notifications', () => {
  it("offers no switches or email settings until the gym's settings have loaded", async () => {
    // Saving before then would blank the sender address and name; the
    // switches would show (and could flip from) the wrong starting value.
    const settings = pending<unknown>()
    vi.mocked(getTenantSettings).mockReturnValue(settings.promise as never)
    renderTab()

    await waitFor(() => expect(getTenantSettings).toHaveBeenCalled())
    expect(screen.queryAllByRole('switch')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Save Email Settings' })).not.toBeInTheDocument()

    settings.finish(SETTINGS)

    await waitFor(() => expect(channelSwitches()).toEqual(['false', 'true', 'true', 'true']))
    expect(screen.getByLabelText('Sender Email')).toHaveValue('hello@harbourgym.co.nz')
    expect(updateTenantSettings).not.toHaveBeenCalled()
  })

  it('offers no WhatsApp settings to save until the WhatsApp account has loaded', async () => {
    // Saving before then would wipe the gym's WhatsApp number, IDs and
    // webhook token.
    const account = pending<unknown>()
    vi.mocked(getWhatsAppAccount).mockReturnValue(account.promise as never)
    renderTab()

    expect(await screen.findByRole('button', { name: 'Save Email Settings' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save WhatsApp Settings' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Business Phone Number')).not.toBeInTheDocument()

    account.finish(WA_ACCOUNT)

    expect(await screen.findByLabelText('Business Phone Number')).toHaveValue('+64221234567')
    expect(updateWhatsAppAccount).not.toHaveBeenCalled()
  })

  it("shows the gym's saved email and WhatsApp settings and saves them unchanged", async () => {
    renderTab()

    expect(await screen.findByLabelText('Sender Name')).toHaveValue('Harbour Gym')
    await userEvent.click(screen.getByRole('button', { name: 'Save Email Settings' }))
    await waitFor(() =>
      expect(updateTenantSettings).toHaveBeenCalledWith({
        notification_from_email: 'hello@harbourgym.co.nz',
        notification_from_name: 'Harbour Gym',
      }),
    )

    expect(await screen.findByLabelText('Phone Number ID')).toHaveValue('1098765')
    await userEvent.click(screen.getByRole('button', { name: 'Save WhatsApp Settings' }))
    await waitFor(() =>
      expect(updateWhatsAppAccount).toHaveBeenCalledWith({
        business_phone_number: '+64221234567',
        display_name: 'Harbour Gym',
        phone_number_id: '1098765',
        waba_id: '5550001',
        webhook_verify_token: 'harbour-secret',
      }),
    )
  })

  it('shows the password as saved once a new one has been saved', async () => {
    renderTab()
    const password = await screen.findByLabelText(/Gmail App Password/)
    const passwordSaved = { selector: 'label[for="gmail-app-password"] > span' }
    expect(screen.queryByText('✓ saved', passwordSaved)).not.toBeInTheDocument()

    vi.mocked(getTenantSettings).mockResolvedValue({ ...SETTINGS, notification_email_password_set: true } as never)
    await userEvent.type(password, 'abcd efgh ijkl mnop')
    await userEvent.click(screen.getByRole('button', { name: 'Save Email Settings' }))

    expect(await screen.findByText('✓ saved', passwordSaved)).toBeInTheDocument()
    expect(password).toHaveValue('')
  })

  it('says so and offers to try again when the settings cannot be loaded', async () => {
    vi.mocked(getTenantSettings).mockRejectedValueOnce(new Error('offline'))
    renderTab()

    expect(await screen.findByText("Couldn't load the notification settings")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save Email Settings' })).not.toBeInTheDocument()
    expect(screen.queryAllByRole('switch')).toHaveLength(0)

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('button', { name: 'Save Email Settings' })).toBeInTheDocument()
  })

  it('says so and offers to try again when the WhatsApp account cannot be loaded', async () => {
    vi.mocked(getWhatsAppAccount).mockRejectedValueOnce(new Error('offline'))
    renderTab()

    expect(await screen.findByText("Couldn't load the WhatsApp settings")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save WhatsApp Settings' })).not.toBeInTheDocument()
    // The rest of the tab still works.
    expect(screen.getByRole('button', { name: 'Save Email Settings' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByLabelText('Business Phone Number')).toHaveValue('+64221234567')
  })
})
