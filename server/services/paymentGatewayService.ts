import { FlutterwaveGateway } from './flutterwaveGateway.js'
import { IoTECTGateway } from './iotechGateway.js'
import type { PaymentInitResponse, RefundResponse, TransactionStatus } from '../models/Payment.js'
import { paymentEventEmitter } from '../events/paymentEventEmitter.js'
import { nanoid } from 'nanoid'

export class PaymentGatewayService {
    private flutterwave: FlutterwaveGateway
    private iotech: IoTECTGateway

    constructor() {
        this.flutterwave = new FlutterwaveGateway()
        this.iotech = new IoTECTGateway()
    }

    async processPayment(params: {
        amount: number
        currency: string
        customerEmail: string
        customerName: string
        customerPhone?: string
        redirectUrl: string
        preferredGateway?: 'flutterwave' | 'iotech'
        meta?: Record<string, any>
    }): Promise<PaymentInitResponse & { txRef: string }> {
        const preferred = params.preferredGateway ||
            (process.env.PAYMENT_PRIMARY_GATEWAY as 'flutterwave' | 'iotech') ||
            'flutterwave'
        const fallbackEnabled = process.env.PAYMENT_ENABLE_FALLBACK !== 'false'

        const txRef = `REALEVR-${nanoid(12)}-${Date.now()}`

        paymentEventEmitter.emit('payment.initiated', { txRef, gateway: preferred, amount: params.amount })

        const primaryGateway = preferred === 'flutterwave' ? this.flutterwave : this.iotech
        const fallbackGateway = preferred === 'flutterwave' ? this.iotech : this.flutterwave
        const fallbackName: 'flutterwave' | 'iotech' = preferred === 'flutterwave' ? 'iotech' : 'flutterwave'

        const paymentParams = { ...params, txRef }
        const primaryResult = await primaryGateway.initializePayment(paymentParams)

        if (primaryResult.success) {
            paymentEventEmitter.emit('payment.processing', { txRef, gateway: preferred })
            return { ...primaryResult, txRef }
        }

        if (fallbackEnabled) {
            console.warn(`[PaymentGateway] Primary gateway ${preferred} failed, trying fallback ${fallbackName}`)
            paymentEventEmitter.emit('gateway.fallback', {
                txRef,
                from: preferred,
                to: fallbackName,
                reason: primaryResult.error,
            })

            const fallbackResult = await fallbackGateway.initializePayment(paymentParams)
            if (fallbackResult.success) {
                paymentEventEmitter.emit('payment.processing', { txRef, gateway: fallbackName })
                return { ...fallbackResult, txRef, gateway: fallbackName }
            }

            paymentEventEmitter.emit('gateway.both_failed', { txRef, primaryError: primaryResult.error, fallbackError: fallbackResult.error })
        }

        paymentEventEmitter.emit('payment.failed', { txRef, gateway: preferred, error: primaryResult.error })
        return { ...primaryResult, txRef }
    }

    verifyFlutterwaveSignature(signature: string, payload: any): boolean {
        return this.flutterwave.verifyWebhookSignature(signature, payload)
    }

    verifyiOTECHSignature(signature: string, payload: any): boolean {
        return this.iotech.verifyWebhookSignature(signature, payload)
    }

    async getTransactionStatus(transactionId: string, gateway: 'flutterwave' | 'iotech'): Promise<TransactionStatus> {
        if (gateway === 'flutterwave') {
            return this.flutterwave.verifyTransaction(transactionId)
        }
        return this.iotech.getTransactionStatus(transactionId)
    }

    async refundPayment(transactionId: string, amount: number, gateway: 'flutterwave' | 'iotech'): Promise<RefundResponse> {
        const result = gateway === 'flutterwave'
            ? await this.flutterwave.refundPayment(transactionId, amount)
            : await this.iotech.refundPayment(transactionId, amount)

        if (result.success) {
            paymentEventEmitter.emit('payment.refunded', { transactionId, gateway, amount })
        }

        return result
    }
}

export const paymentGatewayService = new PaymentGatewayService()
