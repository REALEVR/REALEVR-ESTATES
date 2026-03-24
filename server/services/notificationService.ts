import { nanoid } from 'nanoid'
import { DynamoDBUtils, TABLES } from '../dynamodb.js'
import type { Notification, CreateNotificationInput, NotificationLog } from '../models/Notification.js'
import { sendEmail } from '../email-service.js'

export class NotificationService {
    async createNotification(input: CreateNotificationInput): Promise<Notification> {
        const now = new Date().toISOString()
        const notification: Notification = {
            id: nanoid(),
            userId: input.userId,
            title: input.title,
            message: input.message,
            type: input.type,
            status: 'pending',
            channel: input.channel || 'in-app',
            relatedGateway: input.relatedGateway,
            read: false,
            data: input.data,
            link: input.link,
            createdAt: now,
            updatedAt: now,
        }

        await DynamoDBUtils.putItem(TABLES.NOTIFICATIONS, notification as unknown as Record<string, unknown>)

        if (notification.channel === 'email' && input.data?.email) {
            await this.sendEmailNotification(notification, input.data.email)
        }

        return notification
    }

    private async sendEmailNotification(notification: Notification, email: string): Promise<void> {
        try {
            await sendEmail({
                to: email,
                subject: notification.title,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background-color: #FF5A5F; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                            <h2>REALEVR Estates</h2>
                        </div>
                        <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
                            <h3>${notification.title}</h3>
                            <p>${notification.message}</p>
                            ${notification.link ? `<a href="${notification.link}" style="display: inline-block; background-color: #FF5A5F; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0;">View Details</a>` : ''}
                        </div>
                    </div>
                `,
            })

            await DynamoDBUtils.updateItem(
                TABLES.NOTIFICATIONS,
                { id: notification.id },
                'SET #status = :status, sentAt = :sentAt, updatedAt = :updatedAt',
                { ':status': 'sent', ':sentAt': new Date().toISOString(), ':updatedAt': new Date().toISOString() },
                { '#status': 'status' }
            )
        } catch (error) {
            console.error('[NotificationService] Failed to send email notification:', error)
        }
    }

    async getNotificationsForUser(userId: string, limit = 20, offset = 0): Promise<Notification[]> {
        const items = await DynamoDBUtils.scanTable(
            TABLES.NOTIFICATIONS,
            'userId = :userId',
            { ':userId': userId }
        )
        return (items as Notification[])
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(offset, offset + limit)
    }

    async markAsRead(notificationId: string, userId: string): Promise<void> {
        await DynamoDBUtils.updateItem(
            TABLES.NOTIFICATIONS,
            { id: notificationId },
            'SET #read = :read, #status = :status, updatedAt = :updatedAt',
            { ':read': true, ':status': 'read', ':updatedAt': new Date().toISOString() },
            { '#read': 'read', '#status': 'status' }
        )
    }

    async markAllAsRead(userId: string): Promise<void> {
        const notifications = await this.getNotificationsForUser(userId, 100)
        const unread = notifications.filter((n) => !n.read)
        await Promise.all(unread.map((n) => this.markAsRead(n.id, userId)))
    }

    async deleteNotification(notificationId: string, userId: string): Promise<void> {
        await DynamoDBUtils.deleteItem(TABLES.NOTIFICATIONS, { id: notificationId })
    }

    async getUnreadCount(userId: string): Promise<number> {
        const notifications = await this.getNotificationsForUser(userId, 100)
        return notifications.filter((n) => !n.read).length
    }

    async createPaymentNotification(params: {
        userId: string
        gateway: 'flutterwave' | 'iotech'
        amount: number
        currency: string
        status: 'completed' | 'failed' | 'refunded'
        txRef: string
        email?: string
    }): Promise<Notification> {
        const titles = {
            completed: '✅ Payment Successful',
            failed: '❌ Payment Failed',
            refunded: '↩️ Payment Refunded',
        }
        const messages = {
            completed: `Your payment of ${params.currency} ${params.amount.toLocaleString()} via ${params.gateway} was successful. Reference: ${params.txRef}`,
            failed: `Your payment of ${params.currency} ${params.amount.toLocaleString()} via ${params.gateway} failed. Please try again. Reference: ${params.txRef}`,
            refunded: `Your payment of ${params.currency} ${params.amount.toLocaleString()} via ${params.gateway} has been refunded. Reference: ${params.txRef}`,
        }

        return this.createNotification({
            userId: params.userId,
            title: titles[params.status],
            message: messages[params.status],
            type: 'payment',
            channel: params.email ? 'email' : 'in-app',
            relatedGateway: params.gateway,
            data: { email: params.email, txRef: params.txRef, amount: params.amount },
            link: '/dashboard',
        })
    }
}

export const notificationService = new NotificationService()
