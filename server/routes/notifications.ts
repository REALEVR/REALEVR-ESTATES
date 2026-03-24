import type { Express, Request, Response } from 'express'
import { notificationService } from '../services/notificationService.js'

export function registerNotificationRoutes(app: Express): void {
    // GET /api/notifications - paginated fetch
    app.get('/api/notifications', async (req: Request, res: Response) => {
        if (!req.isAuthenticated()) {
            return res.status(401).json({ message: 'Not authenticated' })
        }

        try {
            const user = req.user as any
            const limit = parseInt(req.query.limit as string) || 20
            const offset = parseInt(req.query.offset as string) || 0

            const notifications = await notificationService.getNotificationsForUser(
                String(user.id),
                limit,
                offset
            )

            const unreadCount = await notificationService.getUnreadCount(String(user.id))

            return res.json({ notifications, unreadCount })
        } catch (error: any) {
            return res.status(500).json({ message: error.message })
        }
    })

    // POST /api/notifications/mark-read/:id
    app.post('/api/notifications/mark-read/:id', async (req: Request, res: Response) => {
        if (!req.isAuthenticated()) {
            return res.status(401).json({ message: 'Not authenticated' })
        }

        try {
            const user = req.user as any
            await notificationService.markAsRead(req.params.id, String(user.id))
            return res.json({ success: true })
        } catch (error: any) {
            return res.status(500).json({ message: error.message })
        }
    })

    // POST /api/notifications/mark-all-read
    app.post('/api/notifications/mark-all-read', async (req: Request, res: Response) => {
        if (!req.isAuthenticated()) {
            return res.status(401).json({ message: 'Not authenticated' })
        }

        try {
            const user = req.user as any
            await notificationService.markAllAsRead(String(user.id))
            return res.json({ success: true })
        } catch (error: any) {
            return res.status(500).json({ message: error.message })
        }
    })

    // DELETE /api/notifications/:id
    app.delete('/api/notifications/:id', async (req: Request, res: Response) => {
        if (!req.isAuthenticated()) {
            return res.status(401).json({ message: 'Not authenticated' })
        }

        try {
            const user = req.user as any
            await notificationService.deleteNotification(req.params.id, String(user.id))
            return res.json({ success: true })
        } catch (error: any) {
            return res.status(500).json({ message: error.message })
        }
    })

    // GET /api/notifications/unread-count
    app.get('/api/notifications/unread-count', async (req: Request, res: Response) => {
        if (!req.isAuthenticated()) {
            return res.status(401).json({ message: 'Not authenticated' })
        }

        try {
            const user = req.user as any
            const count = await notificationService.getUnreadCount(String(user.id))
            return res.json({ count })
        } catch (error: any) {
            return res.status(500).json({ message: error.message })
        }
    })

    console.log('✅ Notification routes registered')
}
