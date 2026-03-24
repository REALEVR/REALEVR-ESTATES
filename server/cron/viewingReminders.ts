import { DynamoDBUtils, TABLES } from '../dynamodb'
import { sendEmail } from '../email-service'

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000

export async function runViewingReminders(): Promise<void> {
    console.log('[ViewingReminders] Running viewing confirmation reminders...')
    const now = Date.now()
    const upcoming = new Date(now + TWO_DAYS_MS).toISOString()

    try {
        // Scan bookings/viewings scheduled within the next 2 days that are unconfirmed
        const viewings = await DynamoDBUtils.scanTable(
            (TABLES as any).BOOKINGS,
            '#status = :status AND viewingDate <= :upcoming',
            { ':status': 'pending', ':upcoming': upcoming },
            { '#status': 'status' }
        )

        console.log(`[ViewingReminders] Found ${viewings.length} upcoming viewings to remind`)

        for (const viewing of viewings as any[]) {
            try {
                const user = await DynamoDBUtils.getItem((TABLES as any).USERS, { id: viewing.userId })
                if (!user || !(user as any).email) {
                    console.warn(`[ViewingReminders] No user/email found for viewing ${viewing.id}`)
                    continue
                }

                const property = await DynamoDBUtils.getItem((TABLES as any).PROPERTIES, {
                    id: viewing.propertyId,
                })

                const tenantName = (user as any).fullName || (user as any).username || 'Tenant'
                const propertyTitle = property ? (property as any).title : 'your property viewing'
                const viewingDate = viewing.viewingDate
                    ? new Date(viewing.viewingDate).toLocaleString('en-UG', {
                          dateStyle: 'full',
                          timeStyle: 'short',
                      })
                    : 'your scheduled date'

                await sendEmail({
                    to: (user as any).email,
                    subject: 'Reminder: Upcoming Property Viewing – RealEVR Estates',
                    html: generateViewingReminderHtml(tenantName, propertyTitle, viewingDate, viewing.id),
                    text: `Hi ${tenantName},\n\nThis is a reminder about your upcoming viewing of "${propertyTitle}" on ${viewingDate}.\n\nPlease confirm your attendance or contact us if you need to reschedule.\n\nBest regards,\nRealEVR Estates Team`,
                })

                console.log(`[ViewingReminders] Reminder sent for viewing ${viewing.id} to ${(user as any).email}`)
            } catch (itemError) {
                console.error(`[ViewingReminders] Error processing viewing ${viewing.id}:`, itemError)
            }
        }

        console.log('[ViewingReminders] Viewing reminders complete.')
    } catch (error) {
        console.error('[ViewingReminders] Failed to run viewing reminders:', error)
    }
}

function generateViewingReminderHtml(
    tenantName: string,
    propertyTitle: string,
    viewingDate: string,
    viewingId: string
): string {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Viewing Reminder - RealEVR Estates</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #FF5A5F; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; background-color: #FF5A5F; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
        .info-box { background-color: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 15px; margin: 15px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="header"><h1>Upcoming Property Viewing</h1></div>
      <div class="content">
        <h2>Hi ${tenantName},</h2>
        <p>This is a reminder about your upcoming viewing of <strong>"${propertyTitle}"</strong>.</p>
        <div class="info-box">
          <strong>📅 Scheduled Date &amp; Time:</strong><br/>
          ${viewingDate}
        </div>
        <p>Please confirm your attendance by clicking the button below, or contact us to reschedule.</p>
        <a href="${process.env.APP_URL || 'https://realevr.com'}/profile" class="button">Confirm Viewing</a>
        <p style="color: #888; font-size: 13px;">Viewing reference: ${viewingId}</p>
        <p>Best regards,<br>The RealEVR Estates Team</p>
      </div>
      <div class="footer">
        <p>&copy; ${new Date().getFullYear()} RealEVR Estates. All rights reserved.</p>
      </div>
    </body>
    </html>
  `
}
