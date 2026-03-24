import { Router } from 'express'
import {
    getNotificationsForUser,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
    clearAllNotifications,
} from '../models/Notification'
import { DynamoDBUtils, TABLES } from '../dynamodb'

const router = Router()

// GET /api/notifications - Fetch user's notifications (paginated)
router.get('/', async (req: any, res: any) => {
    try {
        const user = req.user
        if (!user) {
            return res.status(401).json({ message: 'Not authenticated' })
        }
        const limit = parseInt((req.query.limit as string) || '20', 10)
        const notifications = await getNotificationsForUser(user.id, limit)
        const unreadCount = notifications.filter((n) => !n.read).length
        res.json({ notifications, unreadCount })
    } catch (error: any) {
        console.error('[Notifications] Error fetching notifications:', error)
        res.status(500).json({ message: error.message })
    }
})

// POST /api/notifications/mark-read/:notificationId - Mark single notification as read
router.post('/mark-read/:notificationId', async (req: any, res: any) => {
    try {
        const user = req.user
        if (!user) {
            return res.status(401).json({ message: 'Not authenticated' })
        }
        const { notificationId } = req.params
        // Verify ownership before mutating
        const notification = await DynamoDBUtils.getItem(
            (TABLES as any).NOTIFICATIONS,
            { id: notificationId }
        ) as any
        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' })
        }
        if (notification.userId !== user.id) {
            return res.status(403).json({ message: 'Forbidden' })
        }
        await markNotificationRead(notificationId)
        res.json({ message: 'Notification marked as read' })
    } catch (error: any) {
        console.error('[Notifications] Error marking notification as read:', error)
        res.status(500).json({ message: error.message })
    }
})

// POST /api/notifications/mark-all-read - Mark all user notifications as read
router.post('/mark-all-read', async (req: any, res: any) => {
    try {
        const user = req.user
        if (!user) {
            return res.status(401).json({ message: 'Not authenticated' })
        }
        await markAllNotificationsRead(user.id)
        res.json({ message: 'All notifications marked as read' })
    } catch (error: any) {
        console.error('[Notifications] Error marking all notifications as read:', error)
        res.status(500).json({ message: error.message })
    }
})

// DELETE /api/notifications/clear-all - Clear all notifications for user
router.delete('/clear-all', async (req: any, res: any) => {
    try {
        const user = req.user
        if (!user) {
            return res.status(401).json({ message: 'Not authenticated' })
        }
        await clearAllNotifications(user.id)
        res.json({ message: 'All notifications cleared' })
    } catch (error: any) {
        console.error('[Notifications] Error clearing all notifications:', error)
        res.status(500).json({ message: error.message })
    }
})

// DELETE /api/notifications/:notificationId - Delete single notification
router.delete('/:notificationId', async (req: any, res: any) => {
    try {
        const user = req.user
        if (!user) {
            return res.status(401).json({ message: 'Not authenticated' })
        }
        const { notificationId } = req.params
        // Verify ownership before deleting
        const notification = await DynamoDBUtils.getItem(
            (TABLES as any).NOTIFICATIONS,
            { id: notificationId }
        ) as any
        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' })
        }
        if (notification.userId !== user.id) {
            return res.status(403).json({ message: 'Forbidden' })
        }
        await deleteNotification(notificationId)
        res.json({ message: 'Notification deleted' })
    } catch (error: any) {
        console.error('[Notifications] Error deleting notification:', error)
        res.status(500).json({ message: error.message })
    }
})

export default router
