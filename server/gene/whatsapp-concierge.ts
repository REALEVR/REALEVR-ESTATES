/**
 * GENE Platform — WhatsApp concierge: lets anyone message the platform's
 * WhatsApp Business number and get real property recommendations/answers
 * back, and lets a linked landlord toggle a property's availability by
 * texting a simple command.
 *
 * This is distinct from server/gene/whatsapp.ts (which is outbound-only:
 * human-agent escalation notifications) and
 * server/gene/agent-whatsapp-onboarding.ts (which is about joining an
 * internal agent group). This module is the first that handles INBOUND
 * WhatsApp messages from end users/landlords via the Cloud API webhook.
 *
 * Gated behind the same WHATSAPP_BUSINESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID
 * env vars as whatsapp.ts (reuses its `sendWhatsAppMessage`), plus a new
 * WHATSAPP_VERIFY_TOKEN for the webhook handshake Meta requires. Absent
 * those, the webhook still accepts and logs messages (so nothing 500s) but
 * cannot send a reply — logged instead, same graceful-degrade policy as
 * the rest of GENE.
 *
 * KNOWN LIMITATIONS (documented honestly, not hidden):
 *  - Linking a WhatsApp number to an account (`POST /api/gene/whatsapp/link`)
 *    is NOT OTP-verified in this v1 — it trusts the authenticated web
 *    session. Good enough for personalizing replies; not good enough to
 *    treat as proof of phone ownership for anything higher-stakes.
 *  - No webhook idempotency/dedup — a WhatsApp retry could in theory log a
 *    duplicate inbound message. Low-impact (chat history, not money) but
 *    worth hardening before high volume.
 *  - "Interested tenant" detection from chat is a simple keyword heuristic
 *    (see INTEREST_KEYWORDS below), not NLU.
 *
 * Persistence: shared JSON-file collection store (see ./store.ts).
 */
import type { Express, Request, Response } from 'express'
import { readCollection, writeCollection, nextId, nowIso } from './store'
import { storage } from '../storage'
import { sendWhatsAppMessage } from './whatsapp'
import {
    loadProfile,
    loadSignals,
    buildRecommendations,
    templatedRecommendationSummary,
    callAnthropic,
    profileSummaryForPrompt,
    appendAgentMessage,
} from './personal-agent'

const LINK_COLLECTION = 'gene_whatsapp_user_links'
const MESSAGE_COLLECTION = 'gene_whatsapp_messages'
const SIGNAL_COLLECTION = 'gene_agent_signals' // shared contract with personal-agent.ts — read-only here

export interface WhatsappUserLink {
    id: number
    userId: number
    userName: string
    phone: string
    linkedAt: string
}

export interface WhatsappMessageLog {
    id: number
    phone: string
    direction: 'inbound' | 'outbound'
    text: string
    userId?: number
    matchedPropertyId?: number
    createdAt: string
}

const PHONE_SANITY_RE = /^\+?[0-9]{6,20}$/
const INTEREST_KEYWORDS = ['interested', 'i want', 'i like', 'book', 'viewing', 'visit']
const TOGGLE_COMMAND_RE = /^(available|unavailable|toggle)\s+(\d+)\s*$/i

/**
 * Digits only, no leading '+' — this is the format WhatsApp's Cloud API
 * always sends inbound `from` numbers in, so every stored/looked-up phone
 * must be normalized to the same shape or linking silently never matches.
 */
function normalizePhone(raw: string): string {
    return raw.replace(/\D/g, '')
}

function findLinkByPhone(phone: string): WhatsappUserLink | undefined {
    const rows = readCollection<WhatsappUserLink>(LINK_COLLECTION)
    return rows.find((r) => r.phone === phone)
}

function logMessage(entry: Omit<WhatsappMessageLog, 'id' | 'createdAt'>): void {
    const rows = readCollection<WhatsappMessageLog>(MESSAGE_COLLECTION)
    rows.push({ ...entry, id: nextId(rows), createdAt: nowIso() })
    writeCollection(MESSAGE_COLLECTION, rows)
}

/** Read-only reuse of personal-agent.ts's signal collection — log a fresh
 * "inquired" signal so the property's landlord sees this tenant in their
 * interested-tenants inbox (see landlord-hub.ts). */
function logInquirySignal(userId: number, propertyId: number): void {
    const rows = readCollection<{ id: number; userId: number; propertyId: number; action: string; createdAt: string }>(SIGNAL_COLLECTION)
    rows.push({ id: nextId(rows), userId, propertyId, action: 'inquired', createdAt: nowIso() })
    writeCollection(SIGNAL_COLLECTION, rows)
}

async function replyAndLog(phone: string, text: string, userId?: number, matchedPropertyId?: number): Promise<void> {
    logMessage({ phone, direction: 'outbound', text, userId, matchedPropertyId })
    await sendWhatsAppMessage(phone, text)
}

/** Handles a landlord's "available <id>" / "unavailable <id>" / "toggle <id>"
 * command. Returns true if the message was a toggle command (handled either
 * way — success or a clear rejection reply — so the caller should not also
 * run it through the concierge chat path). */
async function tryHandleAvailabilityToggle(phone: string, text: string, link: WhatsappUserLink | undefined): Promise<boolean> {
    const match = text.trim().match(TOGGLE_COMMAND_RE)
    if (!match) return false

    if (!link) {
        await replyAndLog(phone, "I recognize that as a listing command, but this number isn't linked to a RealEVR account yet — link your WhatsApp number from your dashboard first.")
        return true
    }

    const propertyId = Number(match[2])
    const property = await storage.getProperty(propertyId)
    if (!property) {
        await replyAndLog(phone, `I couldn't find property #${propertyId}.`, link.userId)
        return true
    }
    if (property.ownerId !== link.userId) {
        await replyAndLog(phone, `Property #${propertyId} ("${property.title}") isn't listed under your account, so I can't toggle it.`, link.userId, propertyId)
        return true
    }

    const wantAvailable = match[1].toLowerCase() === 'available' ? true : match[1].toLowerCase() === 'unavailable' ? false : !property.isAvailable
    if (property.isAvailable === wantAvailable) {
        await replyAndLog(phone, `"${property.title}" is already marked ${wantAvailable ? 'available' : 'unavailable'}.`, link.userId, propertyId)
        return true
    }

    const updated = await storage.togglePropertyAvailability(propertyId)
    await replyAndLog(
        phone,
        `Done — "${property.title}" is now marked ${updated?.isAvailable ? 'available' : 'unavailable'}.`,
        link.userId,
        propertyId
    )
    return true
}

/** The general concierge chat path — reuses the personal agent's real
 * scoring/recommendation logic when the phone is linked to a profile;
 * otherwise a lighter, generic reply from real listing data. */
async function handleConciergeChat(phone: string, text: string, link: WhatsappUserLink | undefined): Promise<void> {
    const allProperties = await storage.getAllProperties()
    const mentionsInterest = INTEREST_KEYWORDS.some((k) => text.toLowerCase().includes(k))

    if (link) {
        const profile = loadProfile(link.userId)
        if (profile) {
            const signals = loadSignals(link.userId)
            const top = buildRecommendations(profile, signals, allProperties, 3)

            if (mentionsInterest && top[0]) {
                logInquirySignal(link.userId, top[0].property.id)
            }

            const systemPrompt = [
                'You are "My RealEVR Agent" replying over WhatsApp to this specific user — keep it SHORT (2-4 sentences,',
                'WhatsApp-appropriate, no markdown), warm, and only reference the facts given below.',
                '',
                'Their profile:',
                profileSummaryForPrompt(profile),
                '',
                'Their current top matches:',
                ...top.map((t) => `- "${t.property.title}" in ${t.property.location} — ${t.property.currency ?? 'UGX'} ${t.property.price}`),
            ].join('\n')

            const aiReply = await callAnthropic(systemPrompt, text)
            const reply = aiReply ?? `${templatedRecommendationSummary(profile, top)} Reply with a property name for more detail, or "more" for other picks.`

            // Mirror this WhatsApp exchange into the same conversation history
            // the web Chat tab reads, so it's one continuous thread either way.
            appendAgentMessage(link.userId, 'user', text)
            appendAgentMessage(link.userId, 'assistant', reply)

            await replyAndLog(phone, reply, link.userId, top[0]?.property.id)
            return
        }
    }

    // Not linked, or linked but hasn't set up a profile yet — generic,
    // real-data concierge reply (same spirit as chat.ts's rule-based path).
    const featured = allProperties.filter((p) => p.isAvailable && (p.isFeatured || p.hasTour)).slice(0, 3)
    const list = featured.length
        ? featured.map((p) => `• "${p.title}" in ${p.location} — ${p.currency ?? 'UGX'} ${p.price}`).join('\n')
        : "I don't have live listings to show right now — check realevrestates.com."
    const reply = `Hi! I'm the RealEVR Estates concierge. A few properties you might like:\n${list}\n\nSign in on the website and link this WhatsApp number from your profile for picks tailored to your budget and interests.`
    await replyAndLog(phone, reply)
}

async function handleInboundText(phone: string, text: string): Promise<void> {
    const link = findLinkByPhone(phone)
    logMessage({ phone, direction: 'inbound', text, userId: link?.userId })

    const handledAsToggle = await tryHandleAvailabilityToggle(phone, text, link)
    if (handledAsToggle) return

    await handleConciergeChat(phone, text, link)
}

export function registerWhatsappConciergeRoutes(app: Express): void {
    // GET /api/gene/whatsapp/webhook — Meta's verification handshake.
    app.get('/api/gene/whatsapp/webhook', (req: Request, res: Response) => {
        const mode = req.query['hub.mode']
        const token = req.query['hub.verify_token']
        const challenge = req.query['hub.challenge']
        const expected = process.env.WHATSAPP_VERIFY_TOKEN

        if (mode === 'subscribe' && expected && token === expected) {
            res.status(200).send(String(challenge ?? ''))
        } else {
            res.sendStatus(403)
        }
    })

    // POST /api/gene/whatsapp/webhook — inbound message delivery.
    app.post('/api/gene/whatsapp/webhook', async (req: Request, res: Response) => {
        // Always 200 quickly — WhatsApp retries aggressively on non-2xx.
        res.sendStatus(200)
        try {
            const entry = req.body?.entry?.[0]
            const value = entry?.changes?.[0]?.value
            const messages = value?.messages
            if (!Array.isArray(messages) || messages.length === 0) return

            for (const msg of messages) {
                const phone = normalizePhone(msg?.from ?? '')
                const text = msg?.text?.body
                if (!phone || typeof text !== 'string' || !text.trim()) continue
                await handleInboundText(phone, text.trim())
            }
        } catch (err) {
            console.error('[gene/whatsapp-concierge] webhook processing failed:', err)
        }
    })

    // POST /api/gene/whatsapp/link — [AUTH] link the caller's WhatsApp number.
    // NOT OTP-verified in this v1 — see file-top "known limitations".
    app.post('/api/gene/whatsapp/link', (req: Request, res: Response) => {
        if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
            return res.status(401).json({ message: 'Sign in first.' })
        }
        try {
            const { phone } = req.body ?? {}
            if (typeof phone !== 'string' || !PHONE_SANITY_RE.test(phone.trim())) {
                return res.status(400).json({ message: 'A valid phone number (digits, optional leading +) is required.' })
            }
            // Store normalized (digits only, no '+') so it matches WhatsApp's
            // inbound `from` format — see normalizePhone()'s docstring.
            const normalized = normalizePhone(phone.trim())
            const user = req.user as any

            const rows = readCollection<WhatsappUserLink>(LINK_COLLECTION)
            const idx = rows.findIndex((r) => r.userId === user.id)
            const record: WhatsappUserLink = {
                id: idx === -1 ? nextId(rows) : rows[idx].id,
                userId: user.id,
                userName: user.username ?? user.email ?? `user:${user.id}`,
                phone: normalized,
                linkedAt: nowIso(),
            }
            if (idx === -1) rows.push(record)
            else rows[idx] = record
            writeCollection(LINK_COLLECTION, rows)

            res.json({ linked: true, phone: normalized })
        } catch (err) {
            console.error('[gene/whatsapp-concierge] link failed:', err)
            res.status(500).json({ message: 'Failed to link WhatsApp number.' })
        }
    })

    // GET /api/gene/whatsapp/link/me — [AUTH]
    app.get('/api/gene/whatsapp/link/me', (req: Request, res: Response) => {
        if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
            return res.status(401).json({ message: 'Sign in first.' })
        }
        const user = req.user as any
        const rows = readCollection<WhatsappUserLink>(LINK_COLLECTION)
        const record = rows.find((r) => r.userId === user.id)
        res.json({ linked: !!record, phone: record?.phone ?? null })
    })
}
