import type { Express, Request, Response } from 'express'
import { paymentService } from '../services/paymentService.js'
import { paymentGatewayService } from '../services/paymentGatewayService.js'

export function registerPaymentRoutes(app: Express): void {
    // POST /api/payments/initialize
    app.post('/api/payments/initialize', async (req: Request, res: Response) => {
        if (!req.isAuthenticated()) {
            return res.status(401).json({ message: 'Not authenticated' })
        }

        try {
            const user = req.user as any
            const {
                amount,
                currency = 'UGX',
                type = 'deposit',
                gateway,
                redirectUrl,
                meta,
            } = req.body

            if (!amount || amount <= 0) {
                return res.status(400).json({ message: 'Valid amount is required' })
            }

            const result = await paymentService.initializePayment({
                userId: String(user.id),
                amount,
                currency,
                type,
                customerEmail: user.email,
                customerName: user.fullName || user.username,
                customerPhone: user.phoneNumber,
                redirectUrl: redirectUrl || `${process.env.BASE_URL || 'http://localhost:5001'}/dashboard`,
                preferredGateway: gateway,
                meta: {
                    ...meta,
                    userAgent: req.headers['user-agent'],
                    ipAddress: req.ip,
                },
            })

            return res.json({
                success: true,
                paymentUrl: result.paymentUrl,
                txRef: result.txRef,
                paymentId: result.payment.id,
                gateway: result.payment.gateway,
            })
        } catch (error: any) {
            return res.status(500).json({ message: error.message })
        }
    })

    // POST /api/payments/confirm
    app.post('/api/payments/confirm', async (req: Request, res: Response) => {
        try {
            const { txRef, gateway, transactionId, amount, currency } = req.body

            if (!txRef || !gateway) {
                return res.status(400).json({ message: 'txRef and gateway are required' })
            }

            const payment = await paymentService.confirmPayment({
                txRef,
                gateway,
                transactionId: transactionId || txRef,
                amount: amount || 0,
                currency: currency || 'UGX',
            })

            if (!payment) {
                return res.status(404).json({ message: 'Payment not found' })
            }

            return res.json({ success: true, payment })
        } catch (error: any) {
            return res.status(500).json({ message: error.message })
        }
    })

    // POST /api/payments/:id/refund
    app.post('/api/payments/:id/refund', async (req: Request, res: Response) => {
        if (!req.isAuthenticated()) {
            return res.status(401).json({ message: 'Not authenticated' })
        }

        try {
            const user = req.user as any
            const result = await paymentService.refundPayment(req.params.id, String(user.id))

            if (!result.success) {
                return res.status(400).json({ message: result.error || 'Refund failed' })
            }

            return res.json({ success: true })
        } catch (error: any) {
            return res.status(500).json({ message: error.message })
        }
    })

    // GET /api/payments/:id/status
    app.get('/api/payments/:id/status', async (req: Request, res: Response) => {
        if (!req.isAuthenticated()) {
            return res.status(401).json({ message: 'Not authenticated' })
        }

        try {
            const payment = await paymentService.getPaymentStatus(req.params.id)
            if (!payment) {
                return res.status(404).json({ message: 'Payment not found' })
            }
            return res.json(payment)
        } catch (error: any) {
            return res.status(500).json({ message: error.message })
        }
    })

    console.log('✅ Payment routes registered')
}
