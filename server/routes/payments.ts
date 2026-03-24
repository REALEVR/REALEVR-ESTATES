import type { Express, Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import { PaymentService } from '../services/paymentService'
import { PaymentModel } from '../models/Payment'
import { AuditLogModel } from '../models/AuditLog'
import { DynamoDBUtils, TABLES } from '../dynamodb'
import type { Notification } from '../../shared/schemas/payment'

// ─── Rate limiters ────────────────────────────────────────────────────────────

const webhookLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests, please try again later' },
})

const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests, please try again later' },
})

const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests, please try again later' },
})

// ─── Middleware helpers ───────────────────────────────────────────────────────

function requireAuth(req: Request, res: Response): boolean {
    if (!req.isAuthenticated()) {
        res.status(401).json({ message: 'Not authenticated' })
        return false
    }
    return true
}

function requireAdmin(req: Request, res: Response): boolean {
    if (!requireAuth(req, res)) return false
    const user = req.user as { role?: string }
    if (user.role !== 'admin') {
        res.status(403).json({ message: 'Admin role required' })
        return false
    }
    return true
}

// ─── Route Registration ───────────────────────────────────────────────────────

export function registerPaymentRoutes(app: Express): void {
    /**
     * POST /api/webhooks/flutterwave
     * Handles Flutterwave payment webhook with signature verification.
     * Uses atomic batch operations to ensure data consistency.
     */
    app.post('/api/webhooks/flutterwave', webhookLimiter, async (req: Request, res: Response) => {
        try {
            const secretHash = process.env.FLUTTERWAVE_WEBHOOK_SECRET || process.env.FLUTTERWAVE_SECRET_KEY
            if (secretHash) {
                const signature = req.headers['verif-hash'] as string
                if (!signature || signature !== secretHash) {
                    return res.status(401).json({ message: 'Invalid webhook signature' })
                }
            }

            const event = req.body as {
                event: string
                data: {
                    id: number
                    tx_ref: string
                    flw_ref: string
                    status: string
                    amount: number
                    currency: string
                    customer: { id: number; email: string }
                    meta?: Record<string, unknown>
                }
            }

            if (event.event !== 'charge.completed') {
                return res.status(200).json({ message: 'Event ignored' })
            }

            const { data } = event
            if (data.status !== 'successful') {
                return res.status(200).json({ message: 'Payment not successful, ignored' })
            }

            const meta = data.meta ?? {}
            const bookingId = meta.bookingId as string | undefined
            const tenantId = meta.tenantId as string | undefined
            const landlordId = meta.landlordId as string | undefined
            const propertyId = meta.propertyId as string | undefined

            const { payment, alreadyProcessed } = await PaymentService.processPaymentAtomically({
                transactionId: String(data.id),
                amount: data.amount,
                currency: data.currency,
                method: 'flutterwave',
                type: (meta.paymentType as 'deposit' | 'rent' | 'full') ?? 'deposit',
                bookingId,
                tenantId,
                landlordId,
                propertyId,
                metadata: { flw_ref: data.flw_ref, tx_ref: data.tx_ref, ...meta },
            })

            return res.status(200).json({
                message: alreadyProcessed ? 'Already processed' : 'Payment processed',
                paymentId: payment.id,
            })
        } catch (err: unknown) {
            console.error('[webhook/flutterwave]', err)
            return res.status(500).json({ message: 'Webhook processing failed' })
        }
    })

    /**
     * POST /api/admin/confirm-payment
     * Manual payment confirmation (admin only). Triggers atomic updates.
     */
    app.post('/api/admin/confirm-payment', adminLimiter, async (req: Request, res: Response) => {
        if (!requireAdmin(req, res)) return

        try {
            const {
                transactionId,
                amount,
                currency = 'UGX',
                method = 'bank_transfer',
                type = 'deposit',
                bookingId,
                tenantId,
                landlordId,
                propertyId,
            } = req.body as {
                transactionId: string
                amount: number
                currency?: string
                method?: 'flutterwave' | 'stripe' | 'bank_transfer' | 'iotec'
                type?: 'deposit' | 'rent' | 'full' | 'subscription'
                bookingId?: string
                tenantId?: string
                landlordId?: string
                propertyId?: string
            }

            if (!transactionId || !amount) {
                return res.status(400).json({ message: 'transactionId and amount are required' })
            }

            const { payment, alreadyProcessed } = await PaymentService.processPaymentAtomically({
                transactionId,
                amount,
                currency,
                method,
                type,
                bookingId,
                tenantId,
                landlordId,
                propertyId,
                metadata: { confirmedBy: (req.user as { id: number }).id, manual: true },
            })

            return res.status(200).json({
                message: alreadyProcessed ? 'Payment was already processed' : 'Payment confirmed successfully',
                payment,
            })
        } catch (err: unknown) {
            console.error('[admin/confirm-payment]', err)
            return res.status(500).json({ message: 'Failed to confirm payment' })
        }
    })

    /**
     * POST /api/payments/:paymentId/refund
     * Refund a payment with atomic multi-document updates.
     */
    app.post('/api/payments/:paymentId/refund', adminLimiter, async (req: Request, res: Response) => {
        if (!requireAdmin(req, res)) return

        try {
            const { paymentId } = req.params
            const { reason } = req.body as { reason?: string }
            const requestedBy = String((req.user as { id: number }).id)

            const refundedPayment = await PaymentService.processRefundAtomically({
                paymentId,
                requestedBy,
                reason,
            })

            return res.status(200).json({
                message: 'Refund processed successfully',
                payment: refundedPayment,
            })
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Refund failed'
            return res.status(400).json({ message: msg })
        }
    })

    /**
     * GET /api/payments/:bookingId/history
     * View payment history for a booking.
     */
    app.get('/api/payments/:bookingId/history', apiLimiter, async (req: Request, res: Response) => {
        if (!requireAuth(req, res)) return

        try {
            const { bookingId } = req.params
            const payments = await PaymentModel.getByBookingId(bookingId)
            return res.status(200).json({ payments })
        } catch (err: unknown) {
            console.error('[payments/history]', err)
            return res.status(500).json({ message: 'Failed to fetch payment history' })
        }
    })

    /**
     * GET /api/admin/audit-logs
     * View transaction audit trail (admin only).
     */
    app.get('/api/admin/audit-logs', adminLimiter, async (req: Request, res: Response) => {
        if (!requireAdmin(req, res)) return

        try {
            const limit = Number(req.query.limit) || 100
            const logs = await AuditLogModel.getAll(limit)
            return res.status(200).json({ logs })
        } catch (err: unknown) {
            console.error('[admin/audit-logs]', err)
            return res.status(500).json({ message: 'Failed to fetch audit logs' })
        }
    })

    /**
     * GET /api/notifications
     * Get notifications for the current user.
     */
    app.get('/api/notifications', apiLimiter, async (req: Request, res: Response) => {
        if (!requireAuth(req, res)) return

        try {
            const userId = String((req.user as { id: number }).id)
            const items = await DynamoDBUtils.queryTable(
                TABLES.NOTIFICATIONS,
                'userId = :uid',
                { ':uid': userId },
            )
            const notifications = (items as Notification[]).sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            )
            return res.status(200).json({ notifications })
        } catch (err: unknown) {
            console.error('[notifications]', err)
            return res.status(500).json({ message: 'Failed to fetch notifications' })
        }
    })

    /**
     * PATCH /api/notifications/:notificationId/read
     * Mark a notification as read.
     */
    app.patch('/api/notifications/:notificationId/read', apiLimiter, async (req: Request, res: Response) => {
        if (!requireAuth(req, res)) return

        try {
            const { notificationId } = req.params
            const userId = String((req.user as { id: number }).id)

            await DynamoDBUtils.updateItem(
                TABLES.NOTIFICATIONS,
                { userId, id: notificationId },
                'SET #read = :r',
                { ':r': true },
                { '#read': 'read' },
            )

            return res.status(200).json({ message: 'Notification marked as read' })
        } catch (err: unknown) {
            console.error('[notifications/read]', err)
            return res.status(500).json({ message: 'Failed to update notification' })
        }
    })

    /**
     * PATCH /api/notifications/read-all
     * Mark all notifications as read for the current user.
     */
    app.patch('/api/notifications/read-all', apiLimiter, async (req: Request, res: Response) => {
        if (!requireAuth(req, res)) return

        try {
            const userId = String((req.user as { id: number }).id)
            const items = await DynamoDBUtils.queryTable(
                TABLES.NOTIFICATIONS,
                'userId = :uid',
                { ':uid': userId },
            )
            const unread = (items as Notification[]).filter((n) => !n.read)

            await Promise.all(
                unread.map((n) =>
                    DynamoDBUtils.updateItem(
                        TABLES.NOTIFICATIONS,
                        { userId, id: n.id },
                        'SET #read = :r',
                        { ':r': true },
                        { '#read': 'read' },
                    ),
                ),
            )

            return res.status(200).json({ message: `Marked ${unread.length} notifications as read` })
        } catch (err: unknown) {
            console.error('[notifications/read-all]', err)
            return res.status(500).json({ message: 'Failed to update notifications' })
        }
    })

    /**
     * POST /api/bookings
     * Create a new booking.
     */
    app.post('/api/bookings', apiLimiter, async (req: Request, res: Response) => {
        if (!requireAuth(req, res)) return

        try {
            const {
                propertyId,
                landlordId,
                startDate,
                endDate,
                totalAmount,
                currency = 'UGX',
            } = req.body as {
                propertyId: string
                landlordId?: string
                startDate: string
                endDate?: string
                totalAmount: number
                currency?: string
            }

            if (!propertyId || !startDate || !totalAmount) {
                return res.status(400).json({ message: 'propertyId, startDate, and totalAmount are required' })
            }

            const tenantId = String((req.user as { id: number }).id)
            const booking = await PaymentService.createBooking({
                propertyId,
                tenantId,
                landlordId,
                startDate,
                endDate,
                totalAmount,
                currency,
                status: 'pending',
                depositPaid: false,
                escrowStatus: 'pending',
                escrowAmount: 0,
                paymentHistory: [],
            })

            return res.status(201).json({ booking })
        } catch (err: unknown) {
            console.error('[bookings/create]', err)
            return res.status(500).json({ message: 'Failed to create booking' })
        }
    })

    /**
     * GET /api/bookings/:bookingId
     * Get a booking by ID.
     */
    app.get('/api/bookings/:bookingId', apiLimiter, async (req: Request, res: Response) => {
        if (!requireAuth(req, res)) return

        try {
            const { bookingId } = req.params
            const booking = await PaymentService.getBooking(bookingId)

            if (!booking) {
                return res.status(404).json({ message: 'Booking not found' })
            }

            return res.status(200).json({ booking })
        } catch (err: unknown) {
            console.error('[bookings/get]', err)
            return res.status(500).json({ message: 'Failed to fetch booking' })
        }
    })
}
