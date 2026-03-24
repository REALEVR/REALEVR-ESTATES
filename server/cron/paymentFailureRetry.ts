import cron from 'node-cron'
import { DynamoDBUtils, TABLES } from '../dynamodb.js'
import { paymentGatewayService } from '../services/paymentGatewayService.js'
import { notificationService } from '../services/notificationService.js'
import { sendEmail } from '../email-service.js'

function startPaymentFailureRetry() {
    // Run every hour
    cron.schedule('0 * * * *', async () => {
        console.log('[PaymentFailureRetry] Checking for failed payments to retry...')
        try {
            const oneHourAgo = new Date()
            oneHourAgo.setHours(oneHourAgo.getHours() - 1)

            const failedPayments = await DynamoDBUtils.scanTable(
                TABLES.PAYMENTS,
                '#status = :failed',
                { ':failed': 'failed' },
                { '#status': 'status' }
            )

            console.log(`[PaymentFailureRetry] Found ${failedPayments.length} failed payments`)

            for (const payment of failedPayments as any[]) {
                try {
                    const retryCount = payment.retryCount || 0
                    if (retryCount >= 3) {
                        // Max retries reached - notify user of persistent failure
                        if (!payment.persistentFailureNotified) {
                            await notificationService.createNotification({
                                userId: payment.userId,
                                title: '⚠️ Payment Issue - Action Required',
                                message: `We've been unable to process your payment of ${payment.currency} ${payment.amount?.toLocaleString()}. Please try a different payment method or contact support.`,
                                type: 'payment',
                                channel: 'in-app',
                                relatedGateway: payment.gateway,
                                link: '/dashboard',
                            })

                            // Get user for email notification
                            const users = await DynamoDBUtils.scanTable(
                                TABLES.USERS,
                                'id = :id',
                                { ':id': payment.userId }
                            )
                            if (users.length > 0) {
                                const user = users[0] as any
                                if (user.email) {
                                    await sendEmail({
                                        to: user.email,
                                        subject: '⚠️ Payment Failed - Action Required - REALEVR Estates',
                                        html: `
                                            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                                                <div style="background-color: #dc3545; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                                                    <h2>REALEVR Estates</h2>
                                                    <h3>⚠️ Payment Issue</h3>
                                                </div>
                                                <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
                                                    <p>Dear ${user.fullName || user.username},</p>
                                                    <p>We've been unable to process your payment of <strong>${payment.currency} ${payment.amount?.toLocaleString()}</strong> after multiple attempts.</p>
                                                    <p>Please try a different payment method or contact our support team.</p>
                                                    <a href="${process.env.BASE_URL || 'http://localhost:5001'}/dashboard" 
                                                       style="display: inline-block; background-color: #FF5A5F; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0;">
                                                        Retry Payment
                                                    </a>
                                                </div>
                                            </div>
                                        `,
                                    })
                                }
                            }

                            await DynamoDBUtils.updateItem(
                                TABLES.PAYMENTS,
                                { id: payment.id },
                                'SET persistentFailureNotified = :notified, updatedAt = :updatedAt',
                                { ':notified': true, ':updatedAt': new Date().toISOString() }
                            )
                        }
                        continue
                    }

                    // Update retry count
                    await DynamoDBUtils.updateItem(
                        TABLES.PAYMENTS,
                        { id: payment.id },
                        'SET retryCount = :count, updatedAt = :updatedAt',
                        { ':count': retryCount + 1, ':updatedAt': new Date().toISOString() }
                    )

                    console.log(`[PaymentFailureRetry] Logged retry ${retryCount + 1}/3 for payment ${payment.id}`)
                } catch (err) {
                    console.error(`[PaymentFailureRetry] Error processing payment ${payment.id}:`, err)
                }
            }

            console.log('[PaymentFailureRetry] Retry check completed')
        } catch (error) {
            console.error('[PaymentFailureRetry] Error running retry job:', error)
        }
    })

    console.log('✅ Payment failure retry cron job scheduled (every hour)')
}

export function initPaymentFailureRetry() {
    startPaymentFailureRetry()
}
