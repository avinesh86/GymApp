import apiClient from './client'
import type { TenantSettings, TenantBranding, WhatsAppAccount, Site, User, PaginatedResponse, SetupStatus } from '../types'

function unwrapList<T>(data: T[] | PaginatedResponse<T>): T[] {
  return Array.isArray(data) ? data : data.results
}

// ─── Tenant Settings ──────────────────────────────────────────────────────────

export async function getTenantSettings(): Promise<TenantSettings> {
  const response = await apiClient.get<TenantSettings>('tenants/settings/')
  return response.data
}

export async function updateTenantSettings(data: Partial<TenantSettings>): Promise<TenantSettings> {
  const response = await apiClient.patch<TenantSettings>('tenants/settings/', data)
  return response.data
}

// ─── Tenant Branding ──────────────────────────────────────────────────────────

export async function getTenantBranding(): Promise<TenantBranding> {
  const response = await apiClient.get<TenantBranding>('tenants/branding/')
  return response.data
}

export async function updateTenantBranding(data: Partial<TenantBranding>): Promise<TenantBranding> {
  const response = await apiClient.patch<TenantBranding>('tenants/branding/', data)
  return response.data
}

// ─── WhatsApp Account ─────────────────────────────────────────────────────────

export async function getWhatsAppAccount(): Promise<WhatsAppAccount> {
  const response = await apiClient.get<WhatsAppAccount>('tenants/whatsapp-account/')
  return response.data
}

export async function updateWhatsAppAccount(data: Partial<WhatsAppAccount>): Promise<WhatsAppAccount> {
  const response = await apiClient.patch<WhatsAppAccount>('tenants/whatsapp-account/', data)
  return response.data
}

// ─── Sites ────────────────────────────────────────────────────────────────────

export async function listSites(): Promise<Site[]> {
  const response = await apiClient.get<Site[] | PaginatedResponse<Site>>('tenants/sites/')
  return unwrapList(response.data)
}

export async function createSite(data: Partial<Site>): Promise<Site> {
  const response = await apiClient.post<Site>('tenants/sites/', data)
  return response.data
}

export async function updateSite(id: number, data: Partial<Site>): Promise<Site> {
  const response = await apiClient.patch<Site>(`tenants/sites/${id}/`, data)
  return response.data
}

export async function deleteSite(id: number): Promise<void> {
  await apiClient.delete(`tenants/sites/${id}/`)
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function listUsers(): Promise<User[]> {
  const response = await apiClient.get<User[] | PaginatedResponse<User>>('users/')
  return unwrapList(response.data)
}

export async function inviteUser(data: {
  email: string
  first_name: string
  last_name: string
  role: string
  password?: string
}): Promise<User> {
  const response = await apiClient.post<User>('users/', data)
  return response.data
}

export async function updateUser(id: number, data: Partial<User>): Promise<User> {
  const response = await apiClient.patch<User>(`users/${id}/`, data)
  return response.data
}

export async function deactivateUser(id: number): Promise<void> {
  await apiClient.patch(`users/${id}/`, { is_active: false })
}

/** Owner/admin emails a password-reset link to a user in their gym. */
export async function sendUserPasswordReset(id: number): Promise<void> {
  await apiClient.post(`users/${id}/send-password-reset/`)
}

// ─── Setup status ─────────────────────────────────────────────────────────────

export async function getSetupStatus(): Promise<SetupStatus> {
  const response = await apiClient.get<SetupStatus>('tenants/setup-status/')
  return response.data
}
