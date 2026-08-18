/**
 * GENE Platform — Team 1: conversational agent endpoint.
 *
 * Public-facing chat surface for GENE, the East-Africa real-estate
 * assistant. Persists conversation turns via the shared JSON-file store
 * (`./store`) under the `gene_conversations` collection, does light
 * rule-based intent classification, and (when `ANTHROPIC_API_KEY` is set)
 * calls the Anthropic Messages API for the actual reply — falling back to a
 * clear, still-useful canned response per intent whenever the key is absent
 * or the call fails for any reason. This module never 500s just because an
 * AI provider isn't configured.
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
// Anthropic call (optional — only when ANTHROPIC_API_KEY is set)
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

async function callAnthropic(history: GeneChatMessage[], message: string): Promise<string | null> {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return null

    try {
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

        const messages = [
            ...history.slice(-8).map((m) => ({ role: m.role, content: m.text })),
            { role: 'user' as const, content: message },
        ]

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-3-5-haiku-latest',
                max_tokens: 400,
                system: systemPrompt,
                messages,
            }),
        })

        if (!response.ok) {
            console.error('[gene/chat] Anthropic API error', response.status, await response.text())
            return null
        }

        const data: any = await response.json()
        const textBlocks: string[] = Array.isArray(data?.content)
            ? data.content.filter((block: any) => block?.type === 'text').map((block: any) => block.text)
            : []
        const reply = textBlocks.join('\n').trim()
        return reply.length > 0 ? reply : null
    } catch (err) {
        console.error('[gene/chat] Anthropic call failed, falling back to rule-based reply:', err)
        return null
    }
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

            const aiReply = await callAnthropic(conversation.messages.slice(0, -1), message)
            const usedAi = aiReply !== null
            const reply = aiReply ?? CANNED_REPLIES[intent]

            const escalated = isLowConfidence(intent, usedAi, reply)
            if (escalated) {
                const reason = intent === 'human_handoff_request' ? 'human_handoff_request' : 'low_confidence_reply'
                writeEscalation(sessionId, message, reason)
            }

            conversation.messages.push({ role: 'assistant', text: reply, intent, createdAt: nowIso() })
            saveConversation(conversation)

            res.json({ sessionId, reply, intent, escalated })
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
