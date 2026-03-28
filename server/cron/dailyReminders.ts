import { DynamoDBUtils, TABLES, generateTimestamp } from '../dynamodb'
import { sendEmail } from '../email-service'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export async function runDepositReminders(): Promise<void> {
    console.log('[DailyReminders] Running deposit reminders...')
    const now = Date.now()
    const cutoff = new Date(now - SEVEN_DAYS_MS).toISOString()

    try {
        // Scan bookings for unpaid deposits on confirmed bookings within the last 7 days
        const bookings = await DynamoDBUtils.scanTable(
            (TABLES as any).BOOKINGS,
            'depositPaid = :paid AND #status = :status AND createdAt >= :cutoff',
            { ':paid': false, ':status': 'confirmed', ':cutoff': cutoff },
            { '#status': 'status' }
        )

        console.log(`[DailyReminders] Found ${bookings.length} bookings with unpaid deposits`)

        for (const booking of bookings as any[]) {
            try {
                // Fetch tenant details
                const user = await DynamoDBUtils.getItem((TABLES as any).USERS, { id: booking.userId })
                if (!user || !(user as any).email) {
                    console.warn(`[DailyReminders] No user/email found for booking ${booking.id}`)
                    continue
                }

                // Fetch property details
                const property = await DynamoDBUtils.getItem((TABLES as any).PROPERTIES, {
                    id: booking.propertyId,
                })

                const tenantName = (user as any).fullName || (user as any).username || 'Tenant'
                const propertyTitle = property ? (property as any).title : 'your reserved property'

                await sendEmail({
                    to: (user as any).email,
                    subject: 'Reminder: Deposit Payment Pending – RealEVR Estates',
                    html: generateDepositReminderHtml(tenantName, propertyTitle, booking.id),
                    text: `Hi ${tenantName},\n\nThis is a reminder that your deposit for "${propertyTitle}" is still pending. Please complete your payment to secure your booking.\n\nBest regards,\nRealEVR Estates Team`,
                })

                console.log(`[DailyReminders] Reminder sent for booking ${booking.id} to ${(user as any).email}`)
            } catch (itemError) {
                console.error(`[DailyReminders] Error processing booking ${booking.id}:`, itemError)
            }
        }

        console.log('[DailyReminders] Deposit reminders complete.')
    } catch (error) {
        console.error('[DailyReminders] Failed to run deposit reminders:', error)
    }
}

function generateDepositReminderHtml(tenantName: string, propertyTitle: string, bookingId: string): string {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Deposit Reminder - RealEVR Estates</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #FF5A5F; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; background-color: #FF5A5F; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="header"><h1>Deposit Reminder</h1></div>
      <div class="content">
        <h2>Hi ${tenantName},</h2>
        <p>This is a friendly reminder that your deposit payment for <strong>"${propertyTitle}"</strong> is still pending.</p>
        <p>Your booking is confirmed but will not be fully secured until the deposit is paid. Please complete your payment at your earliest convenience.</p>
        <a href="${process.env.APP_URL || 'https://realevr.com'}/profile" class="button">Pay Deposit Now</a>
        <p style="color: #888; font-size: 13px;">Booking reference: ${bookingId}</p>
        <p>If you have already made the payment, please disregard this email.</p>
        <p>Best regards,<br>The RealEVR Estates Team</p>
      </div>
      <div class="footer">
        <p>&copy; ${new Date().getFullYear()} RealEVR Estates. All rights reserved.</p>
      </div>
    </body>
    </html>
  `
}
