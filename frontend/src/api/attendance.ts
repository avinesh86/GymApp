import apiClient from './client'
import type { AttendanceRecord, PaginatedResponse } from '../types'

function unwrapList<T>(data: T[] | PaginatedResponse<T>): T[] {
  return Array.isArray(data) ? data : data.results
}

export interface AttendanceFilters {
  awaiting?: boolean
  event?: number
  date?: string
  from_datetime?: string
  to_datetime?: string
  count_only?: boolean
}

export async function listAttendance(filters: AttendanceFilters = {}): Promise<AttendanceRecord[]> {
  const response = await apiClient.get<AttendanceRecord[] | PaginatedResponse<AttendanceRecord>>(
    'attendance/records/',
    { params: filters }
  )
  return unwrapList(response.data)
}

/** Paged variant — keeps `count` so the caller can render page controls. */
export async function listAttendancePage(
  filters: AttendanceFilters & { page?: number; page_size?: number } = {}
): Promise<PaginatedResponse<AttendanceRecord>> {
  const response = await apiClient.get<AttendanceRecord[] | PaginatedResponse<AttendanceRecord>>(
    'attendance/records/',
    { params: filters }
  )
  return Array.isArray(response.data)
    ? { count: response.data.length, next: null, previous: null, results: response.data }
    : response.data
}

export async function countAwaitingAttendance(
  filters: { from_datetime?: string; to_datetime?: string } = {}
): Promise<number> {
  const response = await apiClient.get<{ count: number }>('attendance/records/', {
    params: { awaiting: true, count_only: true, ...filters },
  })
  return response.data.count
}

export async function createAttendance(data: {
  event: number
  count: number
}): Promise<AttendanceRecord> {
  const response = await apiClient.post<AttendanceRecord>('attendance/records/', data)
  return response.data
}

export async function updateAttendance(id: number, count: number): Promise<AttendanceRecord> {
  const response = await apiClient.patch<AttendanceRecord>(`attendance/records/${id}/`, { count })
  return response.data
}

export async function submitAttendanceForEvent(eventId: number, count: number): Promise<AttendanceRecord> {
  const response = await apiClient.post<AttendanceRecord>('attendance/records/submit-for-event/', { event: eventId, count })
  return response.data
}
