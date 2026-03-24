export interface Notification {
    id: string
    userId: string
    title: string
    message: string
    type: 'booking' | 'payment' | 'property' | 'viewing' | 'system'
    status: 'pending' | 'sent' | 'read' | 'failed'
    channel: 'in-app' | 'email' | 'sms'
    relatedGateway?: 'flutterwave' | 'iotech'
    read: boolean
    data?: Record<string, any>
    link?: string
    createdAt: string
    sentAt?: string
    updatedAt: string
}

export interface CreateNotificationInput {
    userId: string
    title: string
    message: string
    type: Notification['type']
    channel?: Notification['channel']
    relatedGateway?: Notification['relatedGateway']
    data?: Record<string, any>
    link?: string
}

export interface NotificationLog {
    id: string
    notificationId: string
    userId: string
    channel: string
    status: 'success' | 'failed'
    errorMessage?: string
    createdAt: string
}
