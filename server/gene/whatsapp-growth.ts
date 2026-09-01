/**
 * GENE Platform — WhatsApp Business growth features: click-to-chat config,
 * marketing broadcast, and a WhatsApp/Meta Commerce catalog feed.
 *
 * These three are independent, narrowly-scoped additions on top of the
 * existing sendWhatsAppMessage/whatsapp-concierge.ts infrastructure — no
 * existing route or table is touched.
 *
 * 1) GET /api/config/whatsapp-business-number — [PUBLIC] serves the
 *    dialable WhatsApp Business number (WHATSAPP_DISPLAY_NUMBER, e.g.
 *    "256700000000") to the frontend for wa.me click-to-chat buttons/links.
 *    Kept server-side (rather than a Vite build-time env var) so it can be
 *    changed without a rebuild. Returns { number: null } if unset — the
 *    frontend hides the button rather than rendering a dead link.
 *
 * 2) POST /api/gene/whatsapp/broadcast — [STRICT ADMIN, see admin-guard.ts]
 *    sends a message to every WhatsApp-linked number that's opted in (see
 *    whatsapp-concierge.ts's `marketingOptIn` / "stop"/"start" commands).
 *    HONEST LIMITATION: without a `templateName`, this sends freeform text
 *    via sendWhatsAppMessage — which the WhatsApp Cloud API will only
 *    actually deliver to a recipient who has messaged the business number
 *    within the last 24 hours (Meta's "customer service window"). Anyone
 *    outside that window is silently dropped by Meta, not by this code.
 *    Real broadcast marketing beyond that window requires an approved
 *    message template (create one in Meta Business Manager, then pass its
 *    `templateName` here) — see sendWhatsAppTemplateMessage in ./whatsapp.
 *    This route reports attempted/sent/failed counts; it never claims
 *    guaranteed delivery.
 *
 * 3) GET /api/gene/whatsapp/catalog-feed.csv — [PUBLIC] a Meta Commerce
 *    Manager-compatible product feed (id, title, description, availability,
 *    price, link, image_link, ...) generated live from real listings. This
 *    is the buildable half of "WhatsApp catalog of properties" — actually
 *    browsing it inside a WhatsApp chat requires a one-time MANUAL setup in
 *    Meta Business Suite that no API lets code do on your behalf:
 *      a) Commerce Manager → create a catalog → add a "Data feed" source →
 *         point it at this route's full URL → set a fetch schedule.
 *      b) Business Settings → WhatsApp Accounts → connect that catalog to
 *         your WhatsApp Business Account.
 *      c) (Optional) enable the Catalog icon in the WhatsApp Business app,
 *         or reference catalog items from message templates.
 *    Documented here and in docs/GENE_PLATFORM.md rather than silently
 *    left half-built.
 *
 * Persistence: none new — reads server/storage.ts (properties) and
 * whatsapp-concierge.ts's existing link collection.
 */
import type { Express, Request, Response } from 'express'
import { storage } from '../storage'
import { requireStrictAdmin } from './admin-guard'
import { sendWhatsAppMessage, sendWhatsAppTemplateMessage } from './whatsapp'
import { readCollection } from './store'
import { isOptedIntoMarketing, type WhatsappUserLink } from './whatsapp-concierge'
import { getCanonicalBaseUrl } from '../sitemap'

const LINK_COLLECTION = 'gene_whatsapp_user_links' // shared contract with whatsapp-concierge.ts — read-only here

function csvEscape(value: string): string {
    const needsQuoting = /[",\n]/.test(value)
    const escaped = value.replace(/"/g, '""')
    return needsQuoting ? `"${escaped}"` : escaped
}

export function registerWhatsappGrowthRoutes(app: Express): void {
    // 1) Public config for the frontend's click-to-WhatsApp button(s).
    app.get('/api/config/whatsapp-business-number', (_req: Request, res: Response) => {
        const number = process.env.WHATSAPP_DISPLAY_NUMBER || null
        res.json({ number })
    })

    // 2) Admin-triggered marketing broadcast — strict admin only.
    app.post('/api/gene/whatsapp/broadcast', requireStrictAdmin, async (req: Request, res: Response) => {
        try {
            const message = typeof req.body?.message === 'string' ? req.body.message.trim() : ''
            const templateName = typeof req.body?.templateName === 'string' ? req.body.templateName.trim() : undefined
            const languageCode = typeof req.body?.languageCode === 'string' ? req.body.languageCode.trim() : 'en_US'
            if (!message) return res.status(400).json({ message: 'A broadcast message is required.' })

            const links = readCollection<WhatsappUserLink>(LINK_COLLECTION).filter(isOptedIntoMarketing)
            let sent = 0
            let failed = 0
            const failures: Array<{ phone: string; reason?: string }> = []

            for (const link of links) {
                const result = templateName
                    ? await sendWhatsAppTemplateMessage(link.phone, templateName, languageCode, [message])
                    : await sendWhatsAppMessage(link.phone, message)
                if (result.sent) sent += 1
                else {
                    failed += 1
                    failures.push({ phone: link.phone, reason: result.reason })
                }
            }

            res.json({
                attempted: links.length,
                sent,
                failed,
                failures: failures.slice(0, 20), // cap — this is a debugging aid, not a full audit log
                note: templateName
                    ? undefined
                    : 'Sent as freeform text — WhatsApp only delivers this to numbers that messaged the business within the last 24 hours. Pass templateName (from an approved Meta template) to reach everyone opted in.',
            })
        } catch (err) {
            console.error('[gene/whatsapp-growth] broadcast failed:', err)
            res.status(500).json({ message: 'Broadcast failed.' })
        }
    })

    // 3) Public Meta Commerce-compatible catalog feed.
    app.get('/api/gene/whatsapp/catalog-feed.csv', async (_req: Request, res: Response) => {
        try {
            const base = getCanonicalBaseUrl()
            const properties = await storage.getAllProperties()
            const header = ['id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link']
            const lines = [header.join(',')]

            for (const p of properties) {
                if (!p.isAvailable) continue
                const row = [
                    String(p.id),
                    p.title ?? '',
                    (p.description ?? '').replace(/\s+/g, ' ').slice(0, 5000),
                    'in stock',
                    'new',
                    `${p.price} ${p.currency ?? 'UGX'}`,
                    `${base}/property/${p.id}`,
                    p.imageUrl ?? '',
                ].map((v) => csvEscape(String(v)))
                lines.push(row.join(','))
            }

            res.setHeader('Content-Type', 'text/csv; charset=utf-8')
            res.send(lines.join('\n'))
        } catch (err) {
            console.error('[gene/whatsapp-growth] catalog feed failed:', err)
            res.status(500).json({ message: 'Failed to generate catalog feed.' })
        }
    })
}
