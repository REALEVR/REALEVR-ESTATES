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
import { isAboutProperties, isSmallTalk } from '../../shared/property-talk'
import { knowledgeFor, recordGap } from './kevin-knowledge'
import { readCollection, writeCollection, nextId, nowIso } from './store'
import { storage } from '../storage'
import type { User } from '@shared/schema'
import { notifyNewEscalation } from './slack-bridge'
import { getAiReply } from './ai-provider'
import { requireStrictAdmin } from './admin-guard'
import {
    describeLead,
    detectContactUpdate,
    extractLeadUpdate,
    getLead,
    isIntakeComplete,
    listLeads,
    recordInterest,
    recordLeadTurn,
    summarizeDemand,
    type KevinLead,
    type LeadUpdate,
} from './kevin-leads'
import { toCard } from './kevin-actions'
import { converse, describeNeed, getSnapshot, knowledgeContext, parseSignals, wantsFrom, type BrainResult } from './kevin-brain'
import { getAdminWhatsappNumbers, notifyAdminsEverywhere } from './admin-notify'
import { detectUrgent, urgentReply } from '../../shared/urgent'
import { audienceReply, AUDIENCES } from '../../shared/kevin-audience'
import { cryptoAnswer } from '../../shared/kevin-crypto'
import { configuredProvider } from './kevin-voice'
import { elevenLabsConfigured, elevenLabsCredits } from './elevenlabs'
import { speechStatus } from './speech-providers'
import { currencyForCountry, placeFromCookieHeader, type Place } from '../../shared/africa'
import {
    appendAgentMessage,
    buildRecommendations,
    loadProfile,
    loadSignals,
    profileSummaryForPrompt,
    profileWants,
    recordAgentSignal,
    syncProfileFromKevin,
} from './personal-agent'
import {
    ACTION_PROMPT,
    GO_PAGES,
    extractKevinAction,
    findListing,
    parseShown,
    searchListings,
    type KevinAction,
    type KevinCard,
    type RawAction,
} from './kevin-actions'
import { languageInstruction, chosenLanguageInstruction, parseChosenLanguage, type ChosenLanguage } from './locale'

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
    /** Set once the conversation is about property; from then on its follow-ups ("the second one", "2 million") are kept too. */
    propertyRelated?: boolean
    /** When the team was last alerted to an urgent message in this conversation (no more than once per ten minutes). */
    urgentAt?: string
    /** Which kinds of interest (company, sponsor) the team has already been told about. */
    told_company?: boolean
    told_sponsor?: boolean
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
    /** Set when the escalating channel has a real phone number on hand
     * (WhatsApp, or My Agent for a user with one on file) — whatsapp.ts's
     * resolve route texts a confirmation back to this number automatically. */
    customerPhone?: string
}

const OFF_TOPIC_REPLY =
    "I'm Kevin, and property is what I know: homes to rent or buy, BnBs, land and bank sales. Tell me what you're looking for, an area, a type of home or a budget, and I'll find it."
const CONVERSATIONS_COLLECTION = 'gene_conversations'
const ESCALATIONS_COLLECTION = 'gene_escalations'

// ---------------------------------------------------------------------------
// Intent classification — small rule-based classifier, no ML dependency.
// ---------------------------------------------------------------------------

export function classifyIntent(message: string): GeneIntent {
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

export function isLowConfidence(intent: GeneIntent, usedAi: boolean, reply: string, allowShort = false): boolean {
    if (intent === 'human_handoff_request') return true
    if (!usedAi && intent === 'general_question') return true
    const hedgeMarkers = ["i'm not sure", "i don't know", "i don't have", 'cannot help', "can't help", 'no information']
    const lowered = reply.toLowerCase()
    // Length is only a meaningful signal for scripts where 8 characters is
    // barely a word; a complete reply in Chinese or Japanese can be shorter.
    // (Spoken replies are allowed to be short: "Okay." is a complete answer.)
    if (!allowShort && reply.trim().length < 8 && /^[\x00-\x7F]*$/.test(reply)) return true
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

export type GenePersona = 'gene' | 'kevin'

// Kevin is the site's floating concierge (client/src/components/kevin). His
// replies are read aloud and may be in any language, so the prompt asks for
// spoken-style text, and for a machine-readable marker when a human is wanted:
// classifyIntent's regexes only understand English, so "I'd like to talk to a
// person" in Luganda or French would otherwise never reach the team.
const HUMAN_HANDOFF_TOKEN = '[[HUMAN]]'

const GENE_PERSONA_PROMPT = [
    'You are GENE, a helpful, concise real-estate assistant for a property platform operating across East Africa',
    '(Uganda, Kenya, Tanzania, Rwanda). You help prospective tenants/buyers with pricing, availability, and',
    'booking viewings. Be friendly, brief (2-4 sentences), and honest — if you do not know a specific fact',
    '(exact price, exact availability), say so and offer to connect them with a human agent rather than guessing.',
]

const KEVIN_PERSONA_PROMPT = [
    'You are Kevin, the warm, well-travelled concierge of RealEVR Estates, a property platform with immersive 360° virtual tours',
    'across East Africa (Uganda first, also Kenya, Tanzania and Rwanda). You help visitors find a home, understand prices and',
    'availability, book viewings, and use the site (virtual tours, BnB stays, paying rent through RentRail).',
    'Homes for sale can be bought with Bitcoin or another digital currency: the property page has a Buy with Bitcoin button, and payment goes to an escrow or the seller\'s lawyer on written instructions after the seller agrees and the buyer is verified. Never tell anyone to send coin to a wallet.',
    'Your replies are read aloud, so write the way people speak: one to three short sentences, no markdown, no bullet lists,',
    'no emojis, and never spell out web addresses.',
    'Be honest: if you do not know an exact price or whether something is available, say so and offer a human from the team',
    'rather than guessing.',
    `If the visitor asks to speak to a person, an agent, a human or support (in any language), answer kindly and end your message with the exact token ${HUMAN_HANDOFF_TOKEN}.`,
]

// What Kevin will and will not talk about, and how he stays honest about a world he cannot see all of.
// [[GAP]] and [[IGNORE]] are control markers: they are stripped before anything is shown or spoken.
const KEVIN_SCOPE_PROMPT = [
    'SCOPE: you are a worldwide property expert and you talk only about property: renting, buying, selling, building or renovating, land, mortgages and financing,',
    'landlord and tenant matters, valuing and investing, moving, short stays, and the buildings, neighbourhoods and markets themselves, in any country. This site\'s own listings are mostly',
    'in East Africa, but anyone anywhere may ask you anything about property, and you help them.',
    'If someone asks about anything that is not property, say in one short, kind sentence that property is what you are here for and invite a property question. Do not answer the',
    'off-topic question, however easy it is, and never be curt about it.',
    'Honesty across the world: property law, taxes, fees, rents and prices differ by country and city and change over time. Give the general principle and how it usually works in the',
    'place they mean, use that place\'s currency and units, and say plainly what to confirm with a licensed local lawyer, agent or the official land registry. Never invent a law, fee,',
    'price, listing or statistic. A figure that is not in the platform facts or the background below is an estimate: say so.',
    'When you cannot answer a property question reliably, say so honestly, say where to find out, and end your reply with the exact token [[GAP]] so the team can teach you.',
]

// Always-listening hands-free mode: what arrives may be a television or a conversation in the room.
const KEVIN_AMBIENT_PROMPT = [
    'The visitor did not tap or type: you overheard these words through an always-listening microphone, so they may come from a television or other people.',
    'If the words are not clearly meant for you, or are not about property, reply with exactly [[IGNORE]] and nothing else.',
]

const IGNORE_TOKEN = /\[\[\s*IGNORE\s*\]\]/i
const GAP_TOKEN = /\[\[\s*GAP\s*\]\]/i
const CONTROL_MARKERS = /\[\[\s*(?:IGNORE|GAP)\s*\]\]/gi

// Voice mode is the visitor talking to Kevin out loud, the way people use a phone
// assistant. What makes those feel good is not the voice, it is the manner:
// the answer comes first, it is one breath long, it does the thing instead of
// describing it, and anything already on the screen is not read out.
const KEVIN_VOICE_PROMPT = [
    'The visitor is TALKING to you and will hear your answer spoken, like a phone assistant. Be brief:',
    'one short sentence, two at the very most, under 30 words. Lead with the answer; do not repeat their question,',
    'do not greet them again, and skip filler such as "Certainly!" or "Great question!".',
    'When you do something for them, say it in a few words ("Sure, here you go." / "Okay, opening it.").',
    'Ask at most one short question, and only when you cannot act without the answer.',
    'Never read out a list or every detail: the screen shows the rest, so mention at most one thing.',
    'Say numbers and prices the way a person speaks ("two and a half million shillings"), never "UGX 2,500,000".',
    'If they thank you or say goodbye, answer in two or three words.',
]

// The welcome conversation (see kevin-leads.ts): learn the visitor's name, what
// they need and how to reach them, one friendly question at a time, and hand
// back what was learned in a token. Appended only while it is still needed.
const KEVIN_INTAKE_PROMPT = [
    'You are also welcoming this visitor and learning how to help them. Ask for ONE thing at a time, warmly, like a person, never like a form.',
    'If they ask you something first, answer it briefly, then ask for the next thing.',
    'When you ask for an email address or WhatsApp number, say once, in one short sentence, that you will share it with the RealEVR team so they can help, and that they are free to say no.',
    'Never ask for passwords, ID numbers, card or mobile-money details.',
    'Whenever the visitor tells you any of these, end your reply with [[LEAD {"name":"...","email":"...","phone":"...","need":"...","location":"...","budget":"...","propertyType":"apartment","bedrooms":2,"maxBudget":1500000,"movingSoon":true,"moveTiming":"next month"}]] containing ONLY the fields they just gave (a short summary for need; budgets as plain numbers of Ugandan shillings; movingSoon only when they say they are moving or shifting soon).',
    'Also find out, one question at a time, what kind of place they want (type, bedrooms, area, budget) and whether they are shifting soon and when. Recommend only homes from the platform facts you are given.',
    'If they decline to share contact details, thank them kindly, carry on helping, and end your reply with [[LEAD {"declined":true}]].',
    'Once you have what you need, thank them by name and carry on helping with their search; do not ask again. Never mention the token.',
]

const KEVIN_INTRO_INTAKE_INSTRUCTION =
    'The visitor has just chosen their language. Introduce yourself as Kevin in one warm sentence, then ask for their first name so you can look after them properly. Say nothing else.'

const KEVIN_INTRO_INSTRUCTION =
    'The visitor has just chosen their language. Introduce yourself as Kevin in one warm sentence, then ask in one short sentence how you can help them find a home today. Say nothing else.'

interface ReplyOptions {
    persona: GenePersona
    chosenLanguage: ChosenLanguage | null
    /** The visitor is speaking to Kevin and will hear the answer. */
    voice?: boolean
    /** Listings currently on the visitor's screen, so "the second one" means something. */
    shown?: { id: number; title: string }[]
    /** Facts the model must base its answer on (the result of a search Kevin just ran). */
    facts?: string
    /** The welcome conversation is still under way: what Kevin knows and should ask next. */
    intake?: string
    /** What the platform really holds (kevin-brain.ts knowledgeContext), so Kevin can recommend from it. */
    knowledge?: string
    /** Where the visitor is, so homes near them come first and prices are in their currency. */
    place?: Place | null
    /** Heard through the always-listening microphone rather than tapped or typed. */
    ambient?: boolean
    /** Worldwide background for this question (kevin-knowledge.ts): reports and facts the team added. */
    world?: string
}

async function getReply(
    history: GeneChatMessage[],
    message: string,
    acceptLanguage?: string | string[],
    options: ReplyOptions = { persona: 'gene', chosenLanguage: null }
): Promise<string | null> {
    const propertyContext = await buildPropertyContext()
    const systemPrompt = [
        ...(options.persona === 'kevin' ? KEVIN_PERSONA_PROMPT : GENE_PERSONA_PROMPT),
        ...(options.persona === 'kevin' ? KEVIN_SCOPE_PROMPT : []),
        ...(options.persona === 'kevin' && options.ambient ? KEVIN_AMBIENT_PROMPT : []),
        ...(options.persona === 'kevin' ? ACTION_PROMPT : []),
        ...(options.persona === 'kevin' && options.voice ? KEVIN_VOICE_PROMPT : []),
        options.persona === 'kevin' && options.shown?.length
            ? `Homes on the visitor's screen right now: ${options.shown.map((s, i) => `${i + 1}. id ${s.id}, ${s.title}`).join('; ')}.`
            : '',
        options.facts ?? '',
        ...(options.persona === 'kevin' && options.intake ? [...KEVIN_INTAKE_PROMPT, options.intake] : []),
        // An explicit choice beats the browser's guess.
        options.chosenLanguage ? chosenLanguageInstruction(options.chosenLanguage) : languageInstruction(acceptLanguage),
        options.persona === 'kevin' && options.knowledge ? options.knowledge : propertyContext,
        options.persona === 'kevin' ? options.world ?? '' : '',
    ]
        .filter(Boolean)
        .join('\n')

    const result = await getAiReply(
        systemPrompt,
        message,
        history.slice(-8).map((m) => ({ role: m.role, text: m.text }))
        // A spoken answer is under 30 words; room is left for the bracketed markers (lead, search) that can ride along.
        , options.persona === 'kevin' && options.voice ? 280 : 500
    )
    return result?.reply ?? null
}

function extractHandoffToken(reply: string): { text: string; requested: boolean } {
    if (!reply.includes(HUMAN_HANDOFF_TOKEN)) return { text: reply, requested: false }
    return { text: reply.split(HUMAN_HANDOFF_TOKEN).join('').trim(), requested: true }
}

function cannedReply(intent: GeneIntent, persona: GenePersona): string {
    const text = CANNED_REPLIES[intent]
    return persona === 'kevin' ? text.replace('Thanks for reaching out to GENE.', "Thanks for stopping by, I'm Kevin.") : text
}

/**
 * Carry out the action Kevin asked for (if any) and settle what he says about
 * it. A search is two steps on purpose: the first reply is written before the
 * results exist, so a second short call has him describe what was really
 * found - in the visitor's language, and honestly when it is nothing.
 */
async function runKevinAction(
    raw: RawAction | null,
    firstText: string,
    history: GeneChatMessage[],
    message: string,
    acceptLanguage: string | string[] | undefined,
    options: ReplyOptions
): Promise<{ text: string; action: KevinAction | null; results: KevinCard[] }> {
    if (!raw) return { text: firstText, action: null, results: [] }

    if (raw.kind === 'go') {
        return { text: firstText, action: { type: 'go', page: raw.page, path: GO_PAGES[raw.page] }, results: [] }
    }

    if (raw.kind === 'open') {
        const listing = await findListing(raw.propertyId)
        if (!listing) return { text: firstText, action: null, results: [] }
        return { text: firstText, action: { type: 'open', propertyId: listing.id }, results: [listing] }
    }

    const query = options.place ? { ...raw.query, currency: raw.query.currency ?? currencyForCountry(options.place.country) } : raw.query
    const { cards, total } = await searchListings(query, 3, options.place)
    const lines = cards.map(
        (c, i) => `${i + 1}. ${c.title}, ${c.location}, ${c.bedrooms} bedrooms, ${c.currency} ${c.price}`
    )
    const facts = total
        ? `A search for the visitor just ran and found ${total} matching homes. The best ${cards.length} are now on their screen:\n${lines.join('\n')}\n` +
          'Tell them what you found in one or two short sentences: the count, and only the first home (name, area, price). They can see the others, so do not read them out.'
        : 'A search for the visitor just ran and found no matching homes. Say so in one short sentence and suggest widening the search (another area, a higher budget or fewer bedrooms).'
    const second = await getReply(history, message, acceptLanguage, { ...options, facts, shown: undefined })
    const secondText = second ? extractKevinAction(extractHandoffToken(second).text).text : ''
    const fallback = total ? "Here's what I found." : "I couldn't find a match, but I can look again if you widen the search."
    return {
        text: secondText || firstText || fallback,
        action: { type: 'results', query: raw.query, total },
        results: cards,
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

/**
 * The ONE place any GENE surface writes a "needs a human" escalation —
 * shared by this module's own web-chat widget, server/gene/whatsapp-
 * concierge.ts's WhatsApp "talk to a human" handling, and server/gene/
 * personal-agent.ts's "My Agent" chat. Previously each surface only best-
 * effort-posted to Slack, which the admin may not have configured or be
 * watching; this now ALSO fans out through admin-notify.ts's
 * notifyAdminsEverywhere (in-app bell + email + WhatsApp to the owner's own
 * numbers) — so "a human is needed" reliably reaches the admin regardless
 * of which agent surface a visitor/user actually reached, and regardless
 * of Slack being configured. `customerPhone`, when the calling surface has
 * one on hand (WhatsApp always does; My Agent does whenever the user has a
 * phone number on file), lets whatsapp.ts's resolve route text a
 * confirmation back automatically once handled.
 */
export function writeEscalation(sessionId: string, message: string, reason: string, customerPhone?: string, quiet = false): void {
    const rows = readCollection<GeneEscalation>(ESCALATIONS_COLLECTION)
    const escalation: GeneEscalation = {
        id: nextId(rows),
        sessionId,
        message,
        reason,
        createdAt: nowIso(),
        status: 'open',
        ...(customerPhone ? { customerPhone } : {}),
    }
    rows.push(escalation)
    writeCollection(ESCALATIONS_COLLECTION, rows)
    // Both best-effort — never let a notification failure affect the chat response.
    if (quiet) return // the caller has already told the team in its own words
    notifyNewEscalation(escalation).catch((err) => console.error('[gene/chat] Slack notify failed:', err))
    import('./admin-notify')
        .then(({ notifyAdminsEverywhere }) =>
            notifyAdminsEverywhere({
                title: 'Needs a human',
                message: `"${message}" (reason: ${reason}, session ${sessionId})`,
                whatsappMessage: `🆘 Needs a human\n\n"${message}"\n\nReason: ${reason}\nSession: ${sessionId}`,
                link: '/admin',
                data: { escalationId: escalation.id, sessionId, reason },
            })
        )
        .catch((err) => console.error('[gene/chat] admin notification failed:', err))
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
 * routed through gene/admin-notify.ts's notifyAdminsEverywhere so this
 * reaches all three channels (in-app, email, and both of the owner's
 * WhatsApp numbers), not just the in-app + email this used to send.
 */
async function notifyAdminsOfNewLead(sessionId: string, message: string, contact: string): Promise<void> {
    try {
        const { notifyAdminsEverywhere } = await import('./admin-notify')
        await notifyAdminsEverywhere({
            title: 'New lead from AI chat',
            message: `A visitor shared their contact details (${contact}) while chatting with the site assistant. Their message: "${message}" (session ${sessionId}).`,
            html: `<p>A visitor just shared their contact details while chatting with the site's AI assistant.</p>
             <ul>
               <li><strong>Contact:</strong> ${contact}</li>
               <li><strong>Their message:</strong> ${message}</li>
               <li><strong>Session:</strong> ${sessionId}</li>
             </ul>`,
            whatsappMessage: `💬 New lead from AI chat\nContact: ${contact}\nMessage: "${message}"`,
            link: `/admin`,
            data: { sessionId, contact, chatMessage: message },
        })
    } catch (err) {
        console.error('[gene/chat] failed to notify admins about a new lead:', err)
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

            // Kevin's "introduce yourself in the language I just picked" call.
            // Stateless on purpose: no message is stored and nothing is
            // escalated, and the intro is never saved into the conversation -
            // a history that opens with an assistant turn is rejected by some
            // providers (Anthropic requires the first turn to be the user's).
            // A null reply tells the client to use its built-in intro line.
            if (body.intro === true && body.persona === 'kevin') {
                const reply = await getReply([], body.intake === true ? KEVIN_INTRO_INTAKE_INSTRUCTION : KEVIN_INTRO_INSTRUCTION, req.headers['accept-language'], {
                    persona: 'kevin',
                    chosenLanguage: parseChosenLanguage(body.language),
                })
                return res.json({ reply: reply ? extractKevinAction(extractHandoffToken(reply).text).text : null })
            }

            const message = typeof body.message === 'string' ? body.message.trim() : ''
            if (!message) {
                return res.status(400).json({ message: 'Field "message" is required and must be a non-empty string.' })
            }

            const sessionId =
                typeof body.sessionId === 'string' && body.sessionId.trim().length > 0 ? body.sessionId.trim() : randomUUID()

            // Only the site's own Kevin widget asks for his persona; every
            // other caller (WhatsApp, the older widget) keeps GENE.
            const persona: GenePersona = body.persona === 'kevin' ? 'kevin' : 'gene'
            const chosenLanguage = parseChosenLanguage(body.language)

            const conversation = loadConversation(sessionId)

            const intent = classifyIntent(message)
            conversation.messages.push({ role: 'user', text: message, intent, createdAt: nowIso() })

            // Sign-up and welcome: the visitor says what brings them here (tenant, landlord, company, sponsor) and Kevin
            // answers with the right next steps. No AI needed, and the team hears about companies and sponsors.
            if (persona === 'kevin' && typeof body.choice === 'string' && (AUDIENCES as string[]).includes(body.choice)) {
                const guided = audienceReply(body.choice, chosenLanguage?.name)!
                conversation.propertyRelated = true
                conversation.messages.push({ role: 'assistant', text: guided.reply, intent: 'general_question', createdAt: nowIso() })
                saveConversation(conversation)
                if ((body.choice === 'company' || body.choice === 'sponsor') && !(conversation as Record<string, any>)[`told_${body.choice}`]) {
                    ;(conversation as Record<string, any>)[`told_${body.choice}`] = true
                    saveConversation(conversation)
                    const who = req.isAuthenticated?.() ? (req.user as User) : null
                    notifyAdminsEverywhere({
                        title: `New ${body.choice} interest via Kevin`,
                        message: `A visitor${who ? ` (${who.fullName || who.username}, ${who.email ?? 'no email'}${who.phoneNumber ? `, ${who.phoneNumber}` : ''})` : ''} said they are a ${body.choice}${body.context === 'signup' ? ' while signing up' : ''}. Session ${sessionId}.`,
                        whatsappMessage: `🤝 New ${body.choice} interest (Kevin)${who ? `\n${who.fullName || who.username} ${who.phoneNumber ?? who.email ?? ''}` : ''}`,
                        link: '/admin/kevin-leads',
                    }).catch(() => {})
                }
                return res.json({ sessionId, reply: guided.reply, intent: 'general_question', escalated: false, leadCaptured: false, action: null, results: [], whatsapp: guided.whatsapp, links: guided.links, lead: null })
            }

            // Urgent talk (a break-in, a flood, a scam, "locked out", "I need a place tonight"): the team is told
            // at once on every channel, and the visitor gets a direct WhatsApp button. Only once per ten minutes
            // per conversation, so a distressed visitor typing five messages does not bury the owner's phone.
            // Words overheard through the always-listening microphone that are not about property (a film, the neighbours) never raise an alarm.
            const urgent = persona === 'kevin' && !(body.ambient === true && !isAboutProperties(message)) ? detectUrgent(message) : null
            if (urgent) {
                const last = conversation.urgentAt ? Date.parse(conversation.urgentAt) : 0
                if (Date.now() - last > 10 * 60 * 1000) {
                    ;conversation.urgentAt = nowIso()
                    const who = req.isAuthenticated?.() ? (req.user as User) : null
                    const known = who ? `${who.fullName || who.username}${who.phoneNumber ? `, ${who.phoneNumber}` : ''}${who.email ? `, ${who.email}` : ''}` : (conversation.capturedLead?.contact ?? 'no contact shared yet')
                    const label = urgent.level === 'emergency' ? 'EMERGENCY' : 'URGENT'
                    const snippet = message.length > 300 ? `${message.slice(0, 300)}…` : message
                    notifyAdminsEverywhere({
                        title: `${label} message via Kevin`,
                        message: `${label} (${urgent.matched}) from ${known}${body.context === 'signup' ? ' [on the sign-up screen]' : ''}: "${snippet}". Session ${sessionId}.`,
                        whatsappMessage: `🚨 ${label} via Kevin\n${known}\n"${snippet}"\nThey were sent your WhatsApp button; reply to them as soon as you can.`,
                        link: '/admin',
                        data: { sessionId, level: urgent.level },
                    }).catch((err) => console.error('[gene/chat] urgent alert failed:', err))
                    writeEscalation(sessionId, message, `urgent_${urgent.level}`, undefined, true)
                }
                conversation.propertyRelated = true
            }

            // Paying with Bitcoin or another digital currency: a fixed, correct answer in the visitor's language, whether or
            // not an AI is set up. Skipped when it is urgent (a scam involving crypto must reach the team, not an FAQ) or when
            // the same message carries contact details that the welcome conversation should record.
            const coin = persona === 'kevin' && !urgent && !detectContactDetails(message) ? cryptoAnswer(message, chosenLanguage?.name) : null
            if (coin) {
                conversation.propertyRelated = true
                conversation.messages.push({ role: 'assistant', text: coin.reply, intent: 'general_question', createdAt: nowIso() })
                saveConversation(conversation)
                return res.json({ sessionId, reply: coin.reply, intent: 'general_question', escalated: false, leadCaptured: false, action: null, results: [], whatsapp: coin.whatsapp, links: coin.links, lead: null })
            }

            // Lead capture — only the first time per conversation, so
            // mentioning a number twice doesn't double-notify admins.
            let justCapturedLead = false
            if (!conversation.capturedLead) {
                const contact = detectContactDetails(message)
                if (contact) {
                    conversation.capturedLead = { contact, capturedAt: nowIso() }
                    justCapturedLead = true
                    // Kevin's visitors are recorded (and the team told) by
                    // kevin-leads.ts, with their name and need; telling the team
                    // twice about the same person would only be noise.
                    if (persona !== 'kevin') {
                        // Fire-and-forget, same posture as writeEscalation's Slack
                        // notify above — never let this slow down or fail the reply.
                        notifyAdminsOfNewLead(sessionId, message, contact).catch((err) =>
                            console.error('[gene/chat] lead notification failed:', err)
                        )
                    }
                }
            }

            // The welcome conversation: still under way unless this visitor has
            // already told Kevin what he needs to know (or declined to).
            const signedIn = persona === 'kevin' && req.isAuthenticated?.() ? (req.user as User) : null
            // Where the visitor is (their time zone, a place they chose, or a location they shared), from the cookie the site sets.
            const place = persona === 'kevin' ? placeFromCookieHeader(req.headers.cookie) : null
            // Everything Kevin looks up before answering is looked up at the same moment, not one after another: a spoken
            // reply feels instant or it feels fake. Worldwide background gets 700 ms in a spoken exchange and no live fetch.
            const spoken = persona === 'kevin' && body.voice === true
            const [knownLead, snapshot, world] = await Promise.all([
                persona === 'kevin' ? getLead(sessionId) : Promise.resolve(null),
                persona === 'kevin' ? getSnapshot().catch(() => null) : Promise.resolve(null),
                persona === 'kevin'
                    ? Promise.race([
                          knowledgeFor(message, place?.country, { live: !spoken }),
                          new Promise<string>((resolve) => setTimeout(() => resolve(''), spoken ? 700 : 3500)),
                      ])
                    : Promise.resolve(''),
            ])
            const intaking = persona === 'kevin' && !isIntakeComplete(knownLead) && (body.intake === true || !!knownLead)

            // A signed-in visitor has a "My Agent" profile and picks: Kevin is that agent now, so he
            // starts from what it already knows and his answers feed it back (see syncProfileFromKevin).
            const agentProfile = persona === 'kevin' && signedIn ? loadProfile(signedIn.id) : null
            const picks =
                agentProfile && snapshot
                    ? buildRecommendations(agentProfile, loadSignals(signedIn!.id), snapshot.raw, 3).map((t) => ({
                          card: toCard(t.property),
                          reason: t.reasons[0],
                      }))
                    : []
            const agentKnowledge = agentProfile
                ? [
                      `This visitor is signed in. What they saved with their personal agent:\n${profileSummaryForPrompt(agentProfile)}`,
                      picks.length ? `Their best matches right now: ${picks.map((p) => `${p.card.title} in ${p.card.location}`).join('; ')}.` : '',
                      'Use this instead of asking again; when they ask what suits them, recommend from these matches.',
                  ]
                      .filter(Boolean)
                      .join('\n')
                : ''
            const replyOptions: ReplyOptions = {
                persona,
                chosenLanguage,
                voice: persona === 'kevin' && body.voice === true,
                shown: persona === 'kevin' ? parseShown(body.shown) : undefined,
                intake: intaking ? describeLead(knownLead, signedIn) : undefined,
                knowledge: snapshot
                    ? [
                          knowledgeContext(snapshot, place ? currencyForCountry(place.country) : 'UGX', place),
                          agentKnowledge,
                          body.context === 'signup'
                              ? 'The visitor is on the sign-up screen. Act as their personal assistant: help them choose how to sign up, explain why we ask for a WhatsApp number (so agents and the team can reach them about viewings and bookings), say signing up is free, and never ask for a password. They may be a tenant, a landlord, a company or a sponsor; find out which and help them all the way.'
                              : '',
                      ]
                          .filter(Boolean)
                          .join('\n')
                    : undefined,
                place,
                ambient: persona === 'kevin' && body.ambient === true,
                // Worldwide background (reports from the countries asked about, things the team taught him).
                world: persona === 'kevin' ? world : undefined,
            }
            const history = conversation.messages.slice(0, -1)
            const rawReply = await getReply(history, message, req.headers['accept-language'], replyOptions)
            // Control markers never reach the visitor. [[GAP]]: he could not answer a property question well.
            const aiReply = rawReply === null ? null : rawReply.replace(CONTROL_MARKERS, '').trim() || null
            if (persona === 'kevin' && rawReply !== null && GAP_TOKEN.test(rawReply) && (isAboutProperties(message) || conversation.propertyRelated)) {
                void recordGap(message, place?.country)
            }
            // No AI provider (or it failed): Kevin answers from the real listings himself
            // (kevin-brain.ts) instead of repeating one canned line.
            let brain: BrainResult | null = null
            // Without an AI, the brain treats whatever it hears as a home search. Talk that has nothing to do with
            // property (and no property conversation under way, no welcome questions being answered) must not become
            // a search, a "wanted" place or a saved need: he just says what he is for.
            const offTopic =
                persona === 'kevin' && !aiReply && !intaking && !conversation.propertyRelated && !isAboutProperties(message) && intent !== 'human_handoff_request'
            // Overheard, not addressed to him or not about property: say nothing at all.
            const modelSaidIgnore = rawReply !== null && IGNORE_TOKEN.test(rawReply)
            if (replyOptions.ambient && !isAboutProperties(message) && (modelSaidIgnore || offTopic)) {
                conversation.messages.pop()
                return res.json({ sessionId, reply: '', ignored: true, action: null, results: [], whatsapp: false, lead: null })
            }
            if (persona === 'kevin' && !aiReply && !offTopic) {
                try {
                    brain = await converse({
                        message,
                        lead: knownLead,
                        account: signedIn,
                        intaking,
                        shown: replyOptions.shown ?? [],
                        turn: conversation.messages.filter((m) => m.role === 'assistant').length,
                        hints: agentProfile ? profileWants(agentProfile) : undefined,
                        place,
                        picks,
                    })
                } catch (err) {
                    console.error('[gene/chat] Kevin brain failed, using the canned reply:', err)
                }
            }
            const usedAi = aiReply !== null || brain !== null || offTopic
            let reply = aiReply ?? brain?.reply ?? (offTopic ? OFF_TOPIC_REPLY : null) ?? cannedReply(intent, persona)

            // Kevin flags "wants a human" in any language with a token (see
            // KEVIN_PERSONA_PROMPT), and asks for an on-screen action with
            // another (see kevin-actions.ts); strip both so neither is ever
            // shown or spoken.
            let effectiveIntent: GeneIntent = intent
            let action: KevinAction | null = null
            let results: KevinCard[] = []
            let leadUpdate = null as ReturnType<typeof extractLeadUpdate>['update']
            let whatsapp = false
            let search: BrainResult['search']
            if (brain) {
                leadUpdate = brain.update
                action = brain.action
                results = brain.results
                whatsapp = brain.whatsapp
                search = brain.search
                if (brain.handoff) effectiveIntent = 'human_handoff_request'
            }
            if (persona === 'kevin' && aiReply) {
                const learned = extractLeadUpdate(reply)
                reply = learned.text
                leadUpdate = learned.update
                // Whatever the model remembers to report, what people want and when they move is
                // worth keeping: pick it out of the message ourselves as well.
                if (snapshot) {
                    const picked = wantsFrom(parseSignals(message, snapshot.locations))
                    delete picked.name
                    const want = { ...knownLead, ...picked, ...(leadUpdate ?? {}) }
                    const need = describeNeed(want)
                    leadUpdate = { ...picked, ...(need && !knownLead?.need ? { need } : {}), ...(place && !knownLead?.country ? { country: place.country } : {}), ...(leadUpdate ?? {}) }
                    if (Object.keys(leadUpdate).length === 0) leadUpdate = null
                }
            }
            if (persona === 'kevin' && aiReply) {
                const extracted = extractHandoffToken(reply)
                if (extracted.requested) {
                    effectiveIntent = 'human_handoff_request'
                    reply = extracted.text || cannedReply('human_handoff_request', persona)
                }
                const acted = extractKevinAction(reply)
                if (acted.action && effectiveIntent !== 'human_handoff_request') {
                    const done = await runKevinAction(
                        acted.action,
                        acted.text,
                        history,
                        message,
                        req.headers['accept-language'],
                        replyOptions
                    )
                    reply = done.text
                    action = done.action
                    results = done.results
                } else {
                    reply = acted.text || reply
                }
            }
            // A greeting, a thank-you, "are you there": he answers, but never searches or takes the visitor anywhere.
            if (persona === 'kevin' && isSmallTalk(message)) {
                action = null
                results = []
            }
            // Deterministic, not dependent on the AI provider cooperating —
            // guarantees every visitor who shares their details gets
            // acknowledged, matching this module's "never depend solely on
            // AI" posture elsewhere (see CANNED_REPLIES).
            // Remember what Kevin learned (and keep any email or phone typed in, even if
            // the model forgot to say so) and tie it to the visitor's account.
            let lead: KevinLead | null = null
            if (persona === 'kevin') {
                const typed = detectContactUpdate(message)
                const merged = leadUpdate || typed ? { ...(typed ?? {}), ...(leadUpdate ?? {}) } : null
                lead = await recordLeadTurn({ sessionId, update: merged, signedIn, language: chosenLanguage?.name, search: search ? { query: search.query as Record<string, unknown>, total: search.total } : undefined })
                if (signedIn && lead) {
                    try {
                        syncProfileFromKevin(signedIn.id, {
                            category: lead.category,
                            location: lead.location,
                            minBudget: lead.minBudget,
                            maxBudget: lead.maxBudget,
                            invest: parseSignals(message, snapshot?.locations ?? []).invest,
                        })
                    } catch (err) {
                        console.error('[gene/chat] could not sync the agent profile:', err)
                    }
                }
            }
            if (justCapturedLead && !(persona === 'kevin' && usedAi)) {
                reply = `Thanks for sharing your contact details — a member of our team may follow up if you need anything specific. ${reply}`
            }

            // Only real-estate talk is kept. A turn is kept when it is about property (or the conversation already
            // is), when Kevin ran a search or learned something about the visitor's need, when contact details were
            // shared, or when they asked for a person. Anything else (small talk, the weather) is answered and forgotten.
            if (isAboutProperties(message) || search || leadUpdate || justCapturedLead || effectiveIntent === 'human_handoff_request') {
                conversation.propertyRelated = true
            }
            const keep = conversation.propertyRelated === true

            if (urgent) {
                // A real emergency gets only the safety message; urgent-but-ordinary keeps Kevin's answer to what they asked.
                reply = urgent.level === 'emergency' ? urgentReply('emergency', chosenLanguage?.name) : `${reply} ${urgentReply('urgent', chosenLanguage?.name)}`
                whatsapp = true
            }
            const escalated = isLowConfidence(effectiveIntent, usedAi, reply, replyOptions.voice === true || brain !== null)
            if (escalated && keep) {
                const reason = effectiveIntent === 'human_handoff_request' ? 'human_handoff_request' : 'low_confidence_reply'
                writeEscalation(sessionId, message, reason)
            }

            if (keep) {
                conversation.messages.push({ role: 'assistant', text: reply, intent: effectiveIntent, createdAt: nowIso() })
                saveConversation(conversation)
            }
            // One thread for a signed-in visitor across Kevin, the My Agent panel and WhatsApp.
            if (keep && persona === 'kevin' && signedIn) {
                try {
                    appendAgentMessage(signedIn.id, 'user', message)
                    appendAgentMessage(signedIn.id, 'assistant', reply)
                } catch (err) {
                    console.error('[gene/chat] could not mirror the conversation to the agent history:', err)
                }
            }

            res.json({
                sessionId,
                reply,
                intent: effectiveIntent,
                escalated,
                leadCaptured: justCapturedLead,
                action,
                results,
                // Offer the visitor the "message us on WhatsApp" button.
                whatsapp,
                // Set when the message looked urgent: the widget makes the button prominent and prefills "URGENT".
                urgent: urgent ? { level: urgent.level } : null,
                // Lets the widget stop asking once the welcome conversation is over.
                lead: lead ? { complete: isIntakeComplete(lead), declined: lead.declined === true, name: lead.name ?? null } : null,
            })
        } catch (err) {
            console.error('[gene/chat] POST /api/gene/chat failed:', err)
            res.status(500).json({ message: 'Failed to process chat message.' })
        }
    })

    // GET /api/admin/kevin-leads — platform owner only. Everyone who told Kevin who
    // they are and what they need (see kevin-leads.ts), newest first.
    app.get('/api/admin/kevin-leads', requireStrictAdmin, async (_req, res) => {
        try {
            res.json(await listLeads())
        } catch (err) {
            console.error('[gene/chat] GET /api/admin/kevin-leads failed:', err)
            res.status(500).json({ message: 'Failed to load leads.' })
        }
    })

    // GET /api/admin/kevin-demand — platform owner only. What visitors ask Kevin for (type, area,
    // bedrooms, budget), counted, with how many of them searched and found nothing: which
    // properties to add. Includes visitors who never left contact details.
    app.get('/api/admin/kevin-demand', requireStrictAdmin, async (_req, res) => {
        try {
            res.json(summarizeDemand(await listLeads({ includeAnonymous: true })))
        } catch (err) {
            console.error('[gene/chat] GET /api/admin/kevin-demand failed:', err)
            res.status(500).json({ message: 'Failed to load demand.' })
        }
    })

    // GET /api/admin/kevin-status — platform owner only. One call that says whether Kevin's parts are
    // really working: which AI keys are set and whether one actually answers right now, the voice
    // provider, the WhatsApp number visitors reach, and what he can see on the platform.
    app.get('/api/admin/kevin-status', requireStrictAdmin, async (_req, res) => {
        try {
            const started = Date.now()
            const ai = await getAiReply('Reply with the single word OK.', 'ping').catch(() => null)
            const snap = await getSnapshot().catch(() => null)
            const wa = (process.env.KEVIN_WHATSAPP_NUMBER || process.env.WHATSAPP_DISPLAY_NUMBER || getAdminWhatsappNumbers()[0] || '').replace(/\D/g, '')
            res.json({
                ai: {
                    keysSet: {
                        anthropic: !!process.env.ANTHROPIC_API_KEY,
                        openai: !!process.env.OPENAI_API_KEY,
                        gemini: !!process.env.GEMINI_API_KEY,
                    },
                    answeringNow: ai ? ai.provider : null,
                    note: ai
                        ? `Kevin's free-form answers come from ${ai.provider} (${Date.now() - started} ms).`
                        : 'No AI provider answered. Kevin still works from the listings (English only); check the key and the server log for "[gene/ai-provider]".',
                },
                voice: { provider: configuredProvider() },
                speech: speechStatus(),
                elevenlabs: await (async () => {
                    if (!elevenLabsConfigured()) return { configured: false, note: 'Set ELEVENLABS_API_KEY (a free account works) to give Kevin a human voice and better speech recognition.' }
                    const c = await elevenLabsCredits(true)
                    return c
                        ? { configured: true, plan: c.tier, creditsLeft: c.remaining, creditsTotal: c.limit, note: c.remaining < 1000 ? 'Almost out of credits this month: Kevin quietly uses the device voice and the browser recogniser until they renew.' : 'Speech recognition (Scribe) and his voice are running on ElevenLabs.' }
                        : { configured: true, note: 'The key is set but the account could not be read; check that it is valid.' }
                })(),
                whatsapp: { configured: !!wa, endsWith: wa ? wa.slice(-4) : null },
                platform: snap
                    ? { liveListings: snap.total, upcoming: snap.upcoming.filter((u) => u.kind !== 'taken').length, areas: snap.locations.length }
                    : null,
            })
        } catch (err) {
            console.error('[gene/chat] GET /api/admin/kevin-status failed:', err)
            res.status(500).json({ message: 'Failed to check Kevin.' })
        }
    })

    // GET /api/gene/kevin/whatsapp — public. The number visitors message when they want to talk to the
    // owner directly: KEVIN_WHATSAPP_NUMBER, else the business number the site's WhatsApp button
    // already uses, else the owner's first notification number.
    app.get('/api/gene/kevin/whatsapp', (_req, res) => {
        const digits = (process.env.KEVIN_WHATSAPP_NUMBER || process.env.WHATSAPP_DISPLAY_NUMBER || getAdminWhatsappNumbers()[0] || '').replace(/\D/g, '')
        res.set('Cache-Control', 'public, max-age=300').json({ number: digits || null })
    })

    // POST /api/gene/kevin/interest — public. { sessionId, propertyId }: the visitor is opening WhatsApp
    // about this home. Recorded on their lead and the team is told, once per home.
    const interestHits = new Map<string, number[]>()
    app.post('/api/gene/kevin/interest', async (req, res) => {
        try {
            const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim().slice(0, 80) : ''
            const propertyId = Number(req.body?.propertyId)
            if (!sessionId || !Number.isSafeInteger(propertyId) || propertyId <= 0) return res.status(400).json({ message: 'sessionId and propertyId are required.' })
            // Each tap can alert the owner, so keep one address from flooding them.
            const now = Date.now()
            const recent = (interestHits.get(req.ip || 'unknown') ?? []).filter((t) => now - t < 3_600_000)
            if (recent.length >= 8) return res.status(429).json({ message: 'Slow down a little.' })
            recent.push(now)
            interestHits.set(req.ip || 'unknown', recent)
            const property = await storage.getProperty(propertyId)
            if (!property || property.isAvailable === false) return res.status(404).json({ message: 'Property not found.' })
            const signedIn = req.isAuthenticated?.() ? (req.user as User) : null
            const ok = await recordInterest({ sessionId, signedIn, property: { id: property.id, title: property.title, location: property.location } })
            if (signedIn) {
                try {
                    recordAgentSignal(signedIn.id, property.id, 'inquired')
                } catch (err) {
                    console.error('[gene/chat] could not log the agent signal:', err)
                }
            }
            res.json({ ok })
        } catch (err) {
            console.error('[gene/chat] POST /api/gene/kevin/interest failed:', err)
            res.status(500).json({ message: 'Failed to record interest.' })
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
