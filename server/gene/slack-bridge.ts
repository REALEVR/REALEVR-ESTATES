/**
 * GENE Platform — Slack bridge for the human-handoff escalation queue.
 *
 * Companion to server/gene/whatsapp.ts: that module owns the
 * `gene_escalations` collection and the agent-facing HTTP inbox; this module
 * lets a human agent work the same queue from Slack instead — a slash
 * command to list open escalations and to resolve one — plus a webhook
 * notifier so a new escalation posts into Slack the moment it's created.
 *
 * Two Slack integration primitives are used, deliberately kept separate
 * because they have different trust models:
 *   - Incoming Webhook (SLACK_WEBHOOK_URL): outbound only, no auth needed,
 *     just POST a JSON payload.
 *   - Slash Command (SLACK_SIGNING_SECRET): inbound, must be verified via
 *     Slack's HMAC request-signing scheme or anyone could hit our endpoint
 *     and mutate escalations.
 *
 * Persistence: shared JSON-file collection store (see ./store.ts), same
 * `gene_escalations` collection and field semantics as whatsapp.ts's
 * `/resolve` route — kept in sync deliberately so the two entry points never
 * diverge on what "resolved" means.
 */
import crypto from 'crypto'
import type { Express, Request, Response, RequestHandler } from 'express'
import express from 'express'
import fetch from 'node-fetch'
import { readCollection, writeCollection, nowIso } from './store'
import { sendWhatsAppMessage } from './whatsapp'
import type { EscalationRecord } from './whatsapp'

const COLLECTION = 'gene_escalations'

/**
 * Best-effort Slack Incoming Webhook sender. Never throws — callers should
 * treat this as fire-and-forget with a status they can log/report on. Same
 * honest pattern as sendWhatsAppMessage in ./whatsapp.ts.
 */
export async function notifySlack(
    text: string,
    extra?: { blocks?: any[] }
): Promise<{ sent: boolean; reason?: string }> {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL

    if (!webhookUrl) {
        console.log(`[gene/slack-bridge] Slack not configured — would have sent: ${text}`)
        return {
            sent: false,
            reason: 'SLACK_WEBHOOK_URL not configured — see docs/GENE_PLATFORM.md',
        }
    }

    try {
        const payload: Record<string, unknown> = { text }
        if (extra?.blocks) {
            payload.blocks = extra.blocks
        }

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })

        if (!response.ok) {
            const errText = await response.text().catch(() => '')
            console.error(`[gene/slack-bridge] send failed (${response.status}): ${errText}`)
            return { sent: false, reason: `Slack webhook returned ${response.status}` }
        }

        return { sent: true }
    } catch (error: any) {
        console.error('[gene/slack-bridge] send threw:', error)
        return { sent: false, reason: error?.message ?? 'Unknown error sending Slack message' }
    }
}

/**
 * Fire-and-forget notification for a freshly created escalation. Swallows
 * all errors — a Slack outage must never break the chat/escalation flow
 * that calls this.
 */
export async function notifyNewEscalation(escalation: {
    id: number
    sessionId: string
    message: string
    reason: string
}): Promise<void> {
    try {
        const text =
            `🆘 New escalation #${escalation.id}: "${escalation.message}" ` +
            `(reason: ${escalation.reason}, session ${escalation.sessionId}). ` +
            `Reply in Slack with the configured slash command: resolve ${escalation.id} <note>`
        await notifySlack(text)
    } catch (error) {
        console.error('[gene/slack-bridge] notifyNewEscalation failed:', error)
    }
}

/**
 * Slack request-signing verification (v0 scheme):
 * https://api.slack.com/authentication/verifying-requests-from-slack
 *
 * Fails closed: any missing config/header, malformed signature, or stale
 * timestamp is treated as unverified.
 */
export function verifySlackSignature(req: {
    headers: Record<string, string | string[] | undefined>
    rawBody: string
}): boolean {
    try {
        const signingSecret = process.env.SLACK_SIGNING_SECRET
        if (!signingSecret) {
            return false
        }

        const timestampHeader = req.headers['x-slack-request-timestamp']
        const signatureHeader = req.headers['x-slack-signature']

        const timestamp = Array.isArray(timestampHeader) ? timestampHeader[0] : timestampHeader
        const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader

        if (!timestamp || !signature) {
            return false
        }

        // Replay protection — reject requests older than 5 minutes.
        const timestampNum = Number(timestamp)
        if (!Number.isFinite(timestampNum)) {
            return false
        }
        const nowSeconds = Math.floor(Date.now() / 1000)
        if (Math.abs(nowSeconds - timestampNum) > 60 * 5) {
            return false
        }

        const base = `v0:${timestamp}:${req.rawBody}`
        const computedHex = crypto.createHmac('sha256', signingSecret).update(base, 'utf8').digest('hex')
        const computedSignature = `v0=${computedHex}`

        const expected = Buffer.from(computedSignature, 'utf8')
        const actual = Buffer.from(signature, 'utf8')

        if (expected.length !== actual.length) {
            return false
        }

        return crypto.timingSafeEqual(expected, actual)
    } catch (error) {
        console.error('[gene/slack-bridge] signature verification threw:', error)
        return false
    }
}

interface SlackSlashCommandBody {
    command?: string
    text?: string
    user_name?: string
    [key: string]: unknown
}

function slackReply(res: Response, text: string): void {
    res.json({ response_type: 'ephemeral', text })
}

async function handleResolveCommand(rest: string): Promise<string> {
    // rest looks like: "3 Called back, issue fixed"
    const trimmed = rest.trim()
    const spaceIdx = trimmed.indexOf(' ')
    const idToken = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)
    const resolutionNote = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim()

    const escalationId = Number(idToken)
    if (!idToken || !Number.isFinite(escalationId)) {
        return 'Usage: resolve <escalationId> <note> — e.g. `resolve 3 Called back, issue fixed`'
    }

    try {
        const rows = readCollection<EscalationRecord>(COLLECTION)
        const idx = rows.findIndex((r) => r.id === escalationId)
        if (idx === -1) {
            return `Escalation #${escalationId} not found.`
        }

        // Mirror whatsapp.ts's POST /api/gene/whatsapp/inbox/:id/resolve exactly.
        rows[idx].status = 'resolved'
        rows[idx].resolvedAt = nowIso()
        if (resolutionNote) {
            rows[idx].resolutionNote = resolutionNote
        }

        writeCollection(COLLECTION, rows)
        const resolved = rows[idx]

        let notification: { sent: boolean; reason?: string } | undefined
        if (resolved.customerPhone) {
            notification = await sendWhatsAppMessage(
                resolved.customerPhone,
                'Hi! Your inquiry has been resolved by our team. Reply here if you have any more questions.'
            )
        }

        const notificationNote = notification
            ? notification.sent
                ? ' Customer notified via WhatsApp.'
                : ` Customer WhatsApp notification not sent (${notification.reason}).`
            : ''

        return `Resolved escalation #${escalationId}.${notificationNote}`
    } catch (error: any) {
        console.error('[gene/slack-bridge] resolve command failed:', error)
        return `Failed to resolve escalation #${escalationId}: ${error?.message ?? 'unknown error'}`
    }
}

function handleInboxCommand(): string {
    try {
        const rows = readCollection<EscalationRecord>(COLLECTION)
        const open = rows
            .filter((r) => r.status === 'open')
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

        if (open.length === 0) {
            return 'No open escalations. 🎉'
        }

        const lines = open.map((r) => `#${r.id} — "${r.message}" (reason: ${r.reason}, session ${r.sessionId})`)
        return `Open escalations (${open.length}):\n${lines.join('\n')}`
    } catch (error: any) {
        console.error('[gene/slack-bridge] inbox command failed:', error)
        return `Failed to load inbox: ${error?.message ?? 'unknown error'}`
    }
}

const USAGE_HINT =
    'Usage:\n' +
    '`/gene inbox` — list open escalations\n' +
    '`/gene resolve <escalationId> <note>` — resolve an escalation, e.g. `resolve 3 Called back, issue fixed`'

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for signature parity with the
// other registerXRoutes(app, adminMiddleware) functions even though this route is intentionally
// public (protected by verifySlackSignature instead, since Slack can't send our session auth).
export function registerSlackBridgeRoutes(app: Express, adminMiddleware: RequestHandler): void {
    // Public route — Slack calls this directly (protected by signature
    // verification below, not adminMiddleware, since Slack can't present our
    // session auth). `verify` captures the raw body before urlencoded
    // parsing mutates/consumes it, which the HMAC check needs.
    app.post(
        '/api/gene/slack/commands',
        express.urlencoded({
            extended: true,
            verify: (req: any, _res, buf) => {
                req.rawBody = buf.toString('utf8')
            },
        }),
        async (req: Request, res: Response) => {
            try {
                const rawBody = (req as any).rawBody ?? ''
                const verified = verifySlackSignature({ headers: req.headers as Record<string, string | string[] | undefined>, rawBody })
                if (!verified) {
                    res.status(401).send('Unauthorized')
                    return
                }

                const body = req.body as SlackSlashCommandBody
                const text = typeof body.text === 'string' ? body.text.trim() : ''

                if (text.startsWith('resolve ') || text === 'resolve') {
                    const rest = text.slice('resolve'.length).trim()
                    const reply = await handleResolveCommand(rest)
                    slackReply(res, reply)
                    return
                }

                if (text.startsWith('inbox') || text === '') {
                    slackReply(res, handleInboxCommand())
                    return
                }

                slackReply(res, USAGE_HINT)
            } catch (error: any) {
                console.error('[gene/slack-bridge] slash command handler failed:', error)
                res.status(500).json({ response_type: 'ephemeral', text: 'Something went wrong handling that command.' })
            }
        }
    )
}
