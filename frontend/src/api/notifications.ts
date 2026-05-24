import apiClient from './client'
import type { AppNotification, PaginatedResponse } from '../types'

export async function listNotifications(page = 1): Promise<PaginatedResponse<AppNotification>> {
  const response = await apiClient.get<PaginatedResponse<AppNotification>>('notifications/', {
    params: { page, page_size: 10 },
  })
  return response.data
}

export async function markNotificationRead(id: number): Promise<AppNotification> {
  const response = await apiClient.patch<AppNotification>(`notifications/${id}/`, {
    is_read: true,
  })
  return response.data
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiClient.post('notifications/mark-all-read/')
}

export async function acceptCoverFromNotification(notificationId: number): Promise<void> {
  await apiClient.post(`notifications/${notificationId}/accept-cover/`)
}
