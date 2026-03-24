import { nanoid } from 'nanoid'
import { DynamoDBUtils, TABLES } from '../dynamodb.js'
import { paymentGatewayService } from './paymentGatewayService.js'
import { notificationService } from './notificationService.js'
import { paymentEventEmitter } from '../events/paymentEventEmitter.js'
import type { Payment, AuditLog } from '../models/Payment.js'

export class PaymentService {
    async initializePayment(params: {
        userId: string
        amount: number
        currency: string
        type: Payment['type']
        customerEmail: string
        customerName: string
        customerPhone?: string
        redirectUrl: string
        preferredGateway?: 'flutterwave' | 'iotech'
        meta?: Record<string, any>
    }): Promise<{ payment: Payment; paymentUrl?: string; txRef: string }> {
        const result = await paymentGatewayService.processPayment({
            amount: params.amount,
            currency: params.currency,
            customerEmail: params.customerEmail,
            customerName: params.customerName,
            customerPhone: params.customerPhone,
            redirectUrl: params.redirectUrl,
            preferredGateway: params.preferredGateway,
            meta: params.meta,
        })

        const now = new Date().toISOString()
        const payment: Payment = {
            id: nanoid(),
            bookingId: params.meta?.bookingId || '',
            userId: params.userId,
            amount: params.amount,
            currency: params.currency,
            type: params.type,
            status: result.success ? 'pending' : 'failed',
            gateway: result.gateway,
            primaryGateway: params.preferredGateway || 'flutterwave',
            fallbackAttempted: result.gateway !== (params.preferredGateway || 'flutterwave'),
            transactionIds: {
                [result.gateway]: result.transactionRef,
            } as any,
            createdAt: now,
            metadata: {
                userAgent: params.meta?.userAgent,
                ipAddress: params.meta?.ipAddress,
                propertyId: params.meta?.propertyId,
                propertyTitle: params.meta?.propertyTitle,
                gatewaySwitchReason: result.gateway !== (params.preferredGateway || 'flutterwave') ? 'Primary gateway failed' : undefined,
            },
        }

        await DynamoDBUtils.putItem(TABLES.PAYMENTS, payment as any)
        await this.logAuditEvent({
            paymentId: payment.id,
            userId: params.userId,
            action: 'payment_initialized',
            gateway: result.gateway,
            details: { txRef: result.transactionRef, amount: params.amount, currency: params.currency },
        })

        return {
            payment,
            paymentUrl: result.paymentUrl,
            txRef: result.txRef,
        }
    }

    async confirmPayment(params: {
        txRef: string
        gateway: 'flutterwave' | 'iotech'
        transactionId: string
        amount: number
        currency: string
        userId?: string
    }): Promise<Payment | null> {
        // Find the payment by txRef
        const payments = await DynamoDBUtils.scanTable(
            TABLES.PAYMENTS,
            'contains(transactionIds, :txRef)',
            { ':txRef': params.txRef }
        )

        if (payments.length === 0) {
            console.error(`[PaymentService] Payment not found for txRef: ${params.txRef}`)
            return null
        }

        const payment = payments[0] as unknown as Payment

        // Idempotency check
        if (payment.status === 'completed') {
            console.log(`[PaymentService] Payment already completed: ${payment.id}`)
            return payment
        }

        const now = new Date().toISOString()

        // Atomic update of payment status
        await DynamoDBUtils.updateItem(
            TABLES.PAYMENTS,
            { id: payment.id },
            'SET #status = :status, completedAt = :completedAt, updatedAt = :updatedAt',
            { ':status': 'completed', ':completedAt': now, ':updatedAt': now },
            { '#status': 'status' }
        )

        const updatedPayment: Payment = { ...payment, status: 'completed', completedAt: now }

        // Emit completion event
        paymentEventEmitter.emit('payment.completed', {
            paymentId: payment.id,
            txRef: params.txRef,
            gateway: params.gateway,
            amount: params.amount,
            userId: payment.userId,
        })

        // Create completion notification
        if (payment.userId) {
            await notificationService.createNotification({
                userId: payment.userId,
                title: '✅ Payment Confirmed',
                message: `Your payment of ${params.currency} ${params.amount.toLocaleString()} has been confirmed. Reference: ${params.txRef}`,
                type: 'payment',
                channel: 'in-app',
                relatedGateway: params.gateway,
                data: { txRef: params.txRef, amount: params.amount },
                link: '/dashboard',
            })
        }

        // Log audit
        await this.logAuditEvent({
            paymentId: payment.id,
            userId: payment.userId,
            action: 'payment_confirmed',
            gateway: params.gateway,
            details: { txRef: params.txRef, transactionId: params.transactionId, amount: params.amount },
        })

        return updatedPayment
    }

    async refundPayment(paymentId: string, userId: string): Promise<{ success: boolean; error?: string }> {
        const paymentItem = await DynamoDBUtils.scanTable(
            TABLES.PAYMENTS,
            'id = :id',
            { ':id': paymentId }
        )

        if (paymentItem.length === 0) {
            return { success: false, error: 'Payment not found' }
        }

        const payment = paymentItem[0] as unknown as Payment

        if (payment.status !== 'completed') {
            return { success: false, error: 'Only completed payments can be refunded' }
        }

        const transactionId = payment.transactionIds[payment.gateway as 'flutterwave' | 'iotech']
        if (!transactionId) {
            return { success: false, error: 'No transaction ID found' }
        }

        const result = await paymentGatewayService.refundPayment(
            transactionId,
            payment.amount,
            payment.gateway as 'flutterwave' | 'iotech'
        )

        if (result.success) {
            const now = new Date().toISOString()
            await DynamoDBUtils.updateItem(
                TABLES.PAYMENTS,
                { id: payment.id },
                'SET #status = :status, refundedAt = :refundedAt, updatedAt = :updatedAt',
                { ':status': 'refunded', ':refundedAt': now, ':updatedAt': now },
                { '#status': 'status' }
            )

            await notificationService.createNotification({
                userId: payment.userId,
                title: '↩️ Payment Refunded',
                message: `Your payment of ${payment.currency} ${payment.amount.toLocaleString()} has been refunded.`,
                type: 'payment',
                channel: 'in-app',
                relatedGateway: payment.gateway as 'flutterwave' | 'iotech',
                link: '/dashboard',
            })

            await this.logAuditEvent({
                paymentId: payment.id,
                userId,
                action: 'payment_refunded',
                gateway: payment.gateway as 'flutterwave' | 'iotech',
                details: { refundId: result.refundId },
            })
        }

        return result
    }

    async getPaymentStatus(paymentId: string): Promise<Payment | null> {
        const items = await DynamoDBUtils.scanTable(
            TABLES.PAYMENTS,
            'id = :id',
            { ':id': paymentId }
        )
        return items.length > 0 ? (items[0] as unknown as Payment) : null
    }

    private async logAuditEvent(params: {
        paymentId?: string
        userId?: string
        action: string
        gateway?: 'flutterwave' | 'iotech'
        details: Record<string, any>
        ipAddress?: string
    }): Promise<void> {
        try {
            const log: AuditLog = {
                id: nanoid(),
                paymentId: params.paymentId,
                userId: params.userId,
                action: params.action,
                gateway: params.gateway,
                details: params.details,
                ipAddress: params.ipAddress,
                createdAt: new Date().toISOString(),
            }
            await DynamoDBUtils.putItem(TABLES.AUDIT_LOGS, log as any)
        } catch (error) {
            console.error('[PaymentService] Failed to log audit event:', error)
        }
    }
}

export const paymentService = new PaymentService()
