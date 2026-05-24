import React, { useState, useRef, useEffect } from 'react'
import { Bell } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listNotifications, markAllNotificationsRead, acceptCoverFromNotification } from '../../api/notifications'
import { useAuth } from '../../hooks/useAuth'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'

interface TopBarProps {
  title?: string
}

export function TopBar({ title }: TopBarProps) {
  const [panelOpen, setPanelOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const { data: notificationsPage } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => listNotifications(),
    refetchInterval: 60_000,
    enabled: !!user,
  })

  const notifications = notificationsPage?.results ?? []
  const unreadCount = notifications.filter((n) => !n.is_read).length

  const { mutate: markAllRead } = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const { mutate: acceptCover, isPending: isAccepting } = useMutation({
    mutationFn: (notificationId: number) => acceptCoverFromNotification(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['cover-requests'] })
      toast.success('Cover accepted — you\'re confirmed!')
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Failed to accept cover — slot may already be filled.'
      toast.error(message)
    },
  })

  // Close panel on outside click
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setPanelOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <header className="h-14 bg-[#0A0D14] border-b border-white/10 flex items-center justify-between px-6 sticky top-0 z-30">
      <h1 className="text-base font-semibold text-white">{title}</h1>

      <div className="relative" ref={panelRef}>
        <button
          onClick={() => setPanelOpen((open) => !open)}
          className="relative p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500" />
          )}
        </button>

        {panelOpen && (
          <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllRead()}
                  className="text-xs text-cyan-600 hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
              {notifications.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">
                  No notifications yet
                </p>
              ) : (
                notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={[
                      'px-4 py-3 hover:bg-gray-50 transition-colors',
                      !notification.is_read ? 'bg-cyan-50/30' : '',
                    ].join(' ')}
                  >
                    <p className="text-sm font-medium text-gray-900">{notification.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notification.body}</p>
                    <div className="flex items-center justify-between mt-1.5">
                      <p className="text-xs text-gray-400">
                        {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                      </p>
                      {notification.action_type === 'accept_cover' && !notification.is_read && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            acceptCover(notification.id)
                          }}
                          disabled={isAccepting}
                          className="text-xs font-semibold text-white bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 px-3 py-1 rounded-full transition-colors"
                        >
                          Take Cover
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
