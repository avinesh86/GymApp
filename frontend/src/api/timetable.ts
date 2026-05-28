import apiClient from './client'
import type { PaginatedResponse, TimetableEvent, ClassType } from '../types'

function unwrapList<T>(data: T[] | PaginatedResponse<T>): T[] {
  return Array.isArray(data) ? data : data.results
}

export interface TimetableFilters {
  from?: string
  to?: string
  search?: string
  site?: number
  status?: string
  class_type?: number
  instructor?: number
  page?: number
  page_size?: number
}

export async function listEvents(filters: TimetableFilters = {}): Promise<TimetableEvent[]> {
  const response = await apiClient.get<TimetableEvent[] | PaginatedResponse<TimetableEvent>>(
    'timetable/events/',
    { params: filters }
  )
  return unwrapList(response.data)
}

export async function listEventsPaginated(
  filters: TimetableFilters = {}
): Promise<PaginatedResponse<TimetableEvent>> {
  const response = await apiClient.get<PaginatedResponse<TimetableEvent>>('timetable/events/', {
    params: filters,
  })
  return response.data
}

export async function getEvent(id: number): Promise<TimetableEvent> {
  const response = await apiClient.get<TimetableEvent>(`timetable/events/${id}/`)
  return response.data
}

export async function createEvent(data: Partial<TimetableEvent>): Promise<TimetableEvent> {
  const response = await apiClient.post<TimetableEvent>('timetable/events/', data)
  return response.data
}

export async function updateEvent(id: number, data: Partial<TimetableEvent>): Promise<TimetableEvent> {
  const response = await apiClient.patch<TimetableEvent>(`timetable/events/${id}/`, data)
  return response.data
}

export async function deleteEvent(id: number): Promise<void> {
  await apiClient.delete(`timetable/events/${id}/`)
}

export async function assignInstructor(eventId: number, instructorId: number): Promise<TimetableEvent> {
  const response = await apiClient.post<TimetableEvent>(
    `timetable/events/${eventId}/assign-instructor/`,
    { instructor_id: instructorId }
  )
  return response.data
}

export async function cancelEvent(eventId: number, reason?: string): Promise<TimetableEvent> {
  const response = await apiClient.post<TimetableEvent>(
    `timetable/events/${eventId}/cancel/`,
    { reason: reason ?? '' }
  )
  return response.data
}

// ─── Recurring Rules ──────────────────────────────────────────────────────────

export interface RecurringRulePayload {
  class_type: number
  site: number | null
  instructor: number | null
  /** 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun (Python weekday convention) */
  day_of_week: number
  start_time: string
  valid_from: string
  valid_to?: string | null
}

export async function createRecurringRule(data: RecurringRulePayload): Promise<{ id: number }> {
  const response = await apiClient.post<{ id: number }>('timetable/recurring-rules/', data)
  return response.data
}

export async function generateRuleEvents(ruleId: number): Promise<{ created: number }> {
  const response = await apiClient.post<{ created: number }>(
    `timetable/recurring-rules/${ruleId}/generate/`
  )
  return response.data
}

// ─── Class Types ─────────────────────────────────────────────────────────────

export async function listClassTypes(): Promise<ClassType[]> {
  const response = await apiClient.get<ClassType[] | PaginatedResponse<ClassType>>('timetable/class-types/')
  return unwrapList(response.data)
}

export async function createClassType(data: Partial<ClassType>): Promise<ClassType> {
  const response = await apiClient.post<ClassType>('timetable/class-types/', data)
  return response.data
}

export async function updateClassType(id: number, data: Partial<ClassType>): Promise<ClassType> {
  const response = await apiClient.patch<ClassType>(`timetable/class-types/${id}/`, data)
  return response.data
}

export async function deleteClassType(id: number): Promise<void> {
  await apiClient.delete(`timetable/class-types/${id}/`)
}
