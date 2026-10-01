import cron from 'node-cron'
import { runDepositReminders } from './dailyReminders'
import { runViewingReminders } from './viewingReminders'
import { postDailyUpdate } from '../social'
import { sendWeeklyAnalyticsExport } from '../gene/analytics-export'
import { runTourHealth } from '../gene/tour-health'
import { finalizeDueAuctions } from '../gene/auctions'
import { sendPendingInvites } from '../gene/partner-program'

let initialized = false

export function initCronJobs(): void {
    if (initialized) {
        console.log('[Cron] Jobs already initialized, skipping.')
        return
    }
    initialized = true

    // Daily deposit reminders at 00:00 UTC
    cron.schedule('0 0 * * *', async () => {
        console.log('[Cron] Triggering daily deposit reminders...')
        await runDepositReminders()
    }, { timezone: 'UTC' })

    // Viewing confirmation reminders at 09:00 UTC
    cron.schedule('0 9 * * *', async () => {
        console.log('[Cron] Triggering viewing confirmation reminders...')
        await runViewingReminders()
    }, { timezone: 'UTC' })

    // Daily social media post (Facebook/Instagram/X/LinkedIn), schedule configurable
    // via SOCIAL_POST_CRON. Each platform silently skips if not yet configured.
    const socialCron = process.env.SOCIAL_POST_CRON || '0 12 * * *'
    cron.schedule(socialCron, async () => {
        console.log('[Cron] Triggering daily social media post...')
        await postDailyUpdate()
    }, { timezone: 'UTC' })

    // Weekly property analytics export (WhatsApp + email to the platform
    // owner) — every Saturday at exactly 10:00 AM, East Africa Time (the
    // business's own timezone, not UTC like the jobs above — "10am" means
    // the owner's local wall-clock time). See ../gene/analytics-export.ts.
    cron.schedule('0 10 * * 6', async () => {
        console.log('[Cron] Triggering weekly property analytics export...')
        await sendWeeklyAnalyticsExport()
    }, { timezone: 'Africa/Kampala' })

    // Live auctions close on the minute: the winner is fixed and everyone concerned is told.
    cron.schedule('* * * * *', () => {
        finalizeDueAuctions().catch((err) => console.error('[Cron] closing auctions failed:', err))
    }, { timezone: 'UTC' })

    // Partner-programme invitations go out a few at a time (PARTNER_INVITES_PER_RUN, default 20) so a mailbox is never flooded.
    cron.schedule('11 * * * *', () => {
        sendPendingInvites().catch((err) => console.error('[Cron] sending partner invitations failed:', err))
    }, { timezone: 'UTC' })

    // Every virtual tour is opened the way a visitor's browser would, every six hours; broken ones are reported
    // to the administrators (dashboard bell, email, WhatsApp). TOUR_HEALTH_CRON changes the schedule.
    cron.schedule(process.env.TOUR_HEALTH_CRON || '17 */6 * * *', async () => {
        console.log('[Cron] Checking that every virtual tour loads...')
        await runTourHealth().catch((err) => console.error('[Cron] tour health check failed:', err))
    }, { timezone: 'UTC' })

    console.log(`[Cron] Scheduled jobs initialized: tour health (every 6h), deposit reminders (00:00 UTC), viewing reminders (09:00 UTC), social post (${socialCron} UTC), weekly analytics export (Sat 10:00 EAT)`)
}

export { runDepositReminders, runViewingReminders, postDailyUpdate, sendWeeklyAnalyticsExport }
