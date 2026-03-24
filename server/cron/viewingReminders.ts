import cron from 'node-cron'
import { DynamoDBUtils, TABLES } from '../dynamodb.js'
import { sendEmail } from '../email-service.js'
import { notificationService } from '../services/notificationService.js'

function startViewingReminders() {
    // Run daily at 09:00 UTC
    cron.schedule('0 9 * * *', async () => {
        console.log('[ViewingReminders] Running viewing confirmation reminders...')
        try {
            const tomorrow = new Date()
            tomorrow.setDate(tomorrow.getDate() + 1)
            const tomorrowStr = tomorrow.toISOString().split('T')[0]

            // Get all scheduled viewings for tomorrow
            const viewings = await DynamoDBUtils.scanTable(
                TABLES.TOUR_PAYMENTS,
                'viewingDate = :date AND #status = :scheduled',
                { ':date': tomorrowStr, ':scheduled': 'scheduled' },
                { '#status': 'status' }
            )

            console.log(`[ViewingReminders] Found ${viewings.length} viewings tomorrow`)

            for (const viewing of viewings) {
                try {
                    // Get viewer details
                    const viewers = await DynamoDBUtils.scanTable(
                        TABLES.USERS,
                        'id = :id',
                        { ':id': String(viewing.userId) }
                    )

                    if (viewers.length === 0) continue
                    const viewer = viewers[0] as any

                    // Get property details
                    const properties = await DynamoDBUtils.scanTable(
                        TABLES.PROPERTIES,
                        'id = :id',
                        { ':id': String(viewing.propertyId) }
                    )

                    const property = properties.length > 0 ? (properties[0] as any) : null
                    const propertyTitle = property?.title || 'the property'
                    const propertyLocation = property?.location || ''

                    // Send email to viewer
                    if (viewer.email) {
                        await sendEmail({
                            to: viewer.email,
                            subject: '📅 Viewing Reminder: Tomorrow - REALEVR Estates',
                            html: `
                                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                                    <div style="background-color: #FF5A5F; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                                        <h2>REALEVR Estates</h2>
                                        <h3>📅 Property Viewing Tomorrow</h3>
                                    </div>
                                    <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
                                        <p>Dear ${viewer.fullName || viewer.username},</p>
                                        <p>This is a reminder that you have a property viewing scheduled for <strong>tomorrow</strong>.</p>
                                        <div style="background-color: #e8f4fd; border: 1px solid #2196F3; padding: 15px; border-radius: 5px; margin: 20px 0;">
                                            <p><strong>Property:</strong> ${propertyTitle}</p>
                                            <p><strong>Location:</strong> ${propertyLocation}</p>
                                            <p><strong>Date:</strong> ${tomorrowStr}</p>
                                        </div>
                                        <a href="${process.env.BASE_URL || 'http://localhost:5001'}/dashboard" 
                                           style="display: inline-block; background-color: #FF5A5F; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold;">
                                            View Details
                                        </a>
                                        <p style="color: #666; font-size: 14px;">If you need to reschedule, please contact us as soon as possible.</p>
                                    </div>
                                </div>
                            `,
                        })
                    }

                    // Create in-app notification for viewer
                    await notificationService.createNotification({
                        userId: String(viewing.userId),
                        title: '📅 Viewing Reminder: Tomorrow',
                        message: `You have a property viewing for ${propertyTitle} scheduled for tomorrow (${tomorrowStr}).`,
                        type: 'viewing',
                        channel: 'in-app',
                        link: '/dashboard',
                    })

                    // Notify property owner if available
                    if (property?.ownerId) {
                        await notificationService.createNotification({
                            userId: String(property.ownerId),
                            title: '📅 Viewing Tomorrow',
                            message: `${viewer.fullName || viewer.username} has a scheduled viewing of ${propertyTitle} tomorrow.`,
                            type: 'viewing',
                            channel: 'in-app',
                            link: '/dashboard',
                        })
                    }

                    console.log(`[ViewingReminders] Sent viewing reminder to user ${viewing.userId}`)
                } catch (err) {
                    console.error(`[ViewingReminders] Failed to send reminder for viewing ${viewing.id}:`, err)
                }
            }

            console.log('[ViewingReminders] Viewing reminders completed')
        } catch (error) {
            console.error('[ViewingReminders] Error running viewing reminders:', error)
        }
    })

    console.log('✅ Viewing reminders cron job scheduled (09:00 UTC)')
}

export function initViewingReminders() {
    startViewingReminders()
}
