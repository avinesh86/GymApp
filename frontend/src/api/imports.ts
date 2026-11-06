import apiClient from './client'
import type { ImportJob, ImportType } from '../types'

export async function createImportJob(
  importType: ImportType,
  file: File
): Promise<ImportJob> {
  const formData = new FormData()
  formData.append('import_type', importType)
  formData.append('file', file)

  const response = await apiClient.post<ImportJob>('imports/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return response.data
}

export async function getImportJob(id: number): Promise<ImportJob> {
  const response = await apiClient.get<ImportJob>(`imports/${id}/`)
  return response.data
}

export async function downloadTemplate(importType: ImportType): Promise<Blob> {
  const response = await apiClient.get(`imports/templates/${importType}/`, {
    responseType: 'blob',
  })
  return response.data
}
