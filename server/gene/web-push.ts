/**
 * GENE Platform — real browser push notifications (VAPID / Web Push API),
 * the "notify users even when the site is closed" piece of the admin
 * broadcast tool. Entirely additive: a new JSON collection
 * (gene_push_subscriptions, see ./store), a public VAPID-public-key +
 * subscribe/unsubscribe route, and a `sendPushToAllSubscribers` function
 * ./broadcast.ts calls — no existing route or table touched.
 *
 * ENV-GATED, GRACEFUL DEGRADE: without VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY
 * set, GET /vapid-public-key returns { publicKey: null } (the client-side
 * subscribe hook — see client/src/hooks/usePushSubscription.ts — treats
 * that as "push isn't available yet" and simply never prompts), and
 * `sendPushToAllSubscribers` returns { sent: 0, failed: 0, reason: '...' }
 * rather than throwing.
 *
 * SETUP: VAPID keys are a self-contained key pair (no external account/
 * service needed, unlike Google OAuth) — set VAPID_PUBLIC_KEY,
 * VAPID_PRIVATE_KEY, and VAPID_SUBJECT (a mailto: address or your site URL
 * — the Web Push spec requires *some* contact identity here) on your host.
 *
 * Requires the browser side to register client/public/sw.js (already
 * exists for PWA installability — this pass adds a `push` and
 * `notificationclick` listener to it) and grant Notification permission —
 * both handled by the subscribe hook, never assumed.
 */
import type { Express, Request, Response, RequestHandler } from 'express'
import webpush from 'web-push'
import { readCollection, writeCollection, nextId, nowIso } from './store'

const COLLECTION = 'gene_push_subscriptions'

export interface PushSubscriptionRecord {
    id: number
    userId: number
    endpoint: string
    keys: { p256dh: string; auth: string }
    createdAt: string
}

function isPushConfigured(): boolean {
    return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

function configureWebPush(): void {
    const subject = process.env.VAPID_SUBJECT || 'mailto:support@realevrestates.com'
    webpush.setVapidDetails(subject, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!)
}

/**
 * Sends one payload to every stored subscription. Best-effort per
 * subscription: a 404/410 (browser says the subscription is gone) prunes
 * that row so future sends don't keep retrying a dead endpoint; any other
 * failure is just counted, not treated as fatal to the batch. Exported for
 * ./broadcast.ts.
 */
export async function sendPushToAllSubscribers(title: string, body: string, url?: string): Promise<{ sent: number; failed: number; pruned: number; reason?: string }> {
    if (!isPushConfigured()) {
        return { sent: 0, failed: 0, pruned: 0, reason: 'Push notifications are not configured (VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY unset).' }
    }
    configureWebPush()

    const rows = readCollection<PushSubscriptionRecord>(COLLECTION)
    const payload = JSON.stringify({ title, body, url: url || '/' })

    let sent = 0
    let failed = 0
    const deadIds = new Set<number>()

    for (const row of rows) {
        try {
            await webpush.sendNotification({ endpoint: row.endpoint, keys: row.keys } as any, payload)
            sent += 1
        } catch (err: any) {
            failed += 1
            const statusCode = err?.statusCode
            if (statusCode === 404 || statusCode === 410) {
                deadIds.add(row.id)
            }
        }
    }

    if (deadIds.size > 0) {
        const remaining = rows.filter((r) => !deadIds.has(r.id))
        writeCollection(COLLECTION, remaining)
    }

    return { sent, failed, pruned: deadIds.size }
}

export function registerWebPushRoutes(app: Express, requireStrictAdmin: RequestHandler): void {
    // GET /api/gene/push/vapid-public-key — [PUBLIC] the client needs this
    // to call PushManager.subscribe(). Returns null (not an error) if unset.
    app.get('/api/gene/push/vapid-public-key', (_req: Request, res: Response) => {
        res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null })
    })

    // POST /api/gene/push/subscribe — [AUTH] store/update this browser's
    // push subscription for the signed-in user.
    app.post('/api/gene/push/subscribe', (req: Request, res: Response) => {
        if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
            return res.status(401).json({ message: 'Sign in first.' })
        }
        if (!isPushConfigured()) {
            return res.status(503).json({ message: 'Push notifications are not configured yet.' })
        }
        try {
            const { endpoint, keys } = req.body?.subscription ?? req.body ?? {}
            if (typeof endpoint !== 'string' || !keys?.p256dh || !keys?.auth) {
                return res.status(400).json({ message: 'A valid push subscription (endpoint + keys) is required.' })
            }
            const userId = (req.user as any).id
            const rows = readCollection<PushSubscriptionRecord>(COLLECTION)
            const idx = rows.findIndex((r) => r.userId === userId && r.endpoint === endpoint)
            const record: PushSubscriptionRecord = {
                id: idx === -1 ? nextId(rows) : rows[idx].id,
                userId,
                endpoint,
                keys: { p256dh: keys.p256dh, auth: keys.auth },
                createdAt: idx === -1 ? nowIso() : rows[idx].createdAt,
            }
            if (idx === -1) rows.push(record)
            else rows[idx] = record
            writeCollection(COLLECTION, rows)
            res.json({ subscribed: true })
        } catch (err: any) {
            console.error('[gene/web-push] subscribe failed:', err)
            res.status(500).json({ message: 'Failed to save push subscription.' })
        }
    })

    // POST /api/gene/push/unsubscribe — [AUTH]
    app.post('/api/gene/push/unsubscribe', (req: Request, res: Response) => {
        if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
            return res.status(401).json({ message: 'Sign in first.' })
        }
        try {
            const { endpoint } = req.body ?? {}
            const userId = (req.user as any).id
            const rows = readCollection<PushSubscriptionRecord>(COLLECTION)
            const remaining = rows.filter((r) => !(r.userId === userId && (!endpoint || r.endpoint === endpoint)))
            writeCollection(COLLECTION, remaining)
            res.json({ unsubscribed: true })
        } catch (err: any) {
            console.error('[gene/web-push] unsubscribe failed:', err)
            res.status(500).json({ message: 'Failed to remove push subscription.' })
        }
    })

    // GET /api/gene/push/status — [STRICT ADMIN] how many subscribers exist,
    // for the broadcast composer to show a realistic reach estimate.
    app.get('/api/gene/push/status', requireStrictAdmin, (_req: Request, res: Response) => {
        const rows = readCollection<PushSubscriptionRecord>(COLLECTION)
        const uniqueUsers = new Set(rows.map((r) => r.userId)).size
        res.json({ configured: isPushConfigured(), subscriptionCount: rows.length, uniqueUserCount: uniqueUsers })
    })
}
