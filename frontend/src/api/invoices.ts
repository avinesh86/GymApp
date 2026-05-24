import apiClient from './client'
import type { Invoice, PaginatedResponse } from '../types'

export interface InvoiceFilters {
  status?: string | string[]
  search?: string
  page?: number
  page_size?: number
}

export async function listInvoices(
  filters: InvoiceFilters = {}
): Promise<PaginatedResponse<Invoice>> {
  const response = await apiClient.get<PaginatedResponse<Invoice>>('invoices/', {
    params: filters,
    paramsSerializer: { indexes: null },
  })
  return response.data
}

export async function getInvoice(id: number): Promise<Invoice> {
  const response = await apiClient.get<Invoice>(`invoices/${id}/`)
  return response.data
}

export async function approveInvoice(id: number, notes?: string): Promise<Invoice> {
  const response = await apiClient.post<Invoice>(`invoices/${id}/approve/`, { notes })
  return response.data
}

export async function rejectInvoice(id: number, notes: string): Promise<Invoice> {
  const response = await apiClient.post<Invoice>(`invoices/${id}/reject/`, { notes })
  return response.data
}

export async function downloadInvoicePdf(id: number): Promise<Blob> {
  const response = await apiClient.get(`invoices/${id}/pdf/`, { responseType: 'blob' })
  return response.data
}
