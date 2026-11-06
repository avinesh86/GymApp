import apiClient from './client'
import type {
  ChecklistRun,
  ChecklistTemplate,
  Equipment,
  EquipmentHistory,
  EquipmentScan,
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

// ─── Equipment QR scan and history ────────────────────────────────────────────

export async function scanEquipment(id: number): Promise<EquipmentScan> {
  const response = await apiClient.get<EquipmentScan>(`facilities/equipment/${id}/scan/`)
  return response.data
}

export async function getEquipmentHistory(id: number): Promise<EquipmentHistory> {
  const response = await apiClient.get<EquipmentHistory>(`facilities/equipment/${id}/history/`)
  return response.data
}

// ─── Checklists ───────────────────────────────────────────────────────────────

export async function listChecklists(filters: SiteFilter = {}): Promise<ChecklistTemplate[]> {
  const response = await apiClient.get<ChecklistTemplate[] | PaginatedResponse<ChecklistTemplate>>(
    'facilities/checklists/',
    { params: { page_size: 200, ...siteParams(filters) } }
  )
  return unwrapList(response.data)
}

export type ChecklistInput = Omit<ChecklistTemplate, 'id' | 'site_name' | 'equipment_name' | 'open_overdue_count'>

export async function getChecklist(id: number): Promise<ChecklistTemplate> {
  const response = await apiClient.get<ChecklistTemplate>(`facilities/checklists/${id}/`)
  return response.data
}

export async function createChecklist(data: ChecklistInput): Promise<ChecklistTemplate> {
  const response = await apiClient.post<ChecklistTemplate>('facilities/checklists/', data)
  return response.data
}

export async function updateChecklist(id: number, data: Partial<ChecklistInput>): Promise<ChecklistTemplate> {
  const response = await apiClient.patch<ChecklistTemplate>(`facilities/checklists/${id}/`, data)
  return response.data
}

export async function deleteChecklist(id: number): Promise<void> {
  await apiClient.delete(`facilities/checklists/${id}/`)
}

/** Checks due now for the signed-in person: today's and overdue ones. */
export async function listMyChecks(): Promise<ChecklistRun[]> {
  const response = await apiClient.get<ChecklistRun[]>('facilities/checklist-runs/mine/')
  return response.data
}

export async function listChecklistRuns(
  filters: SiteFilter & { state?: 'open' | 'overdue' | 'done'; template?: number; from?: string; to?: string } = {}
): Promise<ChecklistRun[]> {
  const response = await apiClient.get<ChecklistRun[] | PaginatedResponse<ChecklistRun>>(
    'facilities/checklist-runs/',
    { params: { page_size: 100, ...siteParams(filters) } }
  )
  return unwrapList(response.data)
}

export interface CheckAnswerInput {
  item: number
  passed: boolean
  note?: string
}

export async function completeChecklistRun(
  id: number,
  answers: CheckAnswerInput[],
  notes = ''
): Promise<ChecklistRun> {
  const response = await apiClient.post<ChecklistRun>(`facilities/checklist-runs/${id}/complete/`, {
    answers,
    notes,
  })
  return response.data
}

export async function uploadCheckPhoto(answerId: number, file: File): Promise<void> {
  const body = new FormData()
  body.append('photo', file)
  await apiClient.post(`facilities/checklist-answers/${answerId}/photo/`, body, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}
