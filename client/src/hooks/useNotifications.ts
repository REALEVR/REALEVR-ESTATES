import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'
import type { Notification } from '../../../shared/schemas/notification'

interface NotificationsResponse {
    notifications: Notification[]
    unreadCount: number
}

export function useNotifications(limit = 20) {
    const queryClient = useQueryClient()

    const { data, isLoading, error } = useQuery<NotificationsResponse>({
        queryKey: ['/api/notifications', limit],
        queryFn: async () => {
            const res = await fetch(`/api/notifications?limit=${limit}`, { credentials: 'include' })
            if (!res.ok) {
                if (res.status === 401) return { notifications: [], unreadCount: 0 }
                throw new Error('Failed to fetch notifications')
            }
            return res.json()
        },
        refetchInterval: 30_000, // Poll every 30 seconds
        staleTime: 15_000,
    })

    const markReadMutation = useMutation({
        mutationFn: (notificationId: string) =>
            apiRequest('POST', `/api/notifications/mark-read/${notificationId}`),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/notifications'] }),
    })

    const markAllReadMutation = useMutation({
        mutationFn: () => apiRequest('POST', '/api/notifications/mark-all-read'),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/notifications'] }),
    })

    const deleteNotificationMutation = useMutation({
        mutationFn: (notificationId: string) =>
            apiRequest('DELETE', `/api/notifications/${notificationId}`),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/notifications'] }),
    })

    const clearAllMutation = useMutation({
        mutationFn: () => apiRequest('DELETE', '/api/notifications/clear-all'),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/notifications'] }),
    })

    return {
        notifications: data?.notifications ?? [],
        unreadCount: data?.unreadCount ?? 0,
        isLoading,
        error,
        markRead: markReadMutation.mutate,
        markAllRead: markAllReadMutation.mutate,
        deleteNotification: deleteNotificationMutation.mutate,
        clearAll: clearAllMutation.mutate,
    }
}
