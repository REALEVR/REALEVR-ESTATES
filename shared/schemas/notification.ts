export type NotificationType = 'booking' | 'payment' | 'property' | 'viewing' | 'system'

export interface Notification {
    id: string
    userId: string
    title: string
    message: string
    type: NotificationType
    read: boolean
    data?: Record<string, any>
    link?: string
    createdAt: string
    updatedAt: string
}

export interface CreateNotificationInput {
    userId: string
    title: string
    message: string
    type: NotificationType
    data?: Record<string, any>
    link?: string
}
