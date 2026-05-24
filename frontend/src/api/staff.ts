import apiClient from './client'
import type {
  PaginatedResponse,
  StaffMember,
  PayRate,
  Qualification,
  Capability,
  Availability,
} from '../types'

function unwrapList<T>(data: T[] | PaginatedResponse<T>): T[] {
  return Array.isArray(data) ? data : data.results
}

export interface StaffFilters {
  search?: string
  role?: string
  status?: string
  page?: number
  page_size?: number
}

export async function listStaff(filters: StaffFilters = {}): Promise<PaginatedResponse<StaffMember>> {
  const response = await apiClient.get<PaginatedResponse<StaffMember>>('staff/', { params: filters })
  return response.data
}

export async function getStaff(id: number): Promise<StaffMember> {
  const response = await apiClient.get<StaffMember>(`staff/${id}/`)
  return response.data
}

export async function createStaff(data: Partial<StaffMember>): Promise<StaffMember> {
  const response = await apiClient.post<StaffMember>('staff/', data)
  return response.data
}

export async function updateStaff(id: number, data: Partial<StaffMember>): Promise<StaffMember> {
  const response = await apiClient.patch<StaffMember>(`staff/${id}/`, data)
  return response.data
}

export async function deleteStaff(id: number): Promise<void> {
  await apiClient.delete(`staff/${id}/`)
}

// ─── Pay Rates ────────────────────────────────────────────────────────────────

export async function listPayRates(staffId: number): Promise<PayRate[]> {
  const response = await apiClient.get<PayRate[] | PaginatedResponse<PayRate>>(`staff/${staffId}/pay-rates/`)
  return unwrapList(response.data)
}

export async function createPayRate(staffId: number, data: Partial<PayRate>): Promise<PayRate> {
  const response = await apiClient.post<PayRate>(`staff/${staffId}/pay-rates/`, data)
  return response.data
}

export async function deletePayRate(staffId: number, rateId: number): Promise<void> {
  await apiClient.delete(`staff/${staffId}/pay-rates/${rateId}/`)
}

// ─── Qualifications ───────────────────────────────────────────────────────────

export async function listQualifications(staffId: number): Promise<Qualification[]> {
  const response = await apiClient.get<Qualification[] | PaginatedResponse<Qualification>>(`staff/${staffId}/qualifications/`)
  return unwrapList(response.data)
}

export async function createQualification(
  staffId: number,
  data: Partial<Qualification>
): Promise<Qualification> {
  const response = await apiClient.post<Qualification>(`staff/${staffId}/qualifications/`, data)
  return response.data
}

export async function deleteQualification(staffId: number, qualId: number): Promise<void> {
  await apiClient.delete(`staff/${staffId}/qualifications/${qualId}/`)
}

// ─── Capabilities ─────────────────────────────────────────────────────────────

export async function listCapabilities(staffId: number): Promise<Capability[]> {
  const response = await apiClient.get<Capability[] | PaginatedResponse<Capability>>(`staff/${staffId}/capabilities/`)
  return unwrapList(response.data)
}

export async function createCapability(staffId: number, data: Partial<Capability>): Promise<Capability> {
  const response = await apiClient.post<Capability>(`staff/${staffId}/capabilities/`, data)
  return response.data
}

export async function deleteCapability(staffId: number, capId: number): Promise<void> {
  await apiClient.delete(`staff/${staffId}/capabilities/${capId}/`)
}

// ─── Availability ─────────────────────────────────────────────────────────────

export async function listAvailability(staffId: number): Promise<Availability[]> {
  const response = await apiClient.get<Availability[] | PaginatedResponse<Availability>>(`staff/${staffId}/availability/`)
  return unwrapList(response.data)
}

export async function createAvailability(staffId: number, data: Partial<Availability>): Promise<Availability> {
  const response = await apiClient.post<Availability>(`staff/${staffId}/availability/`, data)
  return response.data
}

export async function deleteAvailability(staffId: number, slotId: number): Promise<void> {
  await apiClient.delete(`staff/${staffId}/availability/${slotId}/`)
}

// ─── Current Staff (self) ─────────────────────────────────────────────────────

export async function getMyStaffProfile(): Promise<StaffMember> {
  const response = await apiClient.get<StaffMember>('staff/me/')
  return response.data
}

// ─── Payment Details ──────────────────────────────────────────────────────────

export interface PaymentDetails {
  id?: number
  business_name: string
  bank_name: string
  account_name: string
  account_number: string
  sort_code: string
  payment_reference: string
  additional_notes: string
}

export async function getPaymentDetails(staffId: number): Promise<PaymentDetails> {
  const response = await apiClient.get<PaymentDetails>(`staff/${staffId}/payment-details/`)
  return response.data
}

export async function createOrUpdatePaymentDetails(
  staffId: number,
  data: Partial<PaymentDetails>
): Promise<PaymentDetails> {
  // Use PUT for full replacement, falling back gracefully if the record doesn't exist yet
  const response = await apiClient.put<PaymentDetails>(`staff/${staffId}/payment-details/`, data)
  return response.data
}

// ─── Pay Rate Overrides ───────────────────────────────────────────────────────

export interface PayRateOverride {
  id?: number
  class_type: number | null
  site: number | null
  amount: string
  effective_from: string
  effective_to: string | null
}

export async function listPayRateOverrides(staffId: number): Promise<PayRateOverride[]> {
  const response = await apiClient.get<PayRateOverride[] | PaginatedResponse<PayRateOverride>>(
    `staff/${staffId}/pay-rate-overrides/`
  )
  return unwrapList(response.data)
}

export async function createPayRateOverride(
  staffId: number,
  data: Omit<PayRateOverride, 'id'>
): Promise<PayRateOverride> {
  const response = await apiClient.post<PayRateOverride>(
    `staff/${staffId}/pay-rate-overrides/`,
    data
  )
  return response.data
}

export async function deletePayRateOverride(staffId: number, overrideId: number): Promise<void> {
  await apiClient.delete(`staff/${staffId}/pay-rate-overrides/${overrideId}/`)
}

export async function updatePayRate(
  staffId: number,
  rateId: number,
  data: Partial<PayRate>
): Promise<PayRate> {
  const response = await apiClient.patch<PayRate>(`staff/${staffId}/pay-rates/${rateId}/`, data)
  return response.data
}
