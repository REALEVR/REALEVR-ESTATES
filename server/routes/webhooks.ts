import type { Express, Request, Response } from 'express'
import { paymentGatewayService } from '../services/paymentGatewayService.js'
import { paymentService } from '../services/paymentService.js'
import { notificationService } from '../services/notificationService.js'

async function confirmPaymentLogic(
    txRef: string,
    gateway: 'flutterwave' | 'iotech',
    transactionId: string,
    amount: number,
    currency: string
): Promise<void> {
    const payment = await paymentService.confirmPayment({
        txRef,
        gateway,
        transactionId,
        amount,
        currency,
    })

    if (!payment) {
        console.error(`[Webhooks] Failed to confirm payment for txRef: ${txRef}`)
    } else {
        console.log(`[Webhooks] Payment confirmed: ${payment.id} via ${gateway}`)
    }
}

export function registerWebhookRoutes(app: Express): void {
    // Flutterwave webhook
    app.post('/api/webhooks/flutterwave', async (req: Request, res: Response) => {
        const signature = req.headers['verif-hash'] as string

        if (!paymentGatewayService.verifyFlutterwaveSignature(signature, req.body)) {
            return res.status(401).json({ error: 'Invalid signature' })
        }

        try {
            const { data } = req.body

            if (!data) {
                return res.status(400).json({ error: 'Invalid payload' })
            }

            if (data.status === 'successful') {
                await confirmPaymentLogic(
                    data.tx_ref,
                    'flutterwave',
                    String(data.id),
                    data.amount,
                    data.currency || 'UGX'
                )
                return res.status(200).json({ success: true })
            }

            if (data.status === 'failed') {
                console.log(`[Webhooks] Flutterwave payment failed for txRef: ${data.tx_ref}`)
                return res.status(200).json({ success: true, status: 'failed' })
            }

            return res.status(200).json({ success: true, status: data.status })
        } catch (error: any) {
            console.error('[Webhooks] Flutterwave webhook error:', error)
            return res.status(500).json({ error: error.message })
        }
    })

    // iOTECT webhook
    app.post('/api/webhooks/iotech', async (req: Request, res: Response) => {
        const signature = req.headers['x-iotech-signature'] as string

        if (!paymentGatewayService.verifyiOTECHSignature(signature, req.body)) {
            return res.status(401).json({ error: 'Invalid signature' })
        }

        try {
            const { transaction_ref, status, amount, currency, transaction_id } = req.body

            if (!transaction_ref) {
                return res.status(400).json({ error: 'Invalid payload' })
            }

            if (status === 'SUCCESSFUL') {
                await confirmPaymentLogic(
                    transaction_ref,
                    'iotech',
                    transaction_id || transaction_ref,
                    amount || 0,
                    currency || 'UGX'
                )
                return res.status(200).json({ success: true })
            }

            if (status === 'FAILED') {
                console.log(`[Webhooks] iOTECT payment failed for txRef: ${transaction_ref}`)
                return res.status(200).json({ success: true, status: 'failed' })
            }

            return res.status(200).json({ success: true, status })
        } catch (error: any) {
            console.error('[Webhooks] iOTECT webhook error:', error)
            return res.status(500).json({ error: error.message })
        }
    })

    // Admin: test both gateways
    app.post('/api/admin/test-payment-gateways', async (req: Request, res: Response) => {
        if (!req.isAuthenticated() || (req.user as any)?.role !== 'admin') {
            return res.status(401).json({ error: 'Unauthorized' })
        }

        try {
            const flutterwaveStatus = process.env.FLUTTERWAVE_SECRET_KEY ? 'configured' : 'not configured'
            const iotechStatus = process.env.IOTECH_SECRET_KEY ? 'configured' : 'not configured'

            return res.json({
                flutterwave: {
                    status: flutterwaveStatus,
                    publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY ? '***configured***' : 'not set',
                },
                iotech: {
                    status: iotechStatus,
                    merchantId: process.env.IOTECH_MERCHANT_ID ? '***configured***' : 'not set',
                },
                primaryGateway: process.env.PAYMENT_PRIMARY_GATEWAY || 'flutterwave',
                fallbackEnabled: process.env.PAYMENT_ENABLE_FALLBACK !== 'false',
            })
        } catch (error: any) {
            return res.status(500).json({ error: error.message })
        }
    })

    // Admin: simulate webhook
    app.post('/api/admin/simulate-webhook', async (req: Request, res: Response) => {
        if (!req.isAuthenticated() || (req.user as any)?.role !== 'admin') {
            return res.status(401).json({ error: 'Unauthorized' })
        }

        try {
            const { gateway, txRef, amount, currency, status } = req.body

            if (!gateway || !txRef) {
                return res.status(400).json({ error: 'gateway and txRef are required' })
            }

            if (status === 'successful' || status === 'SUCCESSFUL') {
                await confirmPaymentLogic(txRef, gateway, txRef, amount || 0, currency || 'UGX')
            }

            return res.json({ success: true, message: `Simulated ${gateway} webhook for ${txRef}` })
        } catch (error: any) {
            return res.status(500).json({ error: error.message })
        }
    })

    // Admin: get gateway status
    app.get('/api/admin/gateway-status', async (req: Request, res: Response) => {
        if (!req.isAuthenticated() || (req.user as any)?.role !== 'admin') {
            return res.status(401).json({ error: 'Unauthorized' })
        }

        return res.json({
            flutterwave: {
                configured: !!process.env.FLUTTERWAVE_SECRET_KEY,
                webhookUrl: process.env.FLUTTERWAVE_WEBHOOK_URL || null,
            },
            iotech: {
                configured: !!process.env.IOTECH_SECRET_KEY,
                webhookUrl: process.env.IOTECH_WEBHOOK_URL || null,
            },
            primaryGateway: process.env.PAYMENT_PRIMARY_GATEWAY || 'flutterwave',
            fallbackEnabled: process.env.PAYMENT_ENABLE_FALLBACK !== 'false',
            fallbackTimeout: parseInt(process.env.PAYMENT_FALLBACK_TIMEOUT || '5000'),
        })
    })

    console.log('✅ Webhook routes registered')
}
