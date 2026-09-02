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
 * Also handles a linked landlord texting "dashboard" (or "login") to get a
 * fresh passwordless magic-login link back — see ./magic-login.ts. This is
 * how a self-serve agent (server/gene/self-serve-listing.ts), who never set
 * a password, gets back into their Agent Dashboard from WhatsApp alone.
 *
 * Also handles "stop"/"start" (and "unsubscribe"/"subscribe") to toggle
 * marketing-broadcast opt-in on a linked number — see `marketingOptIn` on
 * WhatsappUserLink and server/gene/whatsapp-growth.ts's broadcast route.
 *
 * Two inbound transports, matching whatsapp.ts's two outbound providers:
 * `/api/gene/whatsapp/webhook` (Meta Cloud API, gated behind
 * WHATSAPP_BUSINESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID + WHATSAPP_VERIFY_TOKEN
 * for its GET handshake) and `/api/gene/whatsapp/webhook/infobip` (Infobip,
 * gated behind INFOBIP_API_KEY + INFOBIP_BASE_URL + INFOBIP_WHATSAPP_SENDER).
 * Point whichever provider you configured for sending at its matching
 * webhook URL. Absent both, the webhooks still accept and log messages (so
 * nothing 500s) but cannot send a reply — logged instead, same
 * graceful-degrade policy as the rest of GENE.
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
import { issueMagicLoginLink } from './magic-login'
import { notifyNewEscalation } from './slack-bridge'
import {
    loadProfile,
    loadSignals,
    buildRecommendations,
    templatedRecommendationSummary,
    profileSummaryForPrompt,
    appendAgentMessage,
} from './personal-agent'
import { getAiReply } from './ai-provider'
import { tryHandleListingUploadText, tryHandleListingUploadImage, tryHandleListingUploadImageFromUrl } from './whatsapp-listing-upload'

const LINK_COLLECTION = 'gene_whatsapp_user_links'
const MESSAGE_COLLECTION = 'gene_whatsapp_messages'
const SIGNAL_COLLECTION = 'gene_agent_signals' // shared contract with personal-agent.ts — read-only here
// Shared contract with server/gene/chat.ts's GeneEscalation — same collection,
// same shape, so a WhatsApp "talk to a human" request lands in the exact same
// admin inbox (GET /api/gene/whatsapp/inbox in ./whatsapp.ts) as a web-chat
// escalation. Only ever appends a compatible row here, never redefines it.
const ESCALATIONS_COLLECTION = 'gene_escalations'

/** Easy to customize — keep in sync with the display name used by the web
 * popup (client/src/components/broker/BrokerOnlinePresence.tsx) so the
 * persona is consistent whether a visitor meets "Grace" on the site or on
 * WhatsApp. */
const CONCIERGE_NAME = 'Grace'

export interface WhatsappUserLink {
    id: number
    userId: number
    userName: string
    phone: string
    linkedAt: string
    /** Marketing/broadcast opt-in (server/gene/whatsapp-growth.ts's broadcast
     * route only ever messages numbers where this is true). Absent on rows
     * written before this field existed — treated as opted-in by default
     * (see isOptedIntoMarketing below), since these are numbers that
     * actively engaged with the platform over WhatsApp already; "stop"
     * opts out at any time, same as any compliant WhatsApp/SMS program. */
    marketingOptIn?: boolean
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
const DASHBOARD_COMMAND_RE = /^(dashboard|my dashboard|login|log me in)\s*$/i
const STOP_COMMAND_RE = /^(stop|unsubscribe|opt out|optout)\s*$/i
const START_COMMAND_RE = /^(start|subscribe|opt in|optin)\s*$/i
// First-contact menu, numeric-reply only — deliberately plain text (no
// WhatsApp Cloud API "interactive" list/button payload) to ship without
// needing a Meta message-template review; still gives the same "pick one
// of three things" first-touch flow competitors build with interactive
// messages.
const MENU_FIND_RE = /^1\s*$/
const MENU_LIST_RE = /^2\s*$/
const MENU_HUMAN_RE = /^3\s*$/
const GREETING_TEXT = (name: string) =>
    `👋 Hello${name ? ` ${name}` : ''}! I'm ${CONCIERGE_NAME}, your RealEVR Estates assistant.\n\n` +
    `✅ Verified listings only\n⚡ Instant replies\n🏠 Move-in ready homes\n\n` +
    `How can I help?\n1️⃣ Find a property\n2️⃣ List your property (earn 1,000 UGX)\n3️⃣ Talk to a human broker\n\n` +
    `Reply with a number, or just tell me what you're looking for.`

/**
 * Digits only, no leading '+' — this is the format WhatsApp's Cloud API
 * always sends inbound `from` numbers in, so every stored/looked-up phone
 * must be normalized to the same shape or linking silently never matches.
 *
 * Exported so other modules (self-serve-listing.ts) normalize identically.
 */
export function normalizePhone(raw: string): string {
    return raw.replace(/\D/g, '')
}

export function findLinkByPhone(phone: string): WhatsappUserLink | undefined {
    const rows = readCollection<WhatsappUserLink>(LINK_COLLECTION)
    return rows.find((r) => r.phone === phone)
}

/**
 * Create or update the WhatsApp link for a user — the same
 * read-modify-write `/api/gene/whatsapp/link` already did inline, pulled out
 * so self-serve-listing.ts's OTP-verified flow can reuse it instead of
 * duplicating the collection logic. `phone` must already be normalized.
 */
export function linkPhoneToUser(userId: number, userName: string, phone: string): WhatsappUserLink {
    const rows = readCollection<WhatsappUserLink>(LINK_COLLECTION)
    const idx = rows.findIndex((r) => r.userId === userId)
    const record: WhatsappUserLink = {
        id: idx === -1 ? nextId(rows) : rows[idx].id,
        userId,
        userName,
        phone,
        linkedAt: nowIso(),
    }
    if (idx === -1) rows.push(record)
    else rows[idx] = record
    writeCollection(LINK_COLLECTION, rows)
    return record
}

/** Defaults to true (opted-in) for a link with no explicit value — see the
 * field's docstring. Exported for server/gene/whatsapp-growth.ts's broadcast
 * route. */
export function isOptedIntoMarketing(link: WhatsappUserLink): boolean {
    return link.marketingOptIn !== false
}

function setMarketingOptIn(phone: string, optIn: boolean): WhatsappUserLink | undefined {
    const rows = readCollection<WhatsappUserLink>(LINK_COLLECTION)
    const idx = rows.findIndex((r) => r.phone === phone)
    if (idx === -1) return undefined
    rows[idx] = { ...rows[idx], marketingOptIn: optIn }
    writeCollection(LINK_COLLECTION, rows)
    return rows[idx]
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

/** True if this phone has never messaged in before — checked BEFORE the
 * current inbound message is logged, so the very first message correctly
 * triggers the branded greeting. */
function isFirstContact(phone: string): boolean {
    const rows = readCollection<WhatsappMessageLog>(MESSAGE_COLLECTION)
    return !rows.some((r) => r.phone === phone && r.direction === 'inbound')
}

/** Writes a compatible row into the SAME `gene_escalations` collection
 * server/gene/chat.ts's web-chat escalation flow uses, and best-effort pings
 * Slack the same way — so "talk to a human broker" from WhatsApp shows up in
 * the existing admin inbox (GET /api/gene/whatsapp/inbox in ./whatsapp.ts)
 * instead of a new, separate queue nobody's watching. Resolving it there
 * already texts `customerPhone` back automatically (see whatsapp.ts's
 * /inbox/:id/resolve route) — no new notification code needed here. */
function writeHumanHandoffEscalation(phone: string, lastMessage: string): void {
    type MinimalEscalation = { id: number; sessionId: string; message: string; reason: string; createdAt: string; status: 'open'; customerPhone: string }
    const rows = readCollection<MinimalEscalation>(ESCALATIONS_COLLECTION)
    const escalation: MinimalEscalation = {
        id: nextId(rows),
        sessionId: `whatsapp:${phone}`,
        message: lastMessage || '(no message text — requested a human via the WhatsApp menu)',
        reason: 'whatsapp_menu_human_request',
        createdAt: nowIso(),
        status: 'open',
        customerPhone: phone,
    }
    rows.push(escalation)
    writeCollection(ESCALATIONS_COLLECTION, rows)
    notifyNewEscalation(escalation).catch((err) => console.error('[gene/whatsapp-concierge] Slack notify failed:', err))
}

/** Handles a "1"/"2"/"3" reply to the first-contact menu. Returns true if the
 * message was handled this way. */
async function tryHandleMenuSelection(phone: string, text: string, link: WhatsappUserLink | undefined): Promise<boolean> {
    const trimmed = text.trim()

    if (MENU_FIND_RE.test(trimmed)) {
        await replyAndLog(
            phone,
            "Great — tell me what you're looking for (e.g. \"2 bedroom apartment in Kampala under 800k\") and I'll find real matches for you.",
            link?.userId
        )
        return true
    }

    if (MENU_LIST_RE.test(trimmed)) {
        await replyAndLog(
            phone,
            'Nice — you can list a property (and earn a 1,000 UGX referral once it goes live) at realevrestates.com/list-your-property. Or just tell me the location and I can point you in the right direction.',
            link?.userId
        )
        return true
    }

    if (MENU_HUMAN_RE.test(trimmed)) {
        writeHumanHandoffEscalation(phone, text)
        await replyAndLog(phone, "Got it — connecting you with a human broker. Someone from our team will reply here shortly!", link?.userId)
        return true
    }

    return false
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

/** Handles a linked landlord texting "dashboard" (or "login"/"log me in") —
 * mints a fresh single-use magic-login link (see ./magic-login.ts) and
 * texts it back, so a self-serve landlord who never set a password can
 * always get back into their Agent Dashboard from WhatsApp alone. Returns
 * true if the message was handled as this command. */
async function tryHandleDashboardCommand(phone: string, text: string, link: WhatsappUserLink | undefined): Promise<boolean> {
    if (!DASHBOARD_COMMAND_RE.test(text.trim())) return false

    if (!link) {
        await replyAndLog(
            phone,
            "This number isn't linked to a RealEVR account yet. If you've listed a property with us, link this number from your dashboard's WhatsApp card, or list a property at realevrestates.com/list-your-property to get one."
        )
        return true
    }

    const { url, expiresAt } = issueMagicLoginLink(link.userId)
    const minutes = Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000)
    await replyAndLog(
        phone,
        `Here's your dashboard link (expires in ~${minutes} min, use it once): ${url}`,
        link.userId
    )
    return true
}

/** Handles "stop"/"unsubscribe" and "start"/"subscribe" — opts a linked
 * number out of / back into WhatsApp marketing broadcasts
 * (server/gene/whatsapp-growth.ts). Returns true if the message was handled
 * as one of these commands. Unlinked numbers get a short explanation
 * instead of silently doing nothing — there's nothing to opt out of yet. */
async function tryHandleMarketingOptCommand(phone: string, text: string, link: WhatsappUserLink | undefined): Promise<boolean> {
    const trimmed = text.trim()
    const isStop = STOP_COMMAND_RE.test(trimmed)
    const isStart = START_COMMAND_RE.test(trimmed)
    if (!isStop && !isStart) return false

    if (!link) {
        await replyAndLog(phone, "This number isn't linked to a RealEVR account, so there's nothing to opt out of.")
        return true
    }

    setMarketingOptIn(phone, isStart)
    await replyAndLog(
        phone,
        isStart
            ? "You're opted back in to occasional RealEVR Estates updates. Text STOP anytime to opt out again."
            : "You won't receive RealEVR Estates broadcast messages anymore. Text START to opt back in.",
        link.userId
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
                `You are "${CONCIERGE_NAME}", the RealEVR Estates WhatsApp assistant, replying to this specific user — keep it SHORT (2-4 sentences,`,
                'WhatsApp-appropriate, no markdown), warm, and only reference the facts given below.',
                '',
                'Their profile:',
                profileSummaryForPrompt(profile),
                '',
                'Their current top matches:',
                ...top.map((t) => `- "${t.property.title}" in ${t.property.location} — ${t.property.currency ?? 'UGX'} ${t.property.price}`),
            ].join('\n')

            const aiResult = await getAiReply(systemPrompt, text)
            const reply = aiResult?.reply ?? `${templatedRecommendationSummary(profile, top)} Reply with a property name for more detail, or "more" for other picks.`

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
    const reply = `I'm ${CONCIERGE_NAME} from RealEVR Estates ✅ verified listings only. A few properties you might like:\n${list}\n\nSign in on the website and link this WhatsApp number from your profile for picks tailored to your budget and interests.`
    await replyAndLog(phone, reply)
}

/** Exported so the Infobip webhook route below (and any future inbound
 * transport) can reuse the exact same command routing as the Meta webhook,
 * rather than re-implementing it. */
export async function handleInboundText(phone: string, text: string): Promise<void> {
    const link = findLinkByPhone(phone)
    const firstContact = isFirstContact(phone)
    logMessage({ phone, direction: 'inbound', text, userId: link?.userId })

    // Branded greeting + menu fires once, on the very first message this
    // number has ever sent in — mirrors the "Hello <name>! Welcome to
    // <persona>..." first-touch pattern, then still processes whatever they
    // actually typed below (so "hi" or a real question both get answered).
    if (firstContact) {
        await replyAndLog(phone, GREETING_TEXT(link?.userName ?? ''), link?.userId)
    }

    // Checked first, ahead of every other command: an in-progress "list a
    // property" draft must win even if an answer happens to look like
    // another command (e.g. a description that contains the word
    // "dashboard"). See whatsapp-listing-upload.ts.
    const handledAsListingUpload = await tryHandleListingUploadText(phone, text, link)
    if (handledAsListingUpload) return

    const handledAsOptCommand = await tryHandleMarketingOptCommand(phone, text, link)
    if (handledAsOptCommand) return

    const handledAsDashboard = await tryHandleDashboardCommand(phone, text, link)
    if (handledAsDashboard) return

    const handledAsToggle = await tryHandleAvailabilityToggle(phone, text, link)
    if (handledAsToggle) return

    const handledAsMenu = await tryHandleMenuSelection(phone, text, link)
    if (handledAsMenu) return

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
                if (!phone) continue

                // Photos only matter mid-listing-upload (see
                // whatsapp-listing-upload.ts) - anything else with an image
                // and no active draft is silently ignored today, same as
                // before this feature existed.
                if (msg?.type === 'image' && typeof msg?.image?.id === 'string') {
                    await tryHandleListingUploadImage(phone, msg.image.id)
                    continue
                }

                const text = msg?.text?.body
                if (typeof text !== 'string' || !text.trim()) continue
                await handleInboundText(phone, text.trim())
            }
        } catch (err) {
            console.error('[gene/whatsapp-concierge] webhook processing failed:', err)
        }
    })

    // POST /api/gene/whatsapp/webhook/infobip — inbound message delivery when
    // Infobip is the configured provider (see whatsapp.ts's doc comment).
    // Point this URL at Infobip's "Received WhatsApp Messages" webhook
    // config (Channels and Numbers > WhatsApp > your sender > forwarding).
    // Infobip has no GET handshake like Meta's — just a POST with an API
    // key you can optionally have Infobip send back for verification (not
    // required to get this working, so not enforced here).
    app.post('/api/gene/whatsapp/webhook/infobip', async (req: Request, res: Response) => {
        res.sendStatus(200)
        try {
            const results = req.body?.results
            if (!Array.isArray(results) || results.length === 0) return

            for (const result of results) {
                const phone = normalizePhone(result?.from ?? '')
                if (!phone) continue

                const message = result?.message
                const type = typeof message?.type === 'string' ? message.type.toUpperCase() : ''

                if (type === 'IMAGE' && typeof message?.url === 'string') {
                    await tryHandleListingUploadImageFromUrl(phone, message.url)
                    continue
                }

                const text = typeof message?.text === 'string' ? message.text : undefined
                if (!text || !text.trim()) continue
                await handleInboundText(phone, text.trim())
            }
        } catch (err) {
            console.error('[gene/whatsapp-concierge] Infobip webhook processing failed:', err)
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

            linkPhoneToUser(user.id, user.username ?? user.email ?? `user:${user.id}`, normalized)

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
