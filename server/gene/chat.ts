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
import { getAdminWhatsappNumbers } from './admin-notify'
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
    'Your replies are read aloud, so write the way people speak: one to three short sentences, no markdown, no bullet lists,',
    'no emojis, and never spell out web addresses.',
    'Be honest: if you do not know an exact price or whether something is available, say so and offer a human from the team',
    'rather than guessing.',
    `If the visitor asks to speak to a person, an agent, a human or support (in any language), answer kindly and end your message with the exact token ${HUMAN_HANDOFF_TOKEN}.`,
]

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

    const { cards, total } = await searchListings(raw.query)
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
export function writeEscalation(sessionId: string, message: string, reason: string, customerPhone?: string): void {
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
            const knownLead = persona === 'kevin' ? await getLead(sessionId) : null
            const intaking = persona === 'kevin' && !isIntakeComplete(knownLead) && (body.intake === true || !!knownLead)
            const snapshot = persona === 'kevin' ? await getSnapshot().catch(() => null) : null

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
                knowledge: snapshot ? [knowledgeContext(snapshot), agentKnowledge].filter(Boolean).join('\n') : undefined,
            }
            const history = conversation.messages.slice(0, -1)
            const aiReply = await getReply(history, message, req.headers['accept-language'], replyOptions)
            // No AI provider (or it failed): Kevin answers from the real listings himself
            // (kevin-brain.ts) instead of repeating one canned line.
            let brain: BrainResult | null = null
            if (persona === 'kevin' && !aiReply) {
                try {
                    brain = await converse({
                        message,
                        lead: knownLead,
                        account: signedIn,
                        intaking,
                        shown: replyOptions.shown ?? [],
                        turn: conversation.messages.filter((m) => m.role === 'assistant').length,
                        hints: agentProfile ? profileWants(agentProfile) : undefined,
                        picks,
                    })
                } catch (err) {
                    console.error('[gene/chat] Kevin brain failed, using the canned reply:', err)
                }
            }
            const usedAi = aiReply !== null || brain !== null
            let reply = aiReply ?? brain?.reply ?? cannedReply(intent, persona)

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
                    leadUpdate = { ...picked, ...(need && !knownLead?.need ? { need } : {}), ...(leadUpdate ?? {}) }
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

            const escalated = isLowConfidence(effectiveIntent, usedAi, reply, replyOptions.voice === true || brain !== null)
            if (escalated) {
                const reason = effectiveIntent === 'human_handoff_request' ? 'human_handoff_request' : 'low_confidence_reply'
                writeEscalation(sessionId, message, reason)
            }

            conversation.messages.push({ role: 'assistant', text: reply, intent: effectiveIntent, createdAt: nowIso() })
            saveConversation(conversation)
            // One thread for a signed-in visitor across Kevin, the My Agent panel and WhatsApp.
            if (persona === 'kevin' && signedIn) {
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
