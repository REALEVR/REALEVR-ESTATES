import crypto from 'crypto'
import fetch from 'node-fetch'
import type { PaymentInitResponse, RefundResponse, TransactionStatus } from '../models/Payment.js'

export class FlutterwaveGateway {
    private secretKey: string
    private publicKey: string
    private baseUrl = 'https://api.flutterwave.com/v3'

    constructor() {
        this.secretKey = process.env.FLUTTERWAVE_SECRET_KEY || ''
        this.publicKey = process.env.FLUTTERWAVE_PUBLIC_KEY || ''
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
                tx_ref: params.txRef,
                amount: params.amount,
                currency: params.currency || 'UGX',
                redirect_url: params.redirectUrl,
                customer: {
                    email: params.customerEmail,
                    name: params.customerName,
                    phonenumber: params.customerPhone || '',
                },
                meta: params.meta || {},
                customizations: {
                    title: 'REALEVR Estates',
                    description: 'Property Payment',
                    logo: 'https://realevr.com/logo.png',
                },
            }

            const response = await fetch(`${this.baseUrl}/payments`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.secretKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            })

            const data = (await response.json()) as any

            if (data.status === 'success' && data.data?.link) {
                return {
                    success: true,
                    paymentUrl: data.data.link,
                    transactionRef: params.txRef,
                    gateway: 'flutterwave',
                }
            }

            return {
                success: false,
                transactionRef: params.txRef,
                gateway: 'flutterwave',
                error: data.message || 'Failed to initialize Flutterwave payment',
            }
        } catch (error: any) {
            return {
                success: false,
                transactionRef: params.txRef,
                gateway: 'flutterwave',
                error: error.message,
            }
        }
    }

    verifyWebhookSignature(signature: string, payload: any): boolean {
        try {
            const secretHash = process.env.FLUTTERWAVE_SECRET_HASH || this.secretKey
            return signature === secretHash
        } catch {
            return false
        }
    }

    async verifyTransaction(transactionId: string): Promise<TransactionStatus> {
        try {
            const response = await fetch(`${this.baseUrl}/transactions/${transactionId}/verify`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${this.secretKey}`,
                },
            })

            const data = (await response.json()) as any

            if (data.status === 'success') {
                return {
                    status: data.data.status === 'successful' ? 'completed' : 'failed',
                    amount: data.data.amount,
                    currency: data.data.currency,
                    gateway: 'flutterwave',
                    transactionId: String(data.data.id),
                }
            }

            return {
                status: 'failed',
                amount: 0,
                currency: 'UGX',
                gateway: 'flutterwave',
                transactionId,
            }
        } catch (error: any) {
            return {
                status: 'failed',
                amount: 0,
                currency: 'UGX',
                gateway: 'flutterwave',
                transactionId,
            }
        }
    }

    async refundPayment(transactionId: string, amount: number): Promise<RefundResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/transactions/${transactionId}/refund`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.secretKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ amount }),
            })

            const data = (await response.json()) as any

            if (data.status === 'success') {
                return {
                    success: true,
                    refundId: String(data.data?.id || transactionId),
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

export const flutterwaveGateway = new FlutterwaveGateway()
