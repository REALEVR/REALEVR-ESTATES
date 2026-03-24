import type { Express, Request, Response } from 'express'
import { DynamoDBUtils, TABLES } from '../dynamodb.js'
import type { Payment } from '../models/Payment.js'

export function registerAnalyticsRoutes(app: Express): void {
    // GET /api/admin/analytics/payments
    app.get('/api/admin/analytics/payments', async (req: Request, res: Response) => {
        if (!req.isAuthenticated() || (req.user as any)?.role !== 'admin') {
            return res.status(401).json({ error: 'Unauthorized' })
        }

        try {
            const { gateway, startDate, endDate } = req.query

            let payments = await DynamoDBUtils.scanTable(TABLES.PAYMENTS) as unknown as Payment[]

            // Filter by gateway
            if (gateway && gateway !== 'all') {
                payments = payments.filter((p) => p.gateway === gateway)
            }

            // Filter by date range
            if (startDate) {
                payments = payments.filter((p) => p.createdAt >= String(startDate))
            }
            if (endDate) {
                payments = payments.filter((p) => p.createdAt <= String(endDate))
            }

            const total = payments.length
            const completed = payments.filter((p) => p.status === 'completed').length
            const failed = payments.filter((p) => p.status === 'failed').length
            const refunded = payments.filter((p) => p.status === 'refunded').length
            const totalVolume = payments
                .filter((p) => p.status === 'completed')
                .reduce((sum, p) => sum + (p.amount || 0), 0)
            const successRate = total > 0 ? ((completed / total) * 100).toFixed(1) : '0'

            return res.json({
                total,
                completed,
                failed,
                refunded,
                successRate: `${successRate}%`,
                totalVolume,
                currency: 'UGX',
            })
        } catch (error: any) {
            return res.status(500).json({ error: error.message })
        }
    })

    // GET /api/admin/analytics/gateway-performance
    app.get('/api/admin/analytics/gateway-performance', async (req: Request, res: Response) => {
        if (!req.isAuthenticated() || (req.user as any)?.role !== 'admin') {
            return res.status(401).json({ error: 'Unauthorized' })
        }

        try {
            const allPayments = await DynamoDBUtils.scanTable(TABLES.PAYMENTS) as unknown as Payment[]

            const flutterwavePayments = allPayments.filter((p) => p.primaryGateway === 'flutterwave')
            const iotechPayments = allPayments.filter((p) => p.primaryGateway === 'iotech')
            const fallbackPayments = allPayments.filter((p) => p.fallbackAttempted)

            const calcStats = (payments: Payment[]) => {
                const total = payments.length
                const completed = payments.filter((p) => p.status === 'completed').length
                const failed = payments.filter((p) => p.status === 'failed').length
                return {
                    total,
                    completed,
                    failed,
                    successRate: total > 0 ? `${((completed / total) * 100).toFixed(1)}%` : '0%',
                    totalVolume: payments
                        .filter((p) => p.status === 'completed')
                        .reduce((sum, p) => sum + (p.amount || 0), 0),
                }
            }

            return res.json({
                flutterwave: calcStats(flutterwavePayments),
                iotech: calcStats(iotechPayments),
                fallbacks: {
                    total: fallbackPayments.length,
                    rate: allPayments.length > 0
                        ? `${((fallbackPayments.length / allPayments.length) * 100).toFixed(1)}%`
                        : '0%',
                },
            })
        } catch (error: any) {
            return res.status(500).json({ error: error.message })
        }
    })

    // GET /api/admin/analytics/user-preferences
    app.get('/api/admin/analytics/user-preferences', async (req: Request, res: Response) => {
        if (!req.isAuthenticated() || (req.user as any)?.role !== 'admin') {
            return res.status(401).json({ error: 'Unauthorized' })
        }

        try {
            const allPayments = await DynamoDBUtils.scanTable(TABLES.PAYMENTS) as unknown as Payment[]

            const flutterwavePreferred = allPayments.filter((p) => p.primaryGateway === 'flutterwave').length
            const iotechPreferred = allPayments.filter((p) => p.primaryGateway === 'iotech').length
            const total = allPayments.length

            return res.json({
                flutterwave: {
                    count: flutterwavePreferred,
                    percentage: total > 0 ? `${((flutterwavePreferred / total) * 100).toFixed(1)}%` : '0%',
                },
                iotech: {
                    count: iotechPreferred,
                    percentage: total > 0 ? `${((iotechPreferred / total) * 100).toFixed(1)}%` : '0%',
                },
                total,
            })
        } catch (error: any) {
            return res.status(500).json({ error: error.message })
        }
    })

    console.log('✅ Analytics routes registered')
}
