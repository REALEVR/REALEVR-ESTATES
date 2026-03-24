import { nanoid } from 'nanoid'
import { DynamoDBUtils, TABLES } from '../dynamodb'
import { PaymentModel } from '../models/Payment'
import { AuditLogModel } from '../models/AuditLog'
import type { Payment, Booking, Notification } from '../../shared/schemas/payment'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildNotification(
    id: string,
    userId: string,
    title: string,
    message: string,
    type: Notification['type'],
    link?: string,
): Notification {
    return {
        id,
        userId,
        title,
        message,
        type,
        read: false,
        createdAt: new Date().toISOString(),
        link,
        metadata: {},
    }
}

// ─── Payment Service ──────────────────────────────────────────────────────────

export const PaymentService = {
    /**
     * Process a payment atomically using DynamoDB TransactWrite.
     * All-or-nothing: either every write succeeds or none do.
     *
     * Flow:
     *  1. Check idempotency – reject duplicate transactionId
     *  2. Create payment record (status: completed)
     *  3. Update booking – depositPaid: true, escrowStatus: held
     *  4. Update property status
     *  5. Create tenant notification
     *  6. Create landlord notification
     *  7. Write audit log
     */
    async processPaymentAtomically(params: {
        transactionId: string
        amount: number
        currency: string
        method: Payment['method']
        type: Payment['type']
        bookingId?: string
        tenantId?: string
        landlordId?: string
        propertyId?: string
        metadata?: Record<string, unknown>
    }): Promise<{ payment: Payment; alreadyProcessed: boolean }> {
        const {
            transactionId,
            amount,
            currency,
            method,
            type,
            bookingId,
            tenantId,
            landlordId,
            propertyId,
            metadata = {},
        } = params

        // ── Idempotency check ──────────────────────────────────────────────────
        const existing = await PaymentModel.getByTransactionId(transactionId)
        if (existing && existing.status === 'completed') {
            return { payment: existing, alreadyProcessed: true }
        }

        const now = new Date().toISOString()
        const paymentId = nanoid()

        const payment: Payment = {
            id: paymentId,
            bookingId,
            amount,
            currency,
            type,
            status: 'completed',
            method,
            transactionId,
            userId: tenantId,
            propertyId,
            createdAt: now,
            completedAt: now,
            metadata,
        }

        // ── Build transact items ───────────────────────────────────────────────
        const transactItems: Parameters<typeof DynamoDBUtils.transactWrite>[0] = []

        // 1. Create payment record
        transactItems.push({
            Put: {
                TableName: TABLES.PAYMENTS,
                Item: payment as unknown as Record<string, unknown>,
                ConditionExpression: 'attribute_not_exists(id)',
            },
        })

        // 2. Update booking if provided
        if (bookingId) {
            transactItems.push({
                Update: {
                    TableName: TABLES.BOOKINGS,
                    Key: { id: bookingId },
                    UpdateExpression:
                        'SET depositPaid = :dp, escrowStatus = :es, escrowAmount = :ea, updatedAt = :ua, #st = :st',
                    ExpressionAttributeNames: { '#st': 'status' },
                    ExpressionAttributeValues: {
                        ':dp': true,
                        ':es': 'held',
                        ':ea': amount,
                        ':ua': now,
                        ':st': 'confirmed',
                    },
                },
            })
        }

        // 3. Update property status if provided
        if (propertyId) {
            transactItems.push({
                Update: {
                    TableName: TABLES.PROPERTIES,
                    Key: { id: propertyId },
                    UpdateExpression: 'SET isAvailable = :avail',
                    ExpressionAttributeValues: { ':avail': false },
                },
            })
        }

        // 4. Tenant notification
        if (tenantId) {
            const tenantNotifId = nanoid()
            const tenantNotif = buildNotification(
                tenantNotifId,
                tenantId,
                'Payment Confirmed',
                `Your payment of ${currency} ${amount.toLocaleString()} has been received and is held in escrow.`,
                'payment',
                bookingId ? `/dashboard` : undefined,
            )
            transactItems.push({
                Put: {
                    TableName: TABLES.NOTIFICATIONS,
                    Item: tenantNotif as unknown as Record<string, unknown>,
                },
            })
        }

        // 5. Landlord notification
        if (landlordId) {
            const landlordNotifId = nanoid()
            const landlordNotif = buildNotification(
                landlordNotifId,
                landlordId,
                'Payment Received',
                `A deposit payment of ${currency} ${amount.toLocaleString()} has been received for your property.`,
                'payment',
                '/agent/dashboard',
            )
            transactItems.push({
                Put: {
                    TableName: TABLES.NOTIFICATIONS,
                    Item: landlordNotif as unknown as Record<string, unknown>,
                },
            })
        }

        // 6. Audit log
        const auditId = nanoid()
        const auditLog = {
            id: auditId,
            action: 'PAYMENT_CONFIRMED',
            bookingId,
            paymentId,
            userId: tenantId ?? 'system',
            changes: {
                transactionId,
                amount,
                currency,
                method,
                type,
                propertyId,
            },
            timestamp: now,
            status: 'success' as const,
        }
        transactItems.push({
            Put: {
                TableName: TABLES.AUDIT_LOGS,
                Item: auditLog as unknown as Record<string, unknown>,
            },
        })

        // ── Commit atomically ─────────────────────────────────────────────────
        try {
            await DynamoDBUtils.transactWrite(transactItems)
        } catch (err: unknown) {
            // Log the failure before re-throwing
            await AuditLogModel.create({
                action: 'PAYMENT_CONFIRMED',
                bookingId,
                paymentId,
                userId: tenantId ?? 'system',
                changes: { transactionId, amount, error: String(err) },
                status: 'failed',
                errorMessage: String(err),
            }).catch(() => {/* best-effort audit on failure */})
            throw err
        }

        return { payment, alreadyProcessed: false }
    },

    /**
     * Process a refund atomically.
     */
    async processRefundAtomically(params: {
        paymentId: string
        requestedBy: string
        reason?: string
    }): Promise<Payment> {
        const { paymentId, requestedBy, reason } = params
        const payment = await PaymentModel.getById(paymentId)

        if (!payment) {
            throw new Error(`Payment ${paymentId} not found`)
        }
        if (payment.status === 'refunded') {
            throw new Error(`Payment ${paymentId} is already refunded`)
        }
        if (payment.status !== 'completed') {
            throw new Error(`Payment ${paymentId} cannot be refunded (status: ${payment.status})`)
        }

        const now = new Date().toISOString()

        const transactItems: Parameters<typeof DynamoDBUtils.transactWrite>[0] = []

        // 1. Update payment status to refunded
        transactItems.push({
            Update: {
                TableName: TABLES.PAYMENTS,
                Key: { id: paymentId },
                UpdateExpression: 'SET #st = :st, refundedAt = :ra',
                ExpressionAttributeNames: { '#st': 'status' },
                ExpressionAttributeValues: { ':st': 'refunded', ':ra': now },
            },
        })

        // 2. Release escrow if booking exists
        if (payment.bookingId) {
            transactItems.push({
                Update: {
                    TableName: TABLES.BOOKINGS,
                    Key: { id: payment.bookingId },
                    UpdateExpression: 'SET escrowStatus = :es, escrowReleasedAt = :era, updatedAt = :ua',
                    ExpressionAttributeValues: {
                        ':es': 'released',
                        ':era': now,
                        ':ua': now,
                    },
                },
            })
        }

        // 3. Restore property availability
        if (payment.propertyId) {
            transactItems.push({
                Update: {
                    TableName: TABLES.PROPERTIES,
                    Key: { id: payment.propertyId },
                    UpdateExpression: 'SET isAvailable = :avail',
                    ExpressionAttributeValues: { ':avail': true },
                },
            })
        }

        // 4. Notify tenant
        if (payment.userId) {
            const notifId = nanoid()
            const notif = buildNotification(
                notifId,
                payment.userId,
                'Refund Processed',
                `Your refund of ${payment.currency} ${payment.amount.toLocaleString()} has been processed.`,
                'payment',
                '/dashboard',
            )
            transactItems.push({
                Put: {
                    TableName: TABLES.NOTIFICATIONS,
                    Item: notif as unknown as Record<string, unknown>,
                },
            })
        }

        // 5. Audit log
        const auditId = nanoid()
        transactItems.push({
            Put: {
                TableName: TABLES.AUDIT_LOGS,
                Item: {
                    id: auditId,
                    action: 'PAYMENT_REFUNDED',
                    bookingId: payment.bookingId,
                    paymentId,
                    userId: requestedBy,
                    changes: { reason, originalAmount: payment.amount },
                    timestamp: now,
                    status: 'success',
                } as unknown as Record<string, unknown>,
            },
        })

        await DynamoDBUtils.transactWrite(transactItems)

        return { ...payment, status: 'refunded', refundedAt: now }
    },

    /**
     * Create a booking record.
     */
    async createBooking(data: Omit<Booking, 'id' | 'createdAt' | 'updatedAt'>): Promise<Booking> {
        const now = new Date().toISOString()
        const booking: Booking = {
            id: nanoid(),
            createdAt: now,
            updatedAt: now,
            ...data,
        }
        await DynamoDBUtils.putItem(TABLES.BOOKINGS, booking as unknown as Record<string, unknown>)
        return booking
    },

    /**
     * Get a booking by ID.
     */
    async getBooking(bookingId: string): Promise<Booking | null> {
        const item = await DynamoDBUtils.getItem(TABLES.BOOKINGS, { id: bookingId })
        return (item as Booking) ?? null
    },
}
