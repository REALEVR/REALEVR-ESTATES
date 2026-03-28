import { useState } from 'react'
import { Bell, CheckCheck, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useNotifications } from '@/hooks/useNotifications'
import NotificationItem from './NotificationItem'
import { useAuth } from '@/hooks/use-auth'

export default function NotificationCenter() {
    const { user } = useAuth()
    const [open, setOpen] = useState(false)
    const { notifications, unreadCount, isLoading, markRead, markAllRead, deleteNotification, clearAll } =
        useNotifications(20)

    if (!user) return null

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="relative rounded-full p-2 hover:bg-gray-100"
                    aria-label="Notifications"
                >
                    <Bell className="h-5 w-5 text-gray-700" />
                    {unreadCount > 0 && (
                        <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#FF5A5F] text-[10px] font-bold text-white">
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                    )}
                </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-80 p-0" sideOffset={8}>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b">
                    <h3 className="font-semibold text-gray-900">Notifications</h3>
                    <div className="flex items-center gap-1">
                        {unreadCount > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-gray-500 hover:text-gray-700"
                                onClick={() => markAllRead()}
                                title="Mark all as read"
                            >
                                <CheckCheck className="h-3.5 w-3.5 mr-1" />
                                All read
                            </Button>
                        )}
                        {notifications.length > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-gray-500 hover:text-red-500"
                                onClick={() => clearAll()}
                                title="Clear all notifications"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        )}
                    </div>
                </div>

                {/* Body */}
                <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
                    {isLoading ? (
                        <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
                    ) : notifications.length === 0 ? (
                        <div className="py-10 text-center">
                            <Bell className="mx-auto h-8 w-8 text-gray-300 mb-2" />
                            <p className="text-sm text-gray-400">No notifications yet</p>
                        </div>
                    ) : (
                        notifications.map((n) => (
                            <NotificationItem
                                key={n.id}
                                notification={n}
                                onMarkRead={markRead}
                                onDelete={deleteNotification}
                            />
                        ))
                    )}
                </div>

                {/* Footer */}
                {notifications.length > 0 && (
                    <div className="border-t px-4 py-2 text-center">
                        <span className="text-xs text-gray-400">{notifications.length} notification(s)</span>
                    </div>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
