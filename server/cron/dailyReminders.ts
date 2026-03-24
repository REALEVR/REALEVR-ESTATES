import cron from 'node-cron'
import { DynamoDBUtils, TABLES } from '../dynamodb.js'
import { sendEmail } from '../email-service.js'
import { notificationService } from '../services/notificationService.js'

function startDailyDepositReminders() {
    // Run daily at 00:00 UTC
    cron.schedule('0 0 * * *', async () => {
        console.log('[DailyReminders] Running deposit payment reminders...')
        try {
            const sevenDaysAgo = new Date()
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

            // Get all bookings where deposit is unpaid and booking is confirmed
            const bookings = await DynamoDBUtils.scanTable(
                TABLES.TOUR_PAYMENTS, // Using tour_payments as a proxy; in full impl this would be a bookings table
                'depositPaid = :unpaid AND #status = :confirmed',
                { ':unpaid': false, ':confirmed': 'confirmed' },
                { '#status': 'status' }
            )

            console.log(`[DailyReminders] Found ${bookings.length} unpaid deposits`)

            for (const booking of bookings) {
                try {
                    const confirmedAt = booking.confirmedAt as string | undefined
                    if (!confirmedAt) continue

                    const confirmedDate = new Date(confirmedAt)
                    if (confirmedDate < sevenDaysAgo) continue

                    // Get user details
                    const users = await DynamoDBUtils.scanTable(
                        TABLES.USERS,
                        'id = :id',
                        { ':id': booking.userId }
                    )

                    if (users.length === 0) continue
                    const user = users[0] as any

                    // Get property details
                    const properties = await DynamoDBUtils.scanTable(
                        TABLES.PROPERTIES,
                        'id = :id',
                        { ':id': String(booking.propertyId) }
                    )

                    const property = properties.length > 0 ? (properties[0] as any) : null
                    const propertyTitle = property?.title || 'your property'

                    // Send email reminder
                    if (user.email) {
                        await sendEmail({
                            to: user.email,
                            subject: '⚠️ Reminder: Deposit Payment Pending - REALEVR Estates',
                            html: `
                                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                                    <div style="background-color: #FF5A5F; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                                        <h2>REALEVR Estates</h2>
                                        <h3>Deposit Payment Reminder</h3>
                                    </div>
                                    <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
                                        <p>Dear ${user.fullName || user.username},</p>
                                        <p>This is a reminder that your deposit payment for <strong>${propertyTitle}</strong> is still pending.</p>
                                        <p>Please complete your deposit payment to secure your booking.</p>
                                        <div style="background-color: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 5px; margin: 20px 0;">
                                            <strong>⚠️ Action Required:</strong> Your deposit is due to complete your booking.
                                        </div>
                                        <a href="${process.env.BASE_URL || 'http://localhost:5001'}/dashboard" 
                                           style="display: inline-block; background-color: #FF5A5F; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold;">
                                            Pay Deposit Now
                                        </a>
                                        <p style="color: #666; font-size: 14px;">If you have already made your payment, please ignore this reminder.</p>
                                    </div>
                                </div>
                            `,
                        })
                    }

                    // Create in-app notification
                    await notificationService.createNotification({
                        userId: String(booking.userId),
                        title: '⚠️ Deposit Payment Reminder',
                        message: `Your deposit for ${propertyTitle} is still pending. Please complete your payment to secure your booking.`,
                        type: 'payment',
                        channel: 'in-app',
                        link: '/dashboard',
                    })

                    console.log(`[DailyReminders] Sent deposit reminder to user ${booking.userId}`)
                } catch (err) {
                    console.error(`[DailyReminders] Failed to send reminder for booking ${booking.id}:`, err)
                }
            }

            console.log('[DailyReminders] Deposit reminders completed')
        } catch (error) {
            console.error('[DailyReminders] Error running deposit reminders:', error)
        }
    })

    console.log('✅ Daily deposit reminders cron job scheduled (00:00 UTC)')
}

export function initDailyReminders() {
    startDailyDepositReminders()
}
