/**
 * GENE Platform — unified admin broadcast: one composer, up to four real
 * channels (email, WhatsApp, in-app notification bell, browser push).
 * Backs client/src/pages/AdminBroadcast.tsx. Strict-admin gated.
 *
 * Deliberately a thin fan-out over infrastructure that already exists —
 * no new sending mechanism was invented for this route:
 *   - email    → server/email-service.ts's existing sendEmail (Gmail/
 *                nodemailer, already used for verification emails).
 *   - whatsapp → server/gene/whatsapp-growth.ts's broadcastWhatsappMessage
 *                (the exact same logic the pre-existing
 *                POST /api/gene/whatsapp/broadcast route uses).
 *   - notification → server/models/Notification.ts's createNotification,
 *                looped over every user — lands in the notification bell
 *                every signed-in user already has (NotificationCenter.tsx).
 *   - push     → server/gene/web-push.ts's sendPushToAllSubscribers.
 *
 * HONEST LIMITATIONS, by channel:
 *   - email: sent to EVERY user with an email address — there is no
 *     separate email-marketing opt-out yet (unlike WhatsApp's real
 *     stop/start). Also subject to your email provider's real sending
 *     limits (e.g. a plain Gmail account caps around 500/day) — this
 *     route does not throttle or queue, it just reports what happened.
 *   - whatsapp: only reaches numbers who've messaged your business
 *     number in the last 24 hours unless you pass an approved Meta
 *     template name — see whatsapp-growth.ts's own docs.
 *   - notification: only ever seen by a user who opens the site and
 *     looks at the bell — there's no read-receipt guarantee.
 *   - push: only reaches browsers that both granted permission AND kept
 *     an active subscription (see usePushSubscription.ts) — most visitors
 *     will not have this unless they explicitly opted in somewhere.
 * None of these are "delivered" guarantees — every response below
 * reports real attempted/sent/failed counts per channel, never a blanket
 * "message sent to all users."
 */
import type { Express, Request, Response, RequestHandler } from 'express'
import { storage } from '../storage'
import { sendEmail } from '../email-service'
import { createNotification } from '../models/Notification'
import { broadcastWhatsappMessage } from './whatsapp-growth'
import { sendPushToAllSubscribers } from './web-push'
import { readCollection } from './store'
import { isOptedIntoMarketing, type WhatsappUserLink } from './whatsapp-concierge'

const WHATSAPP_LINK_COLLECTION = 'gene_whatsapp_user_links'
const PUSH_SUBSCRIPTION_COLLECTION = 'gene_push_subscriptions'

type Channel = 'email' | 'whatsapp' | 'notification' | 'push'
const VALID_CHANNELS: Channel[] = ['email', 'whatsapp', 'notification', 'push']

function simpleEmailHtml(subject: string, message: string): string {
    // Minimal, safe HTML — the message is plain text typed by an admin, so
    // it's escaped rather than trusted as markup.
    const escaped = message
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br/>')
    return `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;">
<h2 style="margin:0 0 16px;">${subject}</h2>
<p style="white-space:pre-wrap;line-height:1.5;">${escaped}</p>
<hr style="margin:24px 0;border:none;border-top:1px solid #eee;"/>
<p style="color:#888;font-size:12px;">RealEVR Estates</p>
</div>`
}

async function sendEmailBroadcast(subject: string, message: string): Promise<{ attempted: number; sent: number; failed: number }> {
    const users = await storage.getAllUsers()
    const recipients = users.filter((u) => !!u.email)
    let sent = 0
    let failed = 0
    for (const u of recipients) {
        try {
            const ok = await sendEmail({ to: u.email, subject, html: simpleEmailHtml(subject, message), text: message })
            if (ok) sent += 1
            else failed += 1
        } catch (err) {
            console.error('[gene/broadcast] email send threw for', u.email, err)
            failed += 1
        }
    }
    return { attempted: recipients.length, sent, failed }
}

async function sendNotificationBroadcast(subject: string, message: string): Promise<{ attempted: number; sent: number; failed: number }> {
    const users = await storage.getAllUsers()
    let sent = 0
    let failed = 0
    for (const u of users) {
        try {
            await createNotification({
                userId: String(u.id),
                title: subject || 'RealEVR Estates',
                message,
                type: 'system',
            })
            sent += 1
        } catch (err) {
            console.error('[gene/broadcast] in-app notification failed for user', u.id, err)
            failed += 1
        }
    }
    return { attempted: users.length, sent, failed }
}

export function registerBroadcastRoutes(app: Express, requireStrictAdmin: RequestHandler): void {
    // GET /api/gene/broadcast/reach — realistic reach estimate per channel,
    // shown in the composer before sending so "send to all" isn't a leap
    // of faith.
    app.get('/api/gene/broadcast/reach', requireStrictAdmin, async (_req: Request, res: Response) => {
        try {
            const users = await storage.getAllUsers()
            const whatsappLinks = readCollection<WhatsappUserLink>(WHATSAPP_LINK_COLLECTION).filter(isOptedIntoMarketing)
            const pushRows = readCollection<{ userId: number }>(PUSH_SUBSCRIPTION_COLLECTION)
            const pushUniqueUsers = new Set(pushRows.map((r) => r.userId)).size

            res.json({
                email: { reach: users.filter((u) => !!u.email).length },
                whatsapp: { reach: whatsappLinks.length, note: 'Opted-in linked numbers — real delivery also depends on the 24h window/template, see broadcast docs.' },
                notification: { reach: users.length },
                push: { reach: pushUniqueUsers, configured: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) },
            })
        } catch (err) {
            console.error('[gene/broadcast] reach estimate failed:', err)
            res.status(500).json({ message: 'Failed to load reach estimate.' })
        }
    })

    // POST /api/gene/broadcast/send — { channels: Channel[], subject?, message, whatsappTemplateName?, whatsappLanguageCode? }
    app.post('/api/gene/broadcast/send', requireStrictAdmin, async (req: Request, res: Response) => {
        try {
            const message = typeof req.body?.message === 'string' ? req.body.message.trim() : ''
            const subject = typeof req.body?.subject === 'string' && req.body.subject.trim() ? req.body.subject.trim() : 'RealEVR Estates'
            const requestedChannels: string[] = Array.isArray(req.body?.channels) ? req.body.channels : []
            const channels = requestedChannels.filter((c): c is Channel => VALID_CHANNELS.includes(c as Channel))

            if (!message) return res.status(400).json({ message: 'A broadcast message is required.' })
            if (channels.length === 0) return res.status(400).json({ message: 'At least one valid channel is required (email, whatsapp, notification, push).' })

            const results: Record<string, unknown> = {}

            if (channels.includes('email')) {
                results.email = await sendEmailBroadcast(subject, message)
            }
            if (channels.includes('whatsapp')) {
                const templateName = typeof req.body?.whatsappTemplateName === 'string' ? req.body.whatsappTemplateName.trim() || undefined : undefined
                const languageCode = typeof req.body?.whatsappLanguageCode === 'string' ? req.body.whatsappLanguageCode.trim() : 'en_US'
                results.whatsapp = await broadcastWhatsappMessage(message, templateName, languageCode)
            }
            if (channels.includes('notification')) {
                results.notification = await sendNotificationBroadcast(subject, message)
            }
            if (channels.includes('push')) {
                results.push = await sendPushToAllSubscribers(subject, message)
            }

            res.json({ channels, results })
        } catch (err) {
            console.error('[gene/broadcast] send failed:', err)
            res.status(500).json({ message: 'Broadcast failed.' })
        }
    })
}
