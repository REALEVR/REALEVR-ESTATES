/**
 * GENE Platform — human handoff via WhatsApp for low-confidence chat inquiries.
 *
 * This module reads/writes the `gene_escalations` collection that Team 1's
 * chat module (server/gene/chat.ts) writes to. The shape is a shared
 * contract — do NOT redefine it here, only add fields this module itself
 * introduces (assignedTo/assignedAt/resolvedAt/resolutionNote) via updates.
 *
 * NOTE: the task brief for this module described the status union as
 * 'open' | 'assigned' | 'resolved', but chat.ts (the actual writer of this
 * collection) defines `GeneEscalation.status` as
 * 'open' | 'in_progress' | 'resolved'. This file follows chat.ts's real
 * shape ('in_progress' on claim) since that's the authoritative contract —
 * using an out-of-union value here would silently break interop even though
 * JS wouldn't complain about it at runtime.
 *
 * Persistence: shared JSON-file collection store (see ./store.ts).
 */
import type { Express, Request, Response, RequestHandler } from 'express'
import fetch from 'node-fetch'
import { readCollection, writeCollection, nowIso } from './store'

const COLLECTION = 'gene_escalations'

export type EscalationStatus = 'open' | 'in_progress' | 'resolved'

/** Shared contract with server/gene/chat.ts — read/update only, never redefine. */
export interface EscalationRecord {
    id: number
    sessionId: string
    message: string
    reason: string
    createdAt: string
    status: EscalationStatus
    // Fields this module adds on top of the shared shape:
    assignedTo?: string
    assignedAt?: string
    resolvedAt?: string
    resolutionNote?: string
    customerPhone?: string
}

/**
 * Best-effort WhatsApp Cloud API sender. Never throws — callers should treat
 * this as fire-and-forget with a status they can log/report on.
 */
export async function sendWhatsAppMessage(to: string, body: string): Promise<{ sent: boolean; reason?: string }> {
    const token = process.env.WHATSAPP_BUSINESS_TOKEN
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

    if (!token || !phoneNumberId) {
        console.log(
            `[gene/whatsapp] WhatsApp not configured — would have sent to ${to}: ${body}`
        )
        return {
            sent: false,
            reason: 'WhatsApp credentials not configured — see docs/GENE_PLATFORM.md',
        }
    }

    try {
        const response = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to,
                type: 'text',
                text: { body },
            }),
        })

        if (!response.ok) {
            const errText = await response.text().catch(() => '')
            console.error(`[gene/whatsapp] send failed (${response.status}): ${errText}`)
            return { sent: false, reason: `WhatsApp API returned ${response.status}` }
        }

        return { sent: true }
    } catch (error: any) {
        console.error('[gene/whatsapp] send threw:', error)
        return { sent: false, reason: error?.message ?? 'Unknown error sending WhatsApp message' }
    }
}

/**
 * Sends a pre-approved WhatsApp message *template* rather than freeform
 * text. The WhatsApp Cloud API only allows a business to message a number
 * outside the 24-hour "customer service window" (i.e. the number hasn't
 * messaged the business recently) using a template that's been approved in
 * advance in Meta Business Manager — `sendWhatsAppMessage` above will be
 * silently rejected by Meta's API for exactly this case. This is that path,
 * used by server/gene/whatsapp-growth.ts's broadcast route when a
 * `templateName` is supplied. Nothing in this codebase can create the
 * template itself — that's a manual step in Meta Business Manager — this
 * only sends against a template that already exists there.
 */
export async function sendWhatsAppTemplateMessage(
    to: string,
    templateName: string,
    languageCode: string = 'en_US',
    bodyParams: string[] = []
): Promise<{ sent: boolean; reason?: string }> {
    const token = process.env.WHATSAPP_BUSINESS_TOKEN
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

    if (!token || !phoneNumberId) {
        console.log(`[gene/whatsapp] WhatsApp not configured — would have sent template "${templateName}" to ${to}`)
        return { sent: false, reason: 'WhatsApp credentials not configured — see docs/GENE_PLATFORM.md' }
    }

    try {
        const response = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to,
                type: 'template',
                template: {
                    name: templateName,
                    language: { code: languageCode },
                    ...(bodyParams.length
                        ? { components: [{ type: 'body', parameters: bodyParams.map((text) => ({ type: 'text', text })) }] }
                        : {}),
                },
            }),
        })
        if (!response.ok) {
            const errText = await response.text().catch(() => '')
            console.error(`[gene/whatsapp] template send failed (${response.status}): ${errText}`)
            return { sent: false, reason: `WhatsApp API returned ${response.status} — is "${templateName}" an approved template in Meta Business Manager?` }
        }
        return { sent: true }
    } catch (error: any) {
        console.error('[gene/whatsapp] template send threw:', error)
        return { sent: false, reason: error?.message ?? 'Unknown error sending WhatsApp template message' }
    }
}

/**
 * Escalation trigger policy — pure function so any future caller (webhook,
 * batch job, etc.) can reuse the exact same rule Team 1's chat module
 * applies inline. Not wired into chat.ts by this module.
 */
export function shouldEscalate(intent: string, confidenceHint?: 'low' | 'medium' | 'high'): boolean {
    if (intent === 'human_handoff_request') return true
    if (intent === 'general_question' && confidenceHint === 'low') return true
    return false
}

function getRequestUserLabel(req: Request): string {
    const user = req.user as { username?: string; email?: string; id?: number } | undefined
    return user?.username ?? user?.email ?? (user?.id !== undefined ? `user:${user.id}` : 'unknown-admin')
}

export function registerWhatsappRoutes(app: Express, adminMiddleware: RequestHandler): void {
    // Agent inbox / queue — open escalations, newest first.
    app.get('/api/gene/whatsapp/inbox', adminMiddleware, (_req: Request, res: Response) => {
        try {
            const rows = readCollection<EscalationRecord>(COLLECTION)
            const open = rows
                .filter((r) => r.status === 'open')
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            res.json(open)
        } catch (error: any) {
            console.error('[gene/whatsapp] inbox fetch failed:', error)
            res.status(500).json({ message: 'Failed to load escalation inbox' })
        }
    })

    app.post('/api/gene/whatsapp/inbox/:id/claim', adminMiddleware, (req: Request, res: Response) => {
        try {
            const rows = readCollection<EscalationRecord>(COLLECTION)
            const idx = rows.findIndex((r) => String(r.id) === req.params.id)
            if (idx === -1) {
                return res.status(404).json({ message: 'Escalation not found' })
            }

            rows[idx].status = 'in_progress'
            rows[idx].assignedTo = getRequestUserLabel(req)
            rows[idx].assignedAt = nowIso()

            writeCollection(COLLECTION, rows)
            res.json(rows[idx])
        } catch (error: any) {
            console.error('[gene/whatsapp] claim failed:', error)
            res.status(500).json({ message: 'Failed to claim escalation' })
        }
    })

    app.post('/api/gene/whatsapp/inbox/:id/resolve', adminMiddleware, async (req: Request, res: Response) => {
        try {
            const rows = readCollection<EscalationRecord>(COLLECTION)
            const idx = rows.findIndex((r) => String(r.id) === req.params.id)
            if (idx === -1) {
                return res.status(404).json({ message: 'Escalation not found' })
            }

            const { resolutionNote } = req.body ?? {}

            rows[idx].status = 'resolved'
            rows[idx].resolvedAt = nowIso()
            if (typeof resolutionNote === 'string') {
                rows[idx].resolutionNote = resolutionNote
            }

            writeCollection(COLLECTION, rows)
            const resolved = rows[idx]

            // Best-effort customer notification — never fail the request over it.
            let notification: { sent: boolean; reason?: string } | undefined
            if (resolved.customerPhone) {
                notification = await sendWhatsAppMessage(
                    resolved.customerPhone,
                    'Hi! Your inquiry has been resolved by our team. Reply here if you have any more questions.'
                )
            }

            res.json({ ...resolved, notification })
        } catch (error: any) {
            console.error('[gene/whatsapp] resolve failed:', error)
            res.status(500).json({ message: 'Failed to resolve escalation' })
        }
    })
}
