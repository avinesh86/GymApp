import apiClient from './client'
import type {
  AttendanceReport,
  InstructorReliabilityReport,
  PayrollReport,
  ClassViabilityReport,
  ClassesReport,
  PaginatedResponse,
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

export async function getPayrollReport(from?: string, to?: string): Promise<PayrollReport> {
  const response = await apiClient.get<PayrollReport>('reports/payroll/', {
    params: { from, to },
  })
  return response.data
}

export async function getClassViabilityReport(
  from?: string,
  to?: string
): Promise<ClassViabilityReport[]> {
  const response = await apiClient.get<ClassViabilityReport[] | PaginatedResponse<ClassViabilityReport>>('reports/class-viability/', {
    params: { from, to },
  })
  return unwrapList(response.data)
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
