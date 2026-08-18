/**
 * GENE Platform — agent WhatsApp group onboarding.
 *
 * IMPORTANT REAL-WORLD CONSTRAINT: WhatsApp's official Business Platform
 * (Cloud API) does NOT expose any endpoint to programmatically add a phone
 * number to a WhatsApp Group — Meta does not allow this, for any legitimate
 * integration, as an anti-spam policy. So "automatically adds them to the
 * WhatsApp group" cannot literally mean a zero-tap, silent addition. The
 * honest, correct implementation here is: the moment an agent connects their
 * number, the system automatically and immediately sends them (via
 * `sendWhatsAppMessage`, see ./whatsapp.ts) a WhatsApp Group invite link
 * (`https://chat.whatsapp.com/...`, which the group admin generates once
 * inside the WhatsApp app itself and configures as the
 * `WHATSAPP_AGENT_GROUP_INVITE_LINK` env var) so joining is one tap, not a
 * multi-step manual process. This module does NOT and CANNOT pretend to add
 * anyone to a WhatsApp group programmatically — that API does not exist.
 *
 * Because WhatsApp also gives no webhook/signal for "user actually joined
 * the group", the final confirmation step is a manual admin action
 * (`mark-joined`) once they've visually verified membership inside WhatsApp.
 *
 * Persistence: shared JSON-file collection store (see ./store.ts).
 */
import type { Express, Request, Response, RequestHandler } from 'express'
import { readCollection, writeCollection, nextId, nowIso } from './store'
import { sendWhatsAppMessage } from './whatsapp'

const COLLECTION = 'gene_agent_whatsapp_links'

export type AgentWhatsappLinkStatus = 'invited' | 'joined_confirmed'

export interface AgentWhatsappLink {
    id: number
    userId: number
    userName: string
    whatsappNumber: string
    status: AgentWhatsappLinkStatus
    invitedAt: string
    confirmedAt?: string
    confirmedBy?: string
}

/** Basic sanity check — digits and an optional leading '+' only. */
const PHONE_SANITY_RE = /^\+?[0-9]{6,20}$/

function getRequestUserLabel(req: Request): string {
    const user = req.user as { username?: string; email?: string; id?: number } | undefined
    return user?.username ?? user?.email ?? (user?.id !== undefined ? `user:${user.id}` : 'unknown-user')
}

/**
 * Local equivalent of routes.ts's `adminMiddleware`, but allowing agents too
 * (matching its exact logic: authenticated, and role is 'admin' or 'agent').
 * Kept local per task brief — do not import anything private from routes.ts.
 */
function requireAgentOrAdmin(req: Request, res: Response, next: () => void): void {
    const isAuthenticated = typeof req.isAuthenticated === 'function' && req.isAuthenticated()
    if (!isAuthenticated) {
        res.status(401).json({ message: 'Not authenticated' })
        return
    }

    const user = req.user as { role?: string } | undefined
    if (!user?.role || (user.role !== 'admin' && user.role !== 'agent')) {
        res.status(403).json({ message: 'Unauthorized. Admin or agent role required.' })
        return
    }

    next()
}

export function registerAgentWhatsappOnboardingRoutes(
    app: Express,
    adminMiddleware: RequestHandler
): void {
    // Agent (or admin) connects their WhatsApp number — saves it and, if a
    // group invite link is configured, immediately sends it via WhatsApp.
    app.post('/api/gene/whatsapp/agents/connect', requireAgentOrAdmin, async (req: Request, res: Response) => {
        try {
            const { whatsappNumber } = req.body ?? {}

            if (typeof whatsappNumber !== 'string' || whatsappNumber.trim().length === 0) {
                return res.status(400).json({ message: 'whatsappNumber is required' })
            }

            const trimmedNumber = whatsappNumber.trim()
            if (!PHONE_SANITY_RE.test(trimmedNumber)) {
                return res.status(400).json({
                    message: 'whatsappNumber must contain only digits and an optional leading +',
                })
            }

            const user = req.user as { id?: number } | undefined
            const userId = user?.id
            if (userId === undefined) {
                return res.status(401).json({ message: 'Not authenticated' })
            }
            const userName = getRequestUserLabel(req)

            const rows = readCollection<AgentWhatsappLink>(COLLECTION)
            const idx = rows.findIndex((r) => r.userId === userId)

            const record: AgentWhatsappLink = {
                id: idx === -1 ? nextId(rows) : rows[idx].id,
                userId,
                userName,
                whatsappNumber: trimmedNumber,
                status: 'invited',
                invitedAt: nowIso(),
            }

            if (idx === -1) {
                rows.push(record)
            } else {
                rows[idx] = record
            }

            writeCollection(COLLECTION, rows)

            const inviteLink = process.env.WHATSAPP_AGENT_GROUP_INVITE_LINK
            if (!inviteLink) {
                return res.status(200).json({
                    linked: true,
                    inviteSent: false,
                    message:
                        'Saved your number, but no WhatsApp group invite link is configured yet — ask your admin to set WHATSAPP_AGENT_GROUP_INVITE_LINK.',
                })
            }

            const messageBody =
                `Welcome to the team! Join our WhatsApp agent group here: ${inviteLink}\n\n` +
                `Just tap the link and hit "Join Group" in WhatsApp — that's it, one tap.`

            const result = await sendWhatsAppMessage(trimmedNumber, messageBody)

            return res.status(200).json({
                linked: true,
                inviteSent: result.sent,
                ...(result.sent ? {} : { inviteSendReason: result.reason }),
            })
        } catch (error: any) {
            console.error('[gene/agent-whatsapp-onboarding] connect failed:', error)
            res.status(500).json({ message: 'Failed to connect WhatsApp number' })
        }
    })

    // Caller's own link status.
    app.get('/api/gene/whatsapp/agents/me', requireAgentOrAdmin, (req: Request, res: Response) => {
        try {
            const user = req.user as { id?: number } | undefined
            const userId = user?.id
            if (userId === undefined) {
                return res.status(401).json({ message: 'Not authenticated' })
            }

            const rows = readCollection<AgentWhatsappLink>(COLLECTION)
            const record = rows.find((r) => r.userId === userId)

            if (!record) {
                return res.json({ linked: false })
            }

            res.json(record)
        } catch (error: any) {
            console.error('[gene/agent-whatsapp-onboarding] me fetch failed:', error)
            res.status(500).json({ message: 'Failed to load WhatsApp link status' })
        }
    })

    // Admin: list all agent WhatsApp links, newest first.
    app.get('/api/gene/whatsapp/agents', adminMiddleware, (_req: Request, res: Response) => {
        try {
            const rows = readCollection<AgentWhatsappLink>(COLLECTION)
            const sorted = [...rows].sort(
                (a, b) => new Date(b.invitedAt).getTime() - new Date(a.invitedAt).getTime()
            )
            res.json(sorted)
        } catch (error: any) {
            console.error('[gene/agent-whatsapp-onboarding] list failed:', error)
            res.status(500).json({ message: 'Failed to load WhatsApp links' })
        }
    })

    // Admin: manually confirm an agent has actually joined the WhatsApp
    // group (no programmatic signal exists for this — see file-top comment).
    app.post('/api/gene/whatsapp/agents/:id/mark-joined', adminMiddleware, (req: Request, res: Response) => {
        try {
            const rows = readCollection<AgentWhatsappLink>(COLLECTION)
            const idx = rows.findIndex((r) => String(r.id) === req.params.id)
            if (idx === -1) {
                return res.status(404).json({ message: 'WhatsApp link not found' })
            }

            rows[idx].status = 'joined_confirmed'
            rows[idx].confirmedAt = nowIso()
            rows[idx].confirmedBy = getRequestUserLabel(req)

            writeCollection(COLLECTION, rows)
            res.json(rows[idx])
        } catch (error: any) {
            console.error('[gene/agent-whatsapp-onboarding] mark-joined failed:', error)
            res.status(500).json({ message: 'Failed to mark WhatsApp link as joined' })
        }
    })
}
