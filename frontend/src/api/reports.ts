import apiClient, { LONG_REQUEST_TIMEOUT_MS } from './client'
import type {
  AttendanceReport,
  InstructorReliabilityReport,
  InstructorChartsReport,
  PayrollReport,
  ClassViabilityReport,
  ClassesReport,
  UnrecordedReport,
  PaginatedResponse,
  ReportFrequency,
  ReportSection,
  ReportSchedule,
  ReportScheduleInput,
} from '../types'

function unwrapList<T>(data: T[] | PaginatedResponse<T>): T[] {
  return Array.isArray(data) ? data : data.results
}

export async function getAttendanceReport(
  from: string,
  to: string,
  classType?: number
): Promise<AttendanceReport> {
  const response = await apiClient.get<AttendanceReport>('reports/attendance/', {
    params: { from, to, ...(classType ? { class_type: classType } : {}) },
  })
  return response.data
}

export async function getInstructorReliabilityReport(
  from?: string,
  to?: string
): Promise<InstructorReliabilityReport[]> {
  const response = await apiClient.get<InstructorReliabilityReport[] | PaginatedResponse<InstructorReliabilityReport>>(
    'reports/instructor-reliability/',
    { params: { from, to } }
  )
  return unwrapList(response.data)
}

export async function getInstructorCharts(
  from?: string,
  to?: string,
  instructor?: number
): Promise<InstructorChartsReport> {
  const response = await apiClient.get<InstructorChartsReport>('reports/instructor-charts/', {
    params: { from, to, instructor },
  })
  return response.data
}

export async function getPayrollReport(
  from?: string,
  to?: string,
  instructor?: number
): Promise<PayrollReport> {
  const response = await apiClient.get<PayrollReport>('reports/payroll/', {
    params: { from, to, instructor },
  })
  return response.data
}

export async function getClassViabilityReport(
  from?: string,
  to?: string
): Promise<ClassViabilityReport> {
  const response = await apiClient.get<ClassViabilityReport>('reports/class-viability/', {
    params: { from, to },
  })
  return response.data
}

export async function getClassesReport(
  from?: string,
  to?: string,
  classType?: number
): Promise<ClassesReport> {
  const response = await apiClient.get<ClassesReport>('reports/classes/', {
    params: { from, to, class_type: classType },
  })
  return response.data
}

export interface ClassTypeOption {
  id: number
  name: string
  color: string
}

export async function getClassTypes(): Promise<ClassTypeOption[]> {
  const response = await apiClient.get<ClassTypeOption[] | PaginatedResponse<ClassTypeOption>>(
    'timetable/class-types/'
  )
  return unwrapList(response.data)
}

/** Past classes with no attendance recorded, grouped by class, day and time. */
export async function getUnrecordedReport(from: string, to: string): Promise<UnrecordedReport> {
  const response = await apiClient.get<UnrecordedReport>('reports/unrecorded/', { params: { from, to } })
  return response.data
}

/** Class types the gym leaves out of the Attendance, Classes and Viability reports. */
export async function getReportClassFilter(): Promise<{ excluded_class_types: number[] }> {
  const response = await apiClient.get<{ excluded_class_types: number[] }>('reports/class-filter/')
  return response.data
}

export async function saveReportClassFilter(excluded: number[]): Promise<{ excluded_class_types: number[] }> {
  const response = await apiClient.put<{ excluded_class_types: number[] }>('reports/class-filter/', {
    excluded_class_types: excluded,
  })
  return response.data
}

// ─── Export & scheduled emails ───────────────────────────────────────────────

/** The report as a PDF for the day, week or month containing `date`. */
export async function exportReport(data: {
  frequency: ReportFrequency
  date: string
  sections: ReportSection[]
}): Promise<Blob> {
  const response = await apiClient.post('reports/export/', data, {
    responseType: 'blob',
    timeout: LONG_REQUEST_TIMEOUT_MS,
  })
  return response.data
}

export async function listReportSchedules(): Promise<ReportSchedule[]> {
  const response = await apiClient.get<ReportSchedule[] | PaginatedResponse<ReportSchedule>>('reports/schedules/')
  return unwrapList(response.data)
}

export async function createReportSchedule(data: ReportScheduleInput): Promise<ReportSchedule> {
  const response = await apiClient.post<ReportSchedule>('reports/schedules/', data)
  return response.data
}

export async function updateReportSchedule(id: number, data: Partial<ReportScheduleInput>): Promise<ReportSchedule> {
  const response = await apiClient.patch<ReportSchedule>(`reports/schedules/${id}/`, data)
  return response.data
}

export async function deleteReportSchedule(id: number): Promise<void> {
  await apiClient.delete(`reports/schedules/${id}/`)
}

/** Email the schedule's most recent full period now. */
export async function sendReportScheduleNow(id: number): Promise<{ detail: string }> {
  const response = await apiClient.post<{ detail: string }>(`reports/schedules/${id}/send-now/`)
  return response.data
}
