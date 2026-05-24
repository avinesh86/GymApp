import apiClient from './client'
import type { CoverRequest, CoverOffer, PaginatedResponse } from '../types'

function unwrapList<T>(data: T[] | PaginatedResponse<T>): T[] {
  return Array.isArray(data) ? data : data.results
}

export interface CoverFilters {
  status?: string
  urgency?: string
}

export async function listCoverRequests(filters: CoverFilters = {}): Promise<CoverRequest[]> {
  const response = await apiClient.get<CoverRequest[] | PaginatedResponse<CoverRequest>>(
    'cover/requests/',
    { params: filters }
  )
  return unwrapList(response.data)
}

export async function getCoverRequest(id: number): Promise<CoverRequest> {
  const response = await apiClient.get<CoverRequest>(`cover/requests/${id}/`)
  return response.data
}

export async function createCoverRequest(data: {
  timetable_event: number
  urgency: string
  bonus_amount?: string
  notes?: string
}): Promise<CoverRequest> {
  const response = await apiClient.post<CoverRequest>('cover/requests/', data)
  return response.data
}

export async function acceptCoverOffer(requestId: number, offerId: number): Promise<CoverRequest> {
  const response = await apiClient.post<CoverRequest>(
    `cover/requests/${requestId}/accept/`,
    { offer_id: offerId }
  )
  return response.data
}

export async function listCoverOffers(): Promise<CoverOffer[]> {
  const response = await apiClient.get<CoverOffer[] | PaginatedResponse<CoverOffer>>('cover/offers/')
  return unwrapList(response.data)
}

export async function submitCoverOffer(requestId: number): Promise<CoverOffer> {
  const response = await apiClient.post<CoverOffer>(`cover/requests/${requestId}/offer/`)
  return response.data
}

export async function acceptCoverByCode(acceptCode: string): Promise<void> {
  // Public endpoint — no auth required
  await apiClient.post('cover/offers/accept-by-code/', { accept_code: acceptCode })
}

export async function cancelCoverRequest(
  requestId: number,
  cancellationReason: string
): Promise<CoverRequest> {
  const response = await apiClient.post<CoverRequest>(
    `cover/requests/${requestId}/cancel/`,
    { cancellation_reason: cancellationReason }
  )
  return response.data
}
