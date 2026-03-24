import cron from 'node-cron'
import { runDepositReminders } from './dailyReminders'
import { runViewingReminders } from './viewingReminders'

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

    console.log('[Cron] Scheduled jobs initialized: deposit reminders (00:00 UTC), viewing reminders (09:00 UTC)')
}

export { runDepositReminders, runViewingReminders }
