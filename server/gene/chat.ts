/**
 * GENE Platform — Team 1: conversational agent endpoint.
 *
 * Public-facing chat surface for GENE, the East-Africa real-estate
 * assistant - also the backend now shared by the site's public floating
 * "RealEVR Assistant" widget (client/src/components/AIAssistant.tsx used
 * to call a separate, Gemini-only /api/ai/chat with no memory, no intent
 * classification, and no property context; it now calls this endpoint
 * instead, so there's one public assistant, not two disagreeing ones).
 *
 * Persists conversation turns via the shared JSON-file store (`./store`)
 * under the `gene_conversations` collection, does light rule-based intent
 * classification, and calls out to ./ai-provider's getAiReply (Anthropic
 * Claude, then OpenAI ChatGPT, then Google Gemini - first configured
 * provider that succeeds wins) for the actual reply, falling back to a
 * clear, still-useful canned response per intent whenever none of the
 * three are configured or all fail. This module never 500s just because
 * no AI provider is configured.
 *
 * Escalations (human handoff / low-confidence replies) are written to the
 * `gene_escalations` collection — see `GeneEscalation` below. Team 2's
 * WhatsApp/escalation module reads that same collection, so its shape is
 * intentionally small and stable; add new fields as optional only.
 */
import type { Express, RequestHandler } from 'express'
import { randomUUID } from 'crypto'
import { readCollection, writeCollection, nextId, nowIso } from './store'
import { storage } from '../storage'
import { notifyNewEscalation } from './slack-bridge'
import { getAiReply } from './ai-provider'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GeneIntent =
    | 'price_inquiry'
    | 'availability_inquiry'
    | 'schedule_viewing'
    | 'general_question'
    | 'human_handoff_request'

export interface GeneChatMessage {
    role: 'user' | 'assistant'
    text: string
    intent?: GeneIntent
    createdAt: string
}

export interface GeneConversation {
    id: string // === sessionId
    sessionId: string
    messages: GeneChatMessage[]
    // Set the first time this conversation's visitor shares an email or
    // phone number in a message (see detectContactDetails below) — a
    // simple, real lead-capture signal with no separate "share your
    // details" form to build. Only ever set once per conversation, so a
    // visitor who mentions their number twice doesn't re-notify admins.
    capturedLead?: { contact: string; capturedAt: string }
    createdAt: string
    updatedAt: string
}

/**
 * `gene_escalations` collection shape — a SHARED CONTRACT with Team 2's
 * WhatsApp/human-handoff module, which reads this same collection to surface
 * open escalations to a human agent. Keep this shape stable; only add
 * optional fields to it.
 */
export interface GeneEscalation {
    id: number
    sessionId: string
    message: string
    reason: string
    createdAt: string
    status: 'open' | 'in_progress' | 'resolved'
}

const CONVERSATIONS_COLLECTION = 'gene_conversations'
const ESCALATIONS_COLLECTION = 'gene_escalations'

// ---------------------------------------------------------------------------
// Intent classification — small rule-based classifier, no ML dependency.
// ---------------------------------------------------------------------------

function classifyIntent(message: string): GeneIntent {
    const text = message.toLowerCase()

    if (
        /\b(human|real person|representative|agent|someone)\b.*\b(talk|speak|chat|help)\b/.test(text) ||
        /\b(talk|speak|chat)\b.*\b(to|with)\b.*\b(human|person|agent|representative|someone)\b/.test(text) ||
        /\b(connect me|escalate|not helpful|this (bot|ai) (is )?(useless|not helping))\b/.test(text)
    ) {
        return 'human_handoff_request'
    }

    if (/\b(view(ing)?|visit|tour|see the (place|property|house|apartment)|book (a|an)|schedule)\b/.test(text)) {
        return 'schedule_viewing'
    }

    if (/\b(price|cost|how much|rent|rate|budget|afford|expensive|cheap)\b/.test(text)) {
        return 'price_inquiry'
    }

    if (/\b(available|availability|still (there|available|open)|vacant|is it (taken|gone|rented|sold))\b/.test(text)) {
        return 'availability_inquiry'
    }

    return 'general_question'
}

const CANNED_REPLIES: Record<GeneIntent, string> = {
    price_inquiry:
        "I can help with pricing. Could you tell me which property or area you're interested in, and I'll pull up the current price? You can also browse listings with prices directly on the site.",
    availability_inquiry:
        "Let me check that for you — please share the property name or listing link and I'll confirm whether it's still available.",
    schedule_viewing:
        "I'd be happy to help you book a viewing. Please share the property you're interested in along with a couple of days/times that work for you, and our team will confirm.",
    general_question:
        "Thanks for reaching out to GENE. I can help with property prices, availability, and booking viewings across East Africa. Could you tell me a bit more about what you're looking for?",
    human_handoff_request:
        "I've flagged your request for a member of our team to reach out to you directly. In the meantime, is there anything else I can help you with?",
}

function isLowConfidence(intent: GeneIntent, usedAi: boolean, reply: string): boolean {
    if (intent === 'human_handoff_request') return true
    if (!usedAi && intent === 'general_question') return true
    const hedgeMarkers = ["i'm not sure", "i don't know", "i don't have", 'cannot help', "can't help", 'no information']
    const lowered = reply.toLowerCase()
    if (reply.trim().length < 8) return true
    return hedgeMarkers.some((marker) => lowered.includes(marker))
}

// ---------------------------------------------------------------------------
// AI reply (optional — via ./ai-provider, whichever of ANTHROPIC_API_KEY /
// OPENAI_API_KEY / GEMINI_API_KEY is configured)
// ---------------------------------------------------------------------------

async function buildPropertyContext(): Promise<string> {
    try {
        const properties = await storage.getAllProperties()
        const sample = properties.slice(0, 3)
        if (sample.length === 0) return ''
        const lines = sample.map((p) => `- ${p.title} — ${p.currency ?? 'UGX'} ${p.price} — ${p.location}`)
        return `A few example current listings:\n${lines.join('\n')}`
    } catch {
        // Property context is a nice-to-have, never block the chat reply on it.
        return ''
    }
}

async function getReply(history: GeneChatMessage[], message: string): Promise<string | null> {
    const propertyContext = await buildPropertyContext()
    const systemPrompt = [
        'You are GENE, a helpful, concise real-estate assistant for a property platform operating across East Africa',
        '(Uganda, Kenya, Tanzania, Rwanda). You help prospective tenants/buyers with pricing, availability, and',
        'booking viewings. Be friendly, brief (2-4 sentences), and honest — if you do not know a specific fact',
        '(exact price, exact availability), say so and offer to connect them with a human agent rather than guessing.',
        propertyContext,
    ]
        .filter(Boolean)
        .join('\n')

    const result = await getAiReply(
        systemPrompt,
        message,
        history.slice(-8).map((m) => ({ role: m.role, text: m.text }))
    )
    return result?.reply ?? null
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function loadConversation(sessionId: string): GeneConversation {
    const rows = readCollection<GeneConversation>(CONVERSATIONS_COLLECTION)
    const existing = rows.find((c) => c.sessionId === sessionId)
    if (existing) return existing
    const now = nowIso()
    return { id: sessionId, sessionId, messages: [], createdAt: now, updatedAt: now }
}

function saveConversation(conversation: GeneConversation): void {
    const rows = readCollection<GeneConversation>(CONVERSATIONS_COLLECTION)
    const idx = rows.findIndex((c) => c.sessionId === conversation.sessionId)
    conversation.updatedAt = nowIso()
    if (idx >= 0) {
        rows[idx] = conversation
    } else {
        rows.push(conversation)
    }
    writeCollection(CONVERSATIONS_COLLECTION, rows)
}

function writeEscalation(sessionId: string, message: string, reason: string): void {
    const rows = readCollection<GeneEscalation>(ESCALATIONS_COLLECTION)
    const escalation: GeneEscalation = {
        id: nextId(rows),
        sessionId,
        message,
        reason,
        createdAt: nowIso(),
        status: 'open',
    }
    rows.push(escalation)
    writeCollection(ESCALATIONS_COLLECTION, rows)
    // Best-effort — never let a Slack notification failure affect the chat response.
    notifyNewEscalation(escalation).catch((err) => console.error('[gene/chat] Slack notify failed:', err))
}

// ---------------------------------------------------------------------------
// Lead capture — a visitor sharing an email or phone number in the chat is
// treated as a lead: admins get notified (in-app + email) and the very next
// reply warmly acknowledges it. See GeneConversation.capturedLead above.
// ---------------------------------------------------------------------------

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
// East Africa numbers come in several country codes (+256/254/255/250 etc.)
// and formats, so this is deliberately a loose heuristic (7+ digits, with
// optional +, spaces, or dashes) rather than a single-country parser like
// server/gene/rentrail.ts's normalizeUgandaPhone. A false positive just
// means an extra admin notification for something that turns out not to be
// a real number; a false negative means a real lead is silently missed —
// so this errs toward catching more, not fewer.
const PHONE_PATTERN = /\+?\d[\d\s-]{6,}\d/

function detectContactDetails(message: string): string | null {
    const email = message.match(EMAIL_PATTERN)?.[0]
    if (email) return email
    const phone = message.match(PHONE_PATTERN)?.[0]
    if (phone) return phone.trim()
    return null
}

/**
 * Notifies every admin the instant a chat visitor shares contact details —
 * both channels the user asked for: an in-app notification (bell icon,
 * server/models/Notification.ts) and an email via sendEmailToAdmins
 * (server/email-service.ts, which is already configured to send through
 * Gmail). Both best-effort and independent of each other — one failing
 * (e.g. email not configured) never blocks the other or the chat reply.
 */
async function notifyAdminsOfNewLead(sessionId: string, message: string, contact: string): Promise<void> {
    try {
        const { storage } = await import('../storage')
        const admins = (await storage.getAllUsers()).filter((u) => u.role === 'admin')
        const { createNotification } = await import('../models/Notification')
        await Promise.all(
            admins.map((admin) =>
                createNotification({
                    userId: String(admin.id),
                    title: 'New lead from AI chat',
                    message: `A visitor shared their contact details (${contact}) while chatting with the site assistant.`,
                    type: 'system',
                    link: `/admin`,
                    data: { sessionId, contact, chatMessage: message },
                }).catch((err) => console.error('[gene/chat] failed to notify an admin in-app:', err))
            )
        )
    } catch (err) {
        console.error('[gene/chat] failed to create in-app lead notifications:', err)
    }

    try {
        const { sendEmailToAdmins } = await import('../email-service')
        await sendEmailToAdmins(
            'New lead from the AI chat assistant',
            `<p>A visitor just shared their contact details while chatting with the site's AI assistant.</p>
             <ul>
               <li><strong>Contact:</strong> ${contact}</li>
               <li><strong>Their message:</strong> ${message}</li>
               <li><strong>Session:</strong> ${sessionId}</li>
             </ul>`,
            `New chat lead — contact: ${contact} — message: "${message}" — session: ${sessionId}`
        )
    } catch (err) {
        console.error('[gene/chat] failed to email admins about a new lead:', err)
    }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function registerGeneChatRoutes(app: Express, _adminMiddleware: RequestHandler): void {
    // POST /api/gene/chat — public. { sessionId?, message } -> { sessionId, reply, intent, escalated }
    app.post('/api/gene/chat', async (req, res) => {
        try {
            const body = req.body ?? {}
            const message = typeof body.message === 'string' ? body.message.trim() : ''
            if (!message) {
                return res.status(400).json({ message: 'Field "message" is required and must be a non-empty string.' })
            }

            const sessionId =
                typeof body.sessionId === 'string' && body.sessionId.trim().length > 0 ? body.sessionId.trim() : randomUUID()

            const conversation = loadConversation(sessionId)

            const intent = classifyIntent(message)
            conversation.messages.push({ role: 'user', text: message, intent, createdAt: nowIso() })

            // Lead capture — only the first time per conversation, so
            // mentioning a number twice doesn't double-notify admins.
            let justCapturedLead = false
            if (!conversation.capturedLead) {
                const contact = detectContactDetails(message)
                if (contact) {
                    conversation.capturedLead = { contact, capturedAt: nowIso() }
                    justCapturedLead = true
                    // Fire-and-forget, same posture as writeEscalation's Slack
                    // notify above — never let this slow down or fail the reply.
                    notifyAdminsOfNewLead(sessionId, message, contact).catch((err) =>
                        console.error('[gene/chat] lead notification failed:', err)
                    )
                }
            }

            const aiReply = await getReply(conversation.messages.slice(0, -1), message)
            const usedAi = aiReply !== null
            let reply = aiReply ?? CANNED_REPLIES[intent]
            // Deterministic, not dependent on the AI provider cooperating —
            // guarantees every visitor who shares their details gets
            // acknowledged, matching this module's "never depend solely on
            // AI" posture elsewhere (see CANNED_REPLIES).
            if (justCapturedLead) {
                reply = `Thanks for sharing your contact details — a member of our team may follow up if you need anything specific. ${reply}`
            }

            const escalated = isLowConfidence(intent, usedAi, reply)
            if (escalated) {
                const reason = intent === 'human_handoff_request' ? 'human_handoff_request' : 'low_confidence_reply'
                writeEscalation(sessionId, message, reason)
            }

            conversation.messages.push({ role: 'assistant', text: reply, intent, createdAt: nowIso() })
            saveConversation(conversation)

            res.json({ sessionId, reply, intent, escalated, leadCaptured: justCapturedLead })
        } catch (err) {
            console.error('[gene/chat] POST /api/gene/chat failed:', err)
            res.status(500).json({ message: 'Failed to process chat message.' })
        }
    })

    // GET /api/gene/chat/:sessionId — public. Returns that session's message history.
    app.get('/api/gene/chat/:sessionId', async (req, res) => {
        try {
            const { sessionId } = req.params
            const rows = readCollection<GeneConversation>(CONVERSATIONS_COLLECTION)
            const conversation = rows.find((c) => c.sessionId === sessionId)
            if (!conversation) {
                return res.status(404).json({ message: 'No conversation found for that sessionId.' })
            }
            res.json(conversation)
        } catch (err) {
            console.error('[gene/chat] GET /api/gene/chat/:sessionId failed:', err)
            res.status(500).json({ message: 'Failed to load conversation.' })
        }
    })
}
