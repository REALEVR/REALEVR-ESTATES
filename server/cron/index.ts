import cron from 'node-cron'
import { runDepositReminders } from './dailyReminders'
import { runViewingReminders } from './viewingReminders'
import { postDailyUpdate } from '../social'

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

    console.log(`[Cron] Scheduled jobs initialized: deposit reminders (00:00 UTC), viewing reminders (09:00 UTC), social post (${socialCron} UTC)`)
}

export { runDepositReminders, runViewingReminders, postDailyUpdate }
