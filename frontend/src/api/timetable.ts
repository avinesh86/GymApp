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
  /** When 'true', returns only past, non-cancelled events with no attendance recorded yet. */
  awaiting?: 'true'
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

export async function getWeekEvents(filters: TimetableFilters = {}): Promise<TimetableEvent[]> {
  // Unpaginated endpoint — returns every event in the week (from .. from+6),
  // so the calendar isn't truncated by page size. Accepts the same filters.
  const response = await apiClient.get<TimetableEvent[]>('timetable/events/week/', {
    params: filters,
  })
  return response.data
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

// ─── Recurring series ─────────────────────────────────────────────────────────

/** Which classes in a recurring series a change applies to. Changing only the
 * one class uses updateEvent / deleteEvent. */
export type SeriesScope = 'following' | 'all'

export interface SeriesChanges {
  /** Gym wall-clock time, HH:MM */
  start_time?: string
  end_time?: string
  site?: number | null
  notes?: string
  internal_notes?: string
}

export async function updateEventSeries(
  eventId: number,
  scope: SeriesScope,
  changes: SeriesChanges,
): Promise<{ updated: number }> {
  const response = await apiClient.post<{ updated: number }>(
    `timetable/events/${eventId}/update-series/`,
    { scope, ...changes }
  )
  return response.data
}

export async function deleteEventSeries(eventId: number, scope: SeriesScope): Promise<{ deleted: number }> {
  const response = await apiClient.post<{ deleted: number }>(
    `timetable/events/${eventId}/delete-series/`,
    { scope }
  )
  return response.data
}

export async function assignInstructor(
  eventId: number,
  instructorId: number | null,
): Promise<TimetableEvent> {
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
  end_time?: string | null
  valid_from: string
  valid_to?: string | null
  /** Pass the first rule's series_id when creating the other days of the same
   * class, so they edit and delete together. Omit to start a new series. */
  series_id?: string
}

export async function createRecurringRule(
  data: RecurringRulePayload,
): Promise<{ id: number; series_id: string }> {
  const response = await apiClient.post<{ id: number; series_id: string }>('timetable/recurring-rules/', data)
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
