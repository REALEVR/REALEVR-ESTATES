import crypto from 'crypto'
import fetch from 'node-fetch'
import type { PaymentInitResponse, RefundResponse, TransactionStatus } from '../models/Payment.js'

export class IoTECTGateway {
    private secretKey: string
    private apiKey: string
    private merchantId: string
    private baseUrl = 'https://api.iotecpay.com/v1'

    constructor() {
        this.secretKey = process.env.IOTECH_SECRET_KEY || ''
        this.apiKey = process.env.IOTECH_API_KEY || ''
        this.merchantId = process.env.IOTECH_MERCHANT_ID || ''
    }

    async initializePayment(params: {
        amount: number
        currency: string
        customerEmail: string
        customerName: string
        customerPhone?: string
        txRef: string
        redirectUrl: string
        meta?: Record<string, any>
    }): Promise<PaymentInitResponse> {
        try {
            const payload = {
                merchant_id: this.merchantId,
                transaction_ref: params.txRef,
                amount: params.amount,
                currency: params.currency || 'UGX',
                callback_url: params.redirectUrl,
                customer: {
                    email: params.customerEmail,
                    name: params.customerName,
                    phone: params.customerPhone || '',
                },
                meta: params.meta || {},
                payment_options: ['mobile_money', 'ussd', 'bank_card'],
            }

            const response = await fetch(`${this.baseUrl}/payments/initialize`, {
                method: 'POST',
                headers: {
                    'x-api-key': this.apiKey,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            })

            const data = (await response.json()) as any

            if (data.status === 'success' && data.data?.payment_url) {
                return {
                    success: true,
                    paymentUrl: data.data.payment_url,
                    transactionRef: params.txRef,
                    gateway: 'iotech',
                }
            }

            return {
                success: false,
                transactionRef: params.txRef,
                gateway: 'iotech',
                error: data.message || 'Failed to initialize iOTECT payment',
            }
        } catch (error: any) {
            return {
                success: false,
                transactionRef: params.txRef,
                gateway: 'iotech',
                error: error.message,
            }
        }
    }

    verifyWebhookSignature(signature: string, payload: any): boolean {
        try {
            const secretKey = this.secretKey
            if (!secretKey) return false
            const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload)
            const expectedSignature = crypto
                .createHmac('sha256', secretKey)
                .update(payloadString)
                .digest('hex')
            return crypto.timingSafeEqual(
                Buffer.from(signature, 'hex'),
                Buffer.from(expectedSignature, 'hex')
            )
        } catch {
            return false
        }
    }

    async getTransactionStatus(transactionRef: string): Promise<TransactionStatus> {
        try {
            const response = await fetch(`${this.baseUrl}/transactions/${transactionRef}`, {
                method: 'GET',
                headers: {
                    'x-api-key': this.apiKey,
                },
            })

            const data = (await response.json()) as any

            if (data.status === 'success') {
                const txStatus = data.data.status
                return {
                    status: txStatus === 'SUCCESSFUL' ? 'completed' : txStatus === 'PENDING' ? 'pending' : 'failed',
                    amount: data.data.amount,
                    currency: data.data.currency,
                    gateway: 'iotech',
                    transactionId: data.data.transaction_ref,
                }
            }

            return {
                status: 'failed',
                amount: 0,
                currency: 'UGX',
                gateway: 'iotech',
                transactionId: transactionRef,
            }
        } catch {
            return {
                status: 'failed',
                amount: 0,
                currency: 'UGX',
                gateway: 'iotech',
                transactionId: transactionRef,
            }
        }
    }

    async refundPayment(transactionRef: string, amount: number): Promise<RefundResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/payments/${transactionRef}/refund`, {
                method: 'POST',
                headers: {
                    'x-api-key': this.apiKey,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ amount }),
            })

            const data = (await response.json()) as any

            if (data.status === 'success') {
                return {
                    success: true,
                    refundId: data.data?.refund_id || transactionRef,
                }
            }

            return {
                success: false,
                error: data.message || 'Refund failed',
            }
        } catch (error: any) {
            return {
                success: false,
                error: error.message,
            }
        }
    }
}

export const iotechGateway = new IoTECTGateway()
