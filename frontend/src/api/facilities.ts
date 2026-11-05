import apiClient from './client'
import type {
  Equipment,
  EquipmentOption,
  FacilitiesConfig,
  FacilitiesSummary,
  FaultBoardItem,
  FaultReport,
  PaginatedResponse,
} from '../types'

function unwrapList<T>(data: T[] | PaginatedResponse<T>): T[] {
  return Array.isArray(data) ? data : data.results
}

/** `site` narrows to one site; gym-wide records always show. */
export interface SiteFilter {
  site?: number | ''
}

function siteParams<T extends SiteFilter>(filters: T) {
  const params: Record<string, unknown> = { ...(filters as Record<string, unknown>) }
  if (params.site === '' || params.site === undefined) delete params.site
  return params
}

export async function getFacilitiesConfig(): Promise<FacilitiesConfig> {
  const response = await apiClient.get<FacilitiesConfig>('facilities/config/')
  return response.data
}

export async function getFacilitiesSummary(): Promise<FacilitiesSummary> {
  const response = await apiClient.get<FacilitiesSummary>('facilities/summary/')
  return response.data
}

// ─── Equipment ────────────────────────────────────────────────────────────────

export async function listEquipment(
  filters: SiteFilter & { status?: string; category?: string; search?: string } = {}
): Promise<Equipment[]> {
  const response = await apiClient.get<Equipment[] | PaginatedResponse<Equipment>>('facilities/equipment/', {
    params: { page_size: 200, ...siteParams(filters) },
  })
  return unwrapList(response.data)
}

export async function createEquipment(data: Partial<Equipment>): Promise<Equipment> {
  const response = await apiClient.post<Equipment>('facilities/equipment/', data)
  return response.data
}

export async function updateEquipment(id: number, data: Partial<Equipment>): Promise<Equipment> {
  const response = await apiClient.patch<Equipment>(`facilities/equipment/${id}/`, data)
  return response.data
}

export async function deleteEquipment(id: number): Promise<void> {
  await apiClient.delete(`facilities/equipment/${id}/`)
}

// ─── Maintenance (full fault records) ─────────────────────────────────────────

export async function listFaults(
  filters: SiteFilter & { status?: string; search?: string } = {}
): Promise<FaultReport[]> {
  const response = await apiClient.get<FaultReport[] | PaginatedResponse<FaultReport>>('facilities/faults/', {
    params: { page_size: 200, ...siteParams(filters) },
  })
  return unwrapList(response.data)
}

export async function updateFault(id: number, data: Partial<FaultReport>): Promise<FaultReport> {
  const response = await apiClient.patch<FaultReport>(`facilities/faults/${id}/`, data)
  return response.data
}

export async function deleteFault(id: number): Promise<void> {
  await apiClient.delete(`facilities/faults/${id}/`)
}

// ─── Fault board (every staff member) ─────────────────────────────────────────

export async function listFaultBoard(filters: SiteFilter = {}): Promise<FaultBoardItem[]> {
  const response = await apiClient.get<FaultBoardItem[]>('facilities/fault-board/', {
    params: siteParams(filters),
  })
  return response.data
}

export interface NewFault {
  equipment?: number | null
  site?: number | null
  title: string
  description?: string
  location?: string
  severity: FaultBoardItem['severity']
}

export async function reportFault(data: NewFault): Promise<FaultBoardItem> {
  const response = await apiClient.post<FaultBoardItem>('facilities/fault-board/', data)
  return response.data
}

export async function listReportableEquipment(): Promise<EquipmentOption[]> {
  const response = await apiClient.get<EquipmentOption[]>('facilities/fault-board/equipment/')
  return response.data
}
