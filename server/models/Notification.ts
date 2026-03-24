import { DynamoDBUtils, TABLES, generateId, generateTimestamp } from '../dynamodb'
import type { Notification, CreateNotificationInput } from '../../shared/schemas/notification'

const TABLE = (TABLES as any).NOTIFICATIONS as string

export async function createNotification(input: CreateNotificationInput): Promise<Notification> {
    const now = generateTimestamp()
    const notification: Notification = {
        id: generateId().toString(),
        userId: input.userId,
        title: input.title,
        message: input.message,
        type: input.type,
        read: false,
        data: input.data,
        link: input.link,
        createdAt: now,
        updatedAt: now,
    }
    await DynamoDBUtils.putItem(TABLE, notification as unknown as Record<string, unknown>)
    return notification
}

export async function getNotificationsForUser(
    userId: string,
    limit = 20
): Promise<Notification[]> {
    const items = await DynamoDBUtils.scanTable(
        TABLE,
        '#uid = :uid',
        { ':uid': userId },
        { '#uid': 'userId' }
    )
    // Sort by createdAt descending and apply limit
    const sorted = (items as unknown as Notification[]).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    return sorted.slice(0, limit)
}

export async function markNotificationRead(notificationId: string): Promise<void> {
    await DynamoDBUtils.updateItem(
        TABLE,
        { id: notificationId },
        'SET #r = :r, updatedAt = :u',
        { ':r': true, ':u': generateTimestamp() },
        { '#r': 'read' }
    )
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
    const notifications = await getNotificationsForUser(userId, 200)
    const unread = notifications.filter((n) => !n.read)
    await Promise.all(unread.map((n) => markNotificationRead(n.id)))
}

export async function deleteNotification(notificationId: string): Promise<void> {
    await DynamoDBUtils.deleteItem(TABLE, { id: notificationId })
}

export async function clearAllNotifications(userId: string): Promise<void> {
    const notifications = await getNotificationsForUser(userId, 500)
    await Promise.all(notifications.map((n) => deleteNotification(n.id)))
}

export async function countUnreadNotifications(userId: string): Promise<number> {
    const notifications = await getNotificationsForUser(userId, 200)
    return notifications.filter((n) => !n.read).length
}
