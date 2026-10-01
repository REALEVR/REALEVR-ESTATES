/**
 * Kevin's welcome conversation: who is this visitor and what do they need?
 *
 * Kevin asks, one friendly question at a time and in the visitor's language;
 * the AI hands back what it learned in a [[LEAD {...}]] token (the same
 * technique as the action and hand-off tokens: every provider here is called
 * for plain text). This module treats that token as untrusted input, keeps a
 * lead record per chat session, and makes sure the information is not lost:
 *
 *   1. Saved durably. DynamoDB (the app's real database, in the existing
 *      settings table under "kevin-lead:<session>"), with the JSON store as a
 *      local fallback so a database hiccup never loses a lead or breaks chat.
 *   2. Tied to the person's account. If they are signed in (including with
 *      Google, which is how Gmail users arrive), or the email they give
 *      matches an account, the lead is linked to that account; a signed-in
 *      user's empty phone number is filled from what they told Kevin.
 *   3. Sent to the team. The owner's inbox (Gmail), the in-app bell and
 *      WhatsApp are notified via notifyAdminsEverywhere, once when a way to
 *      reach the person is first known and once more if the need arrives later.
 *
 * Consent: Kevin says, when asking for contact details, that they go to the
 * RealEVR team and that the visitor may decline (see KEVIN_INTAKE_PROMPT in
 * chat.ts); a decline is recorded and he does not ask again. The panel also
 * shows a standing note with a link to the privacy policy. He never asks for
 * passwords, ID numbers or payment details.
 */
import type { User } from '@shared/schema'
import { storage } from '../storage'
import { DynamoDBUtils, TABLES } from '../dynamodb'
import { readCollection, writeCollection, nowIso } from './store'
import { notifyAdminsEverywhere } from './admin-notify'

const COLLECTION = 'kevin_leads'
const ID_PREFIX = 'kevin-lead:'
export const CONSENT_NOTICE_VERSION = 'kevin-intake-v1'

export interface KevinLead {
    id: string
    sessionId: string
    name?: string
    email?: string
    phone?: string
    need?: string
    location?: string
    budget?: string
    language?: string
    declined?: boolean
    userId?: number
    accountEmail?: string
    consentNotice: string
    notified?: { contact?: boolean; need?: boolean }
    createdAt: string
    updatedAt: string
}

export interface LeadUpdate {
    name?: string
    email?: string
    phone?: string
    need?: string
    location?: string
    budget?: string
    declined?: boolean
}

// ---------------------------------------------------------------------------
// The token
// ---------------------------------------------------------------------------

const LEAD_TOKEN = /\[\[\s*LEAD\b([^\]]*)\]\]/gi
// Built from strings: the `u` flag as a literal trips this repo's tsc target.
const NOT_NAME_CHARS = new RegExp("[^\\p{L}\\p{M} '’.-]", 'gu')
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f]', 'g')
const EMAIL = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[^\s@<>".]{2,}$/

function clean(value: unknown, max: number): string | undefined {
    if (typeof value !== 'string') return undefined
    const text = value.replace(CONTROL_CHARS, ' ').replace(/\[\[|\]\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
    return text || undefined
}

export function sanitizeLeadUpdate(raw: unknown): LeadUpdate {
    const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const update: LeadUpdate = {}
    const name = typeof input.name === 'string' ? input.name.replace(NOT_NAME_CHARS, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) : ''
    if (name) update.name = name
    const email = clean(input.email, 254)?.toLowerCase()
    if (email && EMAIL.test(email)) update.email = email
    const phoneRaw = clean(input.phone, 30)
    if (phoneRaw) {
        const digits = phoneRaw.replace(/\D/g, '')
        if (/^\+?[0-9 ()-]{7,22}$/.test(phoneRaw) && digits.length >= 7 && digits.length <= 15) {
            update.phone = (phoneRaw.startsWith('+') ? '+' : '') + digits
        }
    }
    const need = clean(input.need, 400)
    if (need) update.need = need
    const location = clean(input.location, 80)
    if (location) update.location = location
    const budget = clean(input.budget, 60)
    if (budget) update.budget = budget
    if (input.declined === true) update.declined = true
    return update
}

/**
 * A backstop for the AI: if the visitor typed an email address or a phone
 * number, keep it even when the model forgot to emit a token (or no model is
 * configured). Phones must start with + or 0 so a long budget figure is not
 * mistaken for one.
 */
export function detectContactUpdate(message: string): LeadUpdate | null {
    const email = message.match(/[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[^\s@<>".]{2,}/)?.[0]
    const phone = message.match(/(?:\+|\b0)\d[\d\s().-]{7,16}\d/)?.[0]
    const update = sanitizeLeadUpdate({ email, phone })
    return update.email || update.phone ? update : null
}

/** Find the first LEAD token in a reply, and strip every one from the text. */
export function extractLeadUpdate(reply: string): { text: string; update: LeadUpdate | null } {
    let update: LeadUpdate | null = null
    const text = reply
        .replace(LEAD_TOKEN, (_whole, body: string) => {
            if (update) return ''
            try {
                update = sanitizeLeadUpdate(JSON.parse(String(body).trim() || '{}'))
            } catch {
                update = null // malformed: ignore, never crash the chat
            }
            return ''
        })
        .replace(/\s{2,}/g, ' ')
        .trim()
    return { text, update }
}

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

export const isContactable = (lead: Pick<KevinLead, 'email' | 'phone'>): boolean => !!(lead.email || lead.phone)

/** Done asking: they told us how to reach them and what they need, or they said no. */
export const isIntakeComplete = (lead: KevinLead | null): boolean =>
    !!lead && (lead.declined === true || (isContactable(lead) && !!lead.need))

export function mergeLead(existing: KevinLead, update: LeadUpdate): KevinLead {
    const next: KevinLead = { ...existing }
    for (const key of ['name', 'email', 'phone', 'need', 'location', 'budget'] as const) {
        if (update[key]) next[key] = update[key]
    }
    // Giving contact details after earlier declining is a change of mind.
    if (update.declined && !isContactable(next)) next.declined = true
    if (isContactable(next)) next.declined = false
    next.updatedAt = nowIso()
    return next
}

/** What Kevin knows and still needs, in words for his instructions. */
export function describeLead(lead: KevinLead | null, account: User | null): string {
    const known: string[] = []
    const name = lead?.name ?? account?.fullName
    if (name) known.push(`name: ${name}`)
    if (lead?.need) known.push(`looking for: ${lead.need}`)
    if (lead?.location) known.push(`area: ${lead.location}`)
    if (lead?.budget) known.push(`budget: ${lead.budget}`)
    const contact = lead?.email ?? lead?.phone ?? account?.email
    if (contact) known.push(`contact: ${contact}`)
    const missing: string[] = []
    if (!name) missing.push('their first name')
    if (!lead?.need) missing.push('what they are looking for (renting, buying, a BnB stay or listing a property), the area and a rough budget')
    if (!contact) missing.push('an email address or WhatsApp number')
    const signedIn = account ? ` The visitor is signed in to their RealEVR account (${account.email}), so you already have a way to reach them.` : ''
    return `Known so far: ${known.length ? known.join('; ') : 'nothing yet'}.${signedIn} Still to ask, in this order: ${missing.length ? missing.join('; then ') : 'nothing, you have it all'}.`
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const dbId = (sessionId: string) => `${ID_PREFIX}${sessionId}`

export async function getLead(sessionId: string): Promise<KevinLead | null> {
    const local = readCollection<KevinLead>(COLLECTION).find((l) => l.sessionId === sessionId)
    if (local) return local
    try {
        const item = await DynamoDBUtils.getItem(TABLES.SETTINGS, { id: dbId(sessionId) })
        return item ? (item as unknown as KevinLead) : null
    } catch (err) {
        console.warn('[kevin-leads] database read failed, using local copy only:', err)
        return null
    }
}

export async function saveLead(lead: KevinLead): Promise<void> {
    // The local copy first: it cannot fail the way a network call can.
    const rows = readCollection<KevinLead>(COLLECTION)
    const i = rows.findIndex((l) => l.sessionId === lead.sessionId)
    if (i >= 0) rows[i] = lead
    else rows.push(lead)
    writeCollection(COLLECTION, rows)
    try {
        await DynamoDBUtils.putItem(TABLES.SETTINGS, { ...lead, id: dbId(lead.sessionId) })
    } catch (err) {
        console.error('[kevin-leads] could not save the lead to the database (kept locally):', err)
    }
}

export async function listLeads(): Promise<KevinLead[]> {
    const byId = new Map<string, KevinLead>()
    for (const lead of readCollection<KevinLead>(COLLECTION)) byId.set(lead.sessionId, lead)
    try {
        const items = await DynamoDBUtils.scanTable(TABLES.SETTINGS, 'begins_with(#id, :p)', { ':p': ID_PREFIX }, { '#id': 'id' })
        for (const item of items as unknown as KevinLead[]) {
            const have = byId.get(item.sessionId)
            if (!have || have.updatedAt < item.updatedAt) byId.set(item.sessionId, item)
        }
    } catch (err) {
        console.error('[kevin-leads] could not read leads from the database (showing local copy):', err)
    }
    return Array.from(byId.values())
        .filter((l) => l.name || l.email || l.phone || l.need)
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

// ---------------------------------------------------------------------------
// Account link and notification
// ---------------------------------------------------------------------------

/** Tie the lead to a RealEVR account: the signed-in user, else whoever owns the email given. */
async function linkAccount(lead: KevinLead, signedIn: User | null): Promise<User | null> {
    let account = signedIn
    if (!account && lead.email) {
        try {
            account = (await storage.getUserByEmail(lead.email)) ?? null
        } catch {
            account = null
        }
    }
    if (account) {
        lead.userId = account.id
        lead.accountEmail = account.email
    }
    // A signed-in user's profile is theirs to enrich; a lookup by email is not (anyone can type an email).
    if (signedIn && lead.phone && !signedIn.phoneNumber) {
        try {
            await storage.updateUser(signedIn.id, { phoneNumber: lead.phone })
        } catch (err) {
            console.warn('[kevin-leads] could not add the phone number to the account:', err)
        }
    }
    return account
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

function notifyTeam(lead: KevinLead, reason: 'new' | 'update'): void {
    const rows: Array<[string, string | undefined]> = [
        ['Name', lead.name],
        ['Email', lead.email],
        ['Phone / WhatsApp', lead.phone],
        ['Looking for', lead.need],
        ['Area', lead.location],
        ['Budget', lead.budget],
        ['Language', lead.language],
        ['RealEVR account', lead.accountEmail ? `${lead.accountEmail} (user ${lead.userId})` : 'not signed in'],
    ]
    const shown = rows.filter((r): r is [string, string] => !!r[1])
    const title = reason === 'new' ? `New lead from Kevin${lead.name ? `: ${lead.name}` : ''}` : `Kevin learned more about ${lead.name ?? 'a lead'}`
    notifyAdminsEverywhere({
        title,
        message: shown.map(([k, v]) => `${k}: ${v}`).join(' | '),
        html: `<p>A visitor told Kevin about themselves.</p><table cellpadding="6" style="border-collapse:collapse">${shown
            .map(([k, v]) => `<tr><td style="color:#666">${esc(k)}</td><td><strong>${esc(v)}</strong></td></tr>`)
            .join('')}</table><p>See every lead in the admin dashboard under Leads.</p>`,
        whatsappMessage: `🧭 ${title}\n${shown.map(([k, v]) => `${k}: ${v}`).join('\n')}`,
        link: '/admin/kevin-leads',
        data: { sessionId: lead.sessionId, leadId: lead.id },
    }).catch((err) => console.error('[kevin-leads] team notification failed:', err))
}

/**
 * Apply what Kevin learned (and what the account already tells us) to this
 * session's lead, save it, and notify the team at the right moments. Never
 * throws: the visitor's chat must not depend on bookkeeping.
 */
export async function recordLeadTurn(args: {
    sessionId: string
    update: LeadUpdate | null
    signedIn: User | null
    language?: string
}): Promise<KevinLead | null> {
    try {
        const { sessionId, update, signedIn, language } = args
        let lead = await getLead(sessionId)
        const touched = !!update && Object.keys(update).length > 0
        if (!lead && !touched && !signedIn) return null

        const now = nowIso()
        const hadNeed = !!lead?.need
        lead = lead ?? { id: dbId(sessionId), sessionId, consentNotice: CONSENT_NOTICE_VERSION, createdAt: now, updatedAt: now }
        if (language) lead.language = language

        // A signed-in visitor's account already says who they are and how to reach them.
        if (signedIn) {
            lead = mergeLead(lead, { name: lead.name ? undefined : signedIn.fullName, email: lead.email ? undefined : signedIn.email.toLowerCase() })
        }
        if (touched) lead = mergeLead(lead, update!)

        await linkAccount(lead, signedIn)

        const notified = (lead.notified = lead.notified ?? {})
        let notify: 'new' | 'update' | null = null
        if (isContactable(lead) && !notified.contact && (!signedIn || lead.need || touched)) {
            // A signed-in visitor is contactable from the start; wait until they have actually said something.
            notified.contact = true
            if (lead.need) notified.need = true
            notify = 'new'
        } else if (notified.contact && lead.need && !notified.need && !hadNeed) {
            notified.need = true
            notify = 'update'
        }

        await saveLead(lead)
        if (notify) notifyTeam(lead, notify)
        return lead
    } catch (err) {
        console.error('[kevin-leads] could not record the lead:', err)
        return null
    }
}
