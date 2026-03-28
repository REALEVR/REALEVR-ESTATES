import { formatDistanceToNow } from 'date-fns'
import { Bell, BookCheck, CreditCard, Home, Calendar, AlertCircle, X } from 'lucide-react'
import type { Notification } from '../../../shared/schemas/notification'
import { Link } from 'wouter'

interface NotificationItemProps {
    notification: Notification
    onMarkRead: (id: string) => void
    onDelete: (id: string) => void
}

const TYPE_ICONS: Record<Notification['type'], React.ReactNode> = {
    booking: <BookCheck className="h-4 w-4 text-blue-500" />,
    payment: <CreditCard className="h-4 w-4 text-green-500" />,
    property: <Home className="h-4 w-4 text-orange-500" />,
    viewing: <Calendar className="h-4 w-4 text-purple-500" />,
    system: <AlertCircle className="h-4 w-4 text-gray-500" />,
}

export default function NotificationItem({ notification, onMarkRead, onDelete }: NotificationItemProps) {
    const timeAgo = formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })

    const handleClick = () => {
        if (!notification.read) {
            onMarkRead(notification.id)
        }
    }

    const content = (
        <div
            className={`flex items-start gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors ${
                !notification.read ? 'bg-blue-50' : ''
            }`}
            onClick={handleClick}
        >
            <div className="mt-0.5 flex-shrink-0">
                {TYPE_ICONS[notification.type] ?? <Bell className="h-4 w-4 text-gray-400" />}
            </div>
            <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium text-gray-900 truncate ${!notification.read ? 'font-semibold' : ''}`}>
                    {notification.title}
                </p>
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notification.message}</p>
                <p className="text-xs text-gray-400 mt-1">{timeAgo}</p>
            </div>
            {!notification.read && (
                <span className="mt-1 h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" aria-label="Unread" />
            )}
            <button
                className="p-1 rounded hover:bg-gray-200 flex-shrink-0"
                onClick={(e) => {
                    e.stopPropagation()
                    onDelete(notification.id)
                }}
                aria-label="Delete notification"
            >
                <X className="h-3 w-3 text-gray-400" />
            </button>
        </div>
    )

    if (notification.link) {
        return <Link href={notification.link}>{content}</Link>
    }

    return content
}
