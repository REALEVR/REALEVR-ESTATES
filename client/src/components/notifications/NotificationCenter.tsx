import React, { useState, useEffect } from 'react'
import { Bell, Check, CheckCheck, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth'

interface Notification {
    id: string
    title: string
    message: string
    type: 'booking' | 'payment' | 'property' | 'viewing' | 'system'
    read: boolean
    link?: string
    createdAt: string
    relatedGateway?: 'flutterwave' | 'iotech'
}

export function NotificationCenter() {
    const { user } = useAuth()
    const { toast } = useToast()
    const [notifications, setNotifications] = useState<Notification[]>([])
    const [unreadCount, setUnreadCount] = useState(0)
    const [isOpen, setIsOpen] = useState(false)
    const [loading, setLoading] = useState(false)

    const fetchNotifications = async () => {
        if (!user) return
        try {
            setLoading(true)
            const res = await fetch('/api/notifications?limit=10')
            if (res.ok) {
                const data = await res.json()
                setNotifications(data.notifications || [])
                setUnreadCount(data.unreadCount || 0)
            }
        } catch (err) {
            console.error('Failed to fetch notifications:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (user) {
            fetchNotifications()
            // Poll every 30 seconds
            const interval = setInterval(fetchNotifications, 30000)
            return () => clearInterval(interval)
        }
    }, [user])

    const markAsRead = async (id: string) => {
        try {
            await fetch(`/api/notifications/mark-read/${id}`, { method: 'POST' })
            setNotifications((prev) =>
                prev.map((n) => (n.id === id ? { ...n, read: true } : n))
            )
            setUnreadCount((prev) => Math.max(0, prev - 1))
        } catch (err) {
            console.error('Failed to mark as read:', err)
        }
    }

    const markAllAsRead = async () => {
        try {
            await fetch('/api/notifications/mark-all-read', { method: 'POST' })
            setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
            setUnreadCount(0)
            toast({ title: 'All notifications marked as read' })
        } catch (err) {
            console.error('Failed to mark all as read:', err)
        }
    }

    const deleteNotification = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        try {
            await fetch(`/api/notifications/${id}`, { method: 'DELETE' })
            setNotifications((prev) => prev.filter((n) => n.id !== id))
            const wasUnread = notifications.find((n) => n.id === id && !n.read)
            if (wasUnread) setUnreadCount((prev) => Math.max(0, prev - 1))
        } catch (err) {
            console.error('Failed to delete notification:', err)
        }
    }

    const typeColors: Record<string, string> = {
        payment: 'bg-green-100 text-green-800',
        booking: 'bg-blue-100 text-blue-800',
        property: 'bg-purple-100 text-purple-800',
        viewing: 'bg-orange-100 text-orange-800',
        system: 'bg-gray-100 text-gray-800',
    }

    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr)
        const now = new Date()
        const diff = now.getTime() - date.getTime()
        const minutes = Math.floor(diff / 60000)
        const hours = Math.floor(minutes / 60)
        const days = Math.floor(hours / 24)

        if (days > 0) return `${days}d ago`
        if (hours > 0) return `${hours}h ago`
        if (minutes > 0) return `${minutes}m ago`
        return 'just now'
    }

    if (!user) return null

    return (
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="relative p-2">
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                        <Badge
                            variant="destructive"
                            className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
                        >
                            {unreadCount > 99 ? '99+' : unreadCount}
                        </Badge>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 p-0">
                <div className="flex items-center justify-between px-4 py-3 border-b">
                    <h3 className="font-semibold text-sm">Notifications</h3>
                    {unreadCount > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={markAllAsRead}
                            className="h-7 text-xs gap-1"
                        >
                            <CheckCheck className="h-3 w-3" />
                            Mark all read
                        </Button>
                    )}
                </div>

                <div className="max-h-96 overflow-y-auto">
                    {loading && notifications.length === 0 ? (
                        <div className="p-4 text-center text-sm text-gray-500">Loading...</div>
                    ) : notifications.length === 0 ? (
                        <div className="p-8 text-center">
                            <Bell className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                            <p className="text-sm text-gray-500">No notifications yet</p>
                        </div>
                    ) : (
                        notifications.map((notification) => (
                            <div
                                key={notification.id}
                                className={`flex items-start gap-3 px-4 py-3 border-b hover:bg-gray-50 cursor-pointer transition-colors ${
                                    !notification.read ? 'bg-blue-50/50' : ''
                                }`}
                                onClick={() => {
                                    if (!notification.read) markAsRead(notification.id)
                                    if (notification.link) window.location.href = notification.link
                                }}
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span
                                            className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                                                typeColors[notification.type] || typeColors.system
                                            }`}
                                        >
                                            {notification.type}
                                        </span>
                                        {!notification.read && (
                                            <span className="h-2 w-2 bg-blue-500 rounded-full flex-shrink-0" />
                                        )}
                                    </div>
                                    <p className="text-sm font-medium text-gray-900 truncate">
                                        {notification.title}
                                    </p>
                                    <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">
                                        {notification.message}
                                    </p>
                                    <p className="text-xs text-gray-400 mt-1">
                                        {formatTime(notification.createdAt)}
                                        {notification.relatedGateway && (
                                            <span className="ml-2 text-gray-400">
                                                via {notification.relatedGateway}
                                            </span>
                                        )}
                                    </p>
                                </div>
                                <button
                                    onClick={(e) => deleteNotification(notification.id, e)}
                                    className="flex-shrink-0 p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {notifications.length > 0 && (
                    <div className="px-4 py-2 border-t">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full text-xs text-gray-500"
                            onClick={() => {
                                setIsOpen(false)
                                window.location.href = '/dashboard'
                            }}
                        >
                            View all notifications
                        </Button>
                    </div>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

export default NotificationCenter
