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
    // What kind of place they are after, as numbers the owner can count: this is
    // the "which properties should we add" picture (see summarizeDemand).
    category?: string
    propertyType?: string
    bedrooms?: number
    minBudget?: number // shillings
    maxBudget?: number
    // The "shifting soon" category: people about to move are the most valuable
    // leads, so they are flagged on their own and the team is told separately.
    movingSoon?: boolean
    moveTiming?: string
    // Searches that Kevin ran for them, with whether anything matched.
    searches?: Array<{ query: Record<string, unknown>; total: number; at: string }>
    // Homes they said they are interested in (tapped WhatsApp about, etc.).
    interest?: Array<{ propertyId: number; title: string; at: string }>
    // Bookkeeping for the no-AI conversation (kevin-brain.ts).
    lastAsk?: string
    asks?: Record<string, number>
    language?: string
    declined?: boolean
    userId?: number
    accountEmail?: string
    consentNotice: string
    notified?: { contact?: boolean; need?: boolean; mover?: boolean }
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
    category?: string
    propertyType?: string
    bedrooms?: number
    minBudget?: number
    maxBudget?: number
    movingSoon?: boolean
    moveTiming?: string
    lastAsk?: string
    asks?: Record<string, number>
    /** Internal: a different kind of home was asked for, so the old bedrooms, budget and type no longer apply. */
    resetWants?: boolean
    declined?: boolean
}

// ---------------------------------------------------------------------------
// The token
// ---------------------------------------------------------------------------

const LEAD_TOKEN = /\[\[\s*LEAD\b([^\]]*)\]\]/gi
// Built from strings: the `u` flag as a literal trips this repo's tsc target.
const NOT_NAME_CHARS = new RegExp("[^\\p{L}\\p{M} '’.-]", 'gu')
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f]', 'g')
const CATEGORY_VALUES = ['rental_units', 'for_sale', 'furnished_houses', 'bank_sales']
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
    const category = clean(input.category, 20)
    if (category && CATEGORY_VALUES.includes(category)) update.category = category
    const propertyType = clean(input.propertyType, 30)?.toLowerCase()
    if (propertyType) update.propertyType = propertyType
    const bedrooms = Number(input.bedrooms)
    if (Number.isInteger(bedrooms) && bedrooms >= 1 && bedrooms <= 20) update.bedrooms = bedrooms
    for (const key of ['minBudget', 'maxBudget'] as const) {
        const n = Number(input[key])
        if (Number.isFinite(n) && n > 0 && n <= 1e12) update[key] = Math.round(n)
    }
    if (typeof input.movingSoon === 'boolean') update.movingSoon = input.movingSoon
    const moveTiming = clean(input.moveTiming, 60)
    if (moveTiming) update.moveTiming = moveTiming
    if (typeof input.lastAsk === 'string') update.lastAsk = clean(input.lastAsk, 12) ?? ''
    if (input.asks && typeof input.asks === 'object') {
        const asks: Record<string, number> = {}
        for (const [slot, n] of Object.entries(input.asks as Record<string, unknown>).slice(0, 6)) {
            if (/^[a-z]{2,10}$/.test(slot) && Number.isInteger(n) && (n as number) >= 0 && (n as number) < 20) asks[slot] = n as number
        }
        update.asks = asks
    }
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
    if (update.resetWants) {
        delete next.bedrooms
        delete next.minBudget
        delete next.maxBudget
        delete next.propertyType
        delete next.budget
    }
    for (const key of ['name', 'email', 'phone', 'need', 'location', 'budget', 'category', 'propertyType', 'bedrooms', 'minBudget', 'maxBudget', 'moveTiming'] as const) {
        if (update[key]) (next as unknown as Record<string, unknown>)[key] = update[key]
    }
    if (typeof update.movingSoon === 'boolean') next.movingSoon = update.movingSoon
    if (update.lastAsk !== undefined) next.lastAsk = update.lastAsk
    if (update.asks) next.asks = update.asks
    // A new price range replaces the old one rather than blending with it.
    if (update.maxBudget && !update.minBudget) delete next.minBudget
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
    if (lead?.bedrooms) known.push(`bedrooms: ${lead.bedrooms}`)
    if (lead?.propertyType) known.push(`type: ${lead.propertyType}`)
    if (lead?.movingSoon) known.push(`moving soon${lead.moveTiming ? ` (${lead.moveTiming})` : ''}`)
    const contact = lead?.email ?? lead?.phone ?? account?.email
    if (contact) known.push(`contact: ${contact}`)
    const missing: string[] = []
    if (!name) missing.push('their first name')
    if (!lead?.need) missing.push('what they are looking for (renting, buying, a BnB stay or listing a property), the area and a rough budget')
    if (lead?.movingSoon === undefined) missing.push('whether they are shifting soon, and when')
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

export async function listLeads(options: { includeAnonymous?: boolean } = {}): Promise<KevinLead[]> {
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
        .filter((l) => options.includeAnonymous || l.name || l.email || l.phone || l.need)
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

function notifyTeam(lead: KevinLead, reason: 'new' | 'update' | 'mover'): void {
    const rows: Array<[string, string | undefined]> = [
        ['Name', lead.name],
        ['Email', lead.email],
        ['Phone / WhatsApp', lead.phone],
        ['Looking for', lead.need],
        ['Area', lead.location],
        ['Budget', lead.budget ?? (lead.maxBudget ? `up to ${lead.maxBudget.toLocaleString('en-US')} UGX` : undefined)],
        ['Shifting soon', lead.movingSoon ? lead.moveTiming ?? 'yes' : undefined],
        ['Language', lead.language],
        ['RealEVR account', lead.accountEmail ? `${lead.accountEmail} (user ${lead.userId})` : 'not signed in'],
    ]
    const shown = rows.filter((r): r is [string, string] => !!r[1])
    const title =
        reason === 'mover'
            ? `Shifting soon${lead.moveTiming ? ` (${lead.moveTiming})` : ''}: ${lead.name ?? 'a visitor'}`
            : reason === 'new'
              ? `New lead from Kevin${lead.name ? `: ${lead.name}` : ''}`
              : `Kevin learned more about ${lead.name ?? 'a lead'}`
    notifyAdminsEverywhere({
        title,
        message: shown.map(([k, v]) => `${k}: ${v}`).join(' | '),
        html: `<p>A visitor told Kevin about themselves.</p><table cellpadding="6" style="border-collapse:collapse">${shown
            .map(([k, v]) => `<tr><td style="color:#666">${esc(k)}</td><td><strong>${esc(v)}</strong></td></tr>`)
            .join('')}</table><p>See every lead in the admin dashboard under Leads.</p>`,
        whatsappMessage: `${reason === 'mover' ? '🚚' : '🧭'} ${title}\n${shown.map(([k, v]) => `${k}: ${v}`).join('\n')}`,
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
    /** A search Kevin ran for them: kept so the owner can see what people look for and do not find. */
    search?: { query: Record<string, unknown>; total: number }
}): Promise<KevinLead | null> {
    try {
        const { sessionId, update, signedIn, language, search } = args
        let lead = await getLead(sessionId)
        const touched = !!update && Object.keys(update).length > 0
        if (!lead && !touched && !signedIn && !search) return null

        const now = nowIso()
        const hadNeed = !!lead?.need
        lead = lead ?? { id: dbId(sessionId), sessionId, consentNotice: CONSENT_NOTICE_VERSION, createdAt: now, updatedAt: now }
        if (language) lead.language = language

        // A signed-in visitor's account already says who they are and how to reach them.
        if (signedIn) {
            lead = mergeLead(lead, { name: lead.name ? undefined : signedIn.fullName, email: lead.email ? undefined : signedIn.email.toLowerCase() })
        }
        if (touched) lead = mergeLead(lead, update!)
        if (search) {
            const log = (lead.searches = lead.searches ?? [])
            const key = JSON.stringify(search.query)
            if (!log.some((x) => JSON.stringify(x.query) === key)) log.push({ query: search.query, total: search.total, at: nowIso() })
            if (log.length > 12) log.splice(0, log.length - 12)
        }

        await linkAccount(lead, signedIn)

        const notified = (lead.notified = lead.notified ?? {})
        let notify: 'new' | 'update' | 'mover' | null = null
        if (lead.movingSoon && isContactable(lead) && !notified.mover) {
            // People about to move get their own alert, not a line in the general lead stream.
            notified.mover = true
            notified.contact = true
            if (lead.need) notified.need = true
            notify = 'mover'
        } else if (isContactable(lead) && !notified.contact && (!signedIn || lead.need || touched)) {
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


// ---------------------------------------------------------------------------
// Homes they care about
// ---------------------------------------------------------------------------

/** They tapped through to WhatsApp (or otherwise showed interest) about a specific home: keep it, and tell the team. */
export async function recordInterest(args: { sessionId: string; signedIn: User | null; property: { id: number; title: string; location?: string } }): Promise<boolean> {
    try {
        const { sessionId, signedIn, property } = args
        let lead = await getLead(sessionId)
        const now = nowIso()
        lead = lead ?? { id: dbId(sessionId), sessionId, consentNotice: CONSENT_NOTICE_VERSION, createdAt: now, updatedAt: now }
        if (signedIn) lead = mergeLead(lead, { name: lead.name ? undefined : signedIn.fullName, email: lead.email ? undefined : signedIn.email.toLowerCase() })
        const list = (lead.interest = lead.interest ?? [])
        if (list.some((i) => i.propertyId === property.id)) return true // already told the team
        list.push({ propertyId: property.id, title: property.title.slice(0, 100), at: now })
        if (list.length > 10) list.splice(0, list.length - 10)
        lead.updatedAt = now
        await linkAccount(lead, signedIn)
        await saveLead(lead)
        const who = lead.name ?? signedIn?.fullName ?? 'A visitor'
        const where = property.location ? ` in ${property.location}` : ''
        notifyAdminsEverywhere({
            title: `Interested in ${property.title}`,
            message: `${who} is opening WhatsApp about ${property.title}${where}. ${lead.phone ?? lead.email ?? ''}`.trim(),
            whatsappMessage: `💬 ${who} is opening WhatsApp about ${property.title}${where}.${lead.phone ? ` Number: ${lead.phone}` : ''}`,
            link: '/admin/kevin-leads',
            data: { sessionId, propertyId: property.id },
        }).catch((err) => console.error('[kevin-leads] interest notification failed:', err))
        return true
    } catch (err) {
        console.error('[kevin-leads] could not record interest:', err)
        return false
    }
}

// ---------------------------------------------------------------------------
// What people are asking for: the "which properties should we add" picture
// ---------------------------------------------------------------------------

export interface DemandRow {
    category: string
    location: string
    bedrooms: number | null
    maxBudget: number | null
    people: number
    /** How many of those people's searches found nothing exact. */
    unmet: number
    lastAt: string
}

const budgetBand = (n?: number): number | null => {
    if (!n) return null
    const steps = [300_000, 500_000, 800_000, 1_200_000, 2_000_000, 3_500_000, 6_000_000, 10_000_000, 25_000_000, 60_000_000, 150_000_000, 500_000_000]
    return steps.find((step) => n <= step) ?? steps[steps.length - 1]
}

export function summarizeDemand(leads: KevinLead[]) {
    const rows = new Map<string, DemandRow>()
    for (const lead of leads) {
        if (!lead.category && !lead.location && !lead.bedrooms && !lead.maxBudget && !lead.propertyType) continue
        const row: DemandRow = {
            category: lead.category ?? 'any',
            location: lead.location ?? 'any area',
            bedrooms: lead.bedrooms ?? null,
            maxBudget: budgetBand(lead.maxBudget),
            people: 1,
            unmet: lead.searches?.some((x) => x.total === 0) ? 1 : 0,
            lastAt: lead.updatedAt,
        }
        const key = `${row.category}|${row.location.toLowerCase()}|${row.bedrooms}|${row.maxBudget}`
        const have = rows.get(key)
        if (have) {
            have.people++
            have.unmet += row.unmet
            if (row.lastAt > have.lastAt) have.lastAt = row.lastAt
        } else rows.set(key, row)
    }
    const count = (pick: (l: KevinLead) => string | undefined) => {
        const m = new Map<string, number>()
        for (const l of leads) {
            const v = pick(l)
            if (v) m.set(v, (m.get(v) ?? 0) + 1)
        }
        return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, people]) => ({ name, people }))
    }
    return {
        visitors: leads.length,
        movingSoon: leads.filter((l) => l.movingSoon).length,
        rows: Array.from(rows.values()).sort((a, b) => b.unmet - a.unmet || b.people - a.people || (a.lastAt < b.lastAt ? 1 : -1)).slice(0, 40),
        topLocations: count((l) => l.location),
        topCategories: count((l) => l.category),
    }
}
