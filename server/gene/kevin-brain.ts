/**
 * Kevin's own head: a conversation that works with no AI provider at all.
 *
 * When an AI key is configured Kevin's replies are written by the model. When
 * none is (or the provider is down) he used to fall back to one canned line and
 * repeat it for everything. This module replaces that: it understands the
 * things visitors actually say here (what they want to rent or buy, where, for
 * how much, when they are moving, whether they can WhatsApp the owner), looks
 * at the real listings, and answers from them - recommending what exists,
 * saying honestly what does not, and mentioning what is coming up.
 *
 * It is also the source of the facts the AI is given (`knowledgeContext`), so
 * both paths talk about the same platform, and of the demand signals stored on
 * the lead (what kind of home, where, which budget) so the owner can see which
 * properties to add. English only: with a provider configured Kevin answers in
 * any language, and this is the safety net underneath.
 *
 * Pure functions where possible (parseSignals, spokenMoney, buildSnapshot) so
 * they can be tested without a database.
 */
import type { User } from '@shared/schema'
import { storage } from '../storage'
import {
    GO_PAGES,
    searchListings,
    toCard,
    type KevinAction,
    type KevinCard,
    type SearchCategory,
    type SearchQuery,
} from './kevin-actions'
import { detectContactUpdate, type KevinLead, type LeadUpdate } from './kevin-leads'
import { AFRICAN_COUNTRIES, currencyForCountry, placeLabel, type Place } from '../../shared/africa'

// ---------------------------------------------------------------------------
// What is on the platform
// ---------------------------------------------------------------------------

export const CATEGORY_LABEL: Record<SearchCategory, { one: string; many: string; verb: string }> = {
    rental_units: { one: 'rental', many: 'rentals', verb: 'to rent' },
    for_sale: { one: 'home for sale', many: 'homes for sale', verb: 'to buy' },
    furnished_houses: { one: 'BnB', many: 'BnBs', verb: 'for a short stay' },
    bank_sales: { one: 'bank sale', many: 'bank sales', verb: 'at a bank auction' },
}

export interface Upcoming {
    id: number
    title: string
    location: string
    category: string
    /** 'soon': has a date it opens; 'auction': a bank sale with a future auction date; 'taken': marked unavailable right now. */
    kind: 'soon' | 'auction' | 'taken'
    when?: string
}

export interface PlatformSnapshot {
    total: number
    /** Per category: how many, and the price range in each currency listings are priced in. */
    byCategory: Partial<Record<SearchCategory, { count: number; ranges: Record<string, { min: number; max: number }> }>>
    /** Place names as they appear on listings, most common first. */
    locations: string[]
    featured: KevinCard[]
    newest: KevinCard[]
    upcoming: Upcoming[]
    /** The listing rows this was built from, so callers (personal picks) need not scan the database again. Never sent to a client. */
    raw: any[]
}

const CATEGORIES: SearchCategory[] = ['rental_units', 'for_sale', 'furnished_houses', 'bank_sales']

function parseDate(value: unknown): Date | null {
    if (typeof value !== 'string' || !value.trim()) return null
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
}

const niceDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

/** Reduce every listing to what Kevin may talk about. Exported for tests: takes plain rows. */
export function buildSnapshot(all: any[], now = new Date()): PlatformSnapshot {
    const live = all.filter((p) => p.isAvailable !== false)
    const byCategory: PlatformSnapshot['byCategory'] = {}
    const places = new Map<string, number>()
    for (const p of live) {
        const cat = p.category as SearchCategory
        if (CATEGORIES.includes(cat)) {
            const row = byCategory[cat] ?? { count: 0, ranges: {} }
            row.count++
            const cur = String(p.currency || 'UGX')
            const price = Number(p.price) || 0
            const range = row.ranges[cur] ?? { min: Infinity, max: 0 }
            range.min = Math.min(range.min, price)
            range.max = Math.max(range.max, price)
            row.ranges[cur] = range
            byCategory[cat] = row
        }
        for (const part of String(p.location ?? '').split(',')) {
            const name = part.trim()
            if (name.length >= 3 && name.length <= 40) places.set(name, (places.get(name) ?? 0) + 1)
        }
    }

    const upcoming: Upcoming[] = []
    for (const p of all) {
        const base = { id: Number(p.id), title: String(p.title ?? '').slice(0, 100), location: String(p.location ?? '').slice(0, 80), category: String(p.category ?? '') }
        const from = parseDate(p.availableFrom)
        if (p.isAvailable === false) {
            upcoming.push(from && from > now ? { ...base, kind: 'soon', when: niceDate(from) } : { ...base, kind: 'taken' })
        } else if (from && from > now) {
            upcoming.push({ ...base, kind: 'soon', when: niceDate(from) })
        }
        if (p.category === 'bank_sales' && p.isAvailable !== false) {
            const auction = parseDate(p.auctionDate) ?? parseDate(p.auctionStart)
            if (auction && auction > now) upcoming.push({ ...base, kind: 'auction', when: niceDate(auction) })
        }
    }
    upcoming.sort((a, b) => Number(a.kind === 'taken') - Number(b.kind === 'taken'))

    const featured = live.filter((p) => p.isFeatured).slice(0, 3).map(toCard)
    const newest = [...live].sort((a, b) => Number(b.id) - Number(a.id)).slice(0, 3).map(toCard)
    return {
        total: live.length,
        byCategory,
        locations: Array.from(places.entries()).sort((a, b) => b[1] - a[1]).map(([name]) => name),
        featured,
        newest,
        upcoming,
        raw: all,
    }
}

let cached: { at: number; snapshot: PlatformSnapshot } | null = null
export async function getSnapshot(): Promise<PlatformSnapshot> {
    if (cached && Date.now() - cached.at < 60_000) return cached.snapshot
    const snapshot = buildSnapshot(await storage.getAllProperties())
    cached = { at: Date.now(), snapshot }
    return snapshot
}

/** Everything Kevin may say about what the platform holds, for the AI's instructions. */
/** The price range of a category in the visitor's currency, else in whichever currency it has the most to show. */
function rangeFor(row: NonNullable<PlatformSnapshot['byCategory'][SearchCategory]>, currency: string): { currency: string; min: number; max: number } | null {
    const own = row.ranges[currency]
    if (own && own.max) return { currency, ...own }
    const other = Object.entries(row.ranges).find(([, r]) => r.max)
    return other ? { currency: other[0], ...other[1] } : null
}

export function knowledgeContext(snap: PlatformSnapshot, currency = 'UGX', place?: Place | null): string {
    if (!snap.total) return 'The platform has no live listings at the moment; say so honestly and offer to note what the visitor wants.'
    const cats = CATEGORIES.filter((c) => snap.byCategory[c]?.count)
        .map((c) => {
            const row = snap.byCategory[c]!
            const r = rangeFor(row, currency)
            const range = r ? (r.min === r.max ? `, ${spokenMoney(r.max, r.currency)}` : `, from ${spokenMoney(r.min, r.currency)} up to ${spokenMoney(r.max, r.currency)}`) : ''
            return `${row.count} ${row.count === 1 ? CATEGORY_LABEL[c].one : CATEGORY_LABEL[c].many}${range}`
        })
        .join('; ')
    const lines = [`Live on the platform right now: ${cats}.`]
    if (place) lines.push(`The visitor appears to be in ${placeLabel(place)}: prefer homes near them, and quote prices in ${currency} when you can.`)
    if (snap.locations.length) lines.push(`Areas with listings: ${snap.locations.slice(0, 12).join(', ')}.`)
    if (snap.featured.length) lines.push(`Featured: ${snap.featured.map((c) => `${c.title} in ${c.location}`).join('; ')}.`)
    if (snap.newest.length) lines.push(`Newest: ${snap.newest.map((c) => `${c.title} in ${c.location}`).join('; ')}.`)
    const soon = snap.upcoming.filter((u) => u.kind !== 'taken').slice(0, 4)
    if (soon.length) lines.push(`Coming up: ${soon.map((u) => `${u.title} in ${u.location} (${u.kind === 'auction' ? 'auction' : 'available'} ${u.when})`).join('; ')}.`)
    const taken = snap.upcoming.filter((u) => u.kind === 'taken').length
    if (taken) lines.push(`${taken} more are taken for now and may free up; the team can tell the visitor if one does.`)
    lines.push('Only recommend what is listed here or what a search returns; never invent a property, price or date.')
    return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Saying money and places the way people do
// ---------------------------------------------------------------------------

const trimZero = (n: number) => String(Math.round(n * 10) / 10).replace(/\.0$/, '')

/** "1.5 million shillings": reads aloud well, and reads fine on screen. */
export function spokenMoney(n: number, currency = 'UGX'): string {
    // Say "shillings" where people do; elsewhere the currency's code reads fine aloud ("rand", "naira" aside).
    const unit = ['UGX', 'KES', 'TZS', 'SOS'].includes(currency) ? 'shillings' : currency
    if (n >= 1e9) return `${trimZero(n / 1e9)} billion ${unit}`
    if (n >= 1e6) return `${trimZero(n / 1e6)} million ${unit}`
    if (n >= 1e3) return `${Math.round(n / 1e3)} thousand ${unit}`
    return `${Math.round(n)} ${unit}`
}

const AREAS = [
    'Kololo', 'Nakasero', 'Muyenga', 'Ntinda', 'Bugolobi', 'Munyonyo', 'Naguru', 'Bukoto', 'Kiwatule', 'Najjera', 'Kisaasi', 'Kyanja', 'Entebbe',
    'Mbuya', 'Makindye', 'Lubowa', 'Naalya', 'Kansanga', 'Kabalagala', 'Wandegeya', 'Nansana', 'Mukono', 'Jinja', 'Gulu', 'Mbarara', 'Kampala',
    'Namugongo', 'Kira', 'Buziga', 'Luzira', 'Rubaga', 'Mengo', 'Kawempe',
    // Every main city and country in Africa, so a visitor anywhere can name where they want to live.
    ...AFRICAN_COUNTRIES.flatMap((c) => [c.name, ...c.cities.map((city) => city.name)]),
]

function editDistance(a: string, b: string): number {
    const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
    for (let i = 1; i <= a.length; i++) {
        let diag = prev[0]
        prev[0] = i
        for (let j = 1; j <= b.length; j++) {
            const keep = prev[j]
            prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
            diag = keep
        }
    }
    return prev[b.length]
}

const titleCase = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase())

const LOCATION_STOP = new RegExp(
    '\\b(under|below|for|with|that|which|and|budget|around|today|now|please|price|priced|costing|ugx|shillings?|maybe|or|near|less|more|from|within|about|by|on|if|but|because|so|available|ok|okay|thanks|thank|really|just|to|rent|buy|let|be|is|are|was|get|have|find|where|when|soon|next|this)\\b.*$',
    'i',
)
const NOT_PLACES = new Set(['the', 'a', 'an', 'my', 'your', 'this', 'that', 'it', 'here', 'there', 'general', 'somewhere', 'anywhere', 'any', 'town', 'city', 'area', 'place', 'house', 'home', 'apartment', 'flat', 'rent', 'sale', 'buy', 'budget', 'bedroom', 'bedrooms', 'mind', 'fact', 'order', 'building', 'buildings', 'estate', 'compound', 'block', 'case', 'touch', 'love', 'need', 'time', 'future', 'month', 'week', 'year'])

/** The place the visitor named, matched to a known area when it is close (speech is rarely spelled right). */
export function findPlace(text: string, known: string[]): { name: string; known: boolean } | null {
    const lower = text.toLowerCase()
    const pool = Array.from(new Set([...known, ...AREAS]))
    const exact = pool
        .filter((k) => new RegExp(`(^|[^a-z])${k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(lower))
        .sort((a, b) => b.length - a.length)[0]
    if (exact) return { name: exact, known: true }

    const m = text.match(/\b(?:in|at|around|near|towards|close to|within)\s+([A-Za-z][A-Za-z' -]{2,32})/i)
    if (!m) return null
    const raw = m[1].replace(LOCATION_STOP, '').replace(/[-' ]+$/g, '').trim()
    const words = raw.replace(/^(?:a|an|the|my|this)\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 3)
    if (!words.length || words.every((w) => NOT_PLACES.has(w.toLowerCase()))) return null
    const guess = words.join(' ')
    if (NOT_PLACES.has(guess.toLowerCase())) return null
    if (guess.length >= 5) {
        const near = pool.find((k) => k.length >= 5 && editDistance(k.toLowerCase(), guess.toLowerCase()) <= (guess.length >= 8 ? 2 : 1))
        if (near) return { name: near, known: true }
    }
    return { name: titleCase(guess), known: false }
}

// ---------------------------------------------------------------------------
// Understanding the message
// ---------------------------------------------------------------------------

export type Slot = 'name' | 'need' | 'budget' | 'timing' | 'contact'

export interface Signals {
    category?: SearchCategory
    propertyType?: string
    bedrooms?: number
    minPrice?: number
    maxPrice?: number
    usdBudget?: boolean
    location?: string
    locationKnown?: boolean
    movingSoon?: boolean
    notMoving?: boolean
    moveTiming?: string
    name?: string
    declined?: boolean
    wantsWhatsapp?: boolean
    wantsOverview?: boolean
    wantsUpcoming?: boolean
    wantsSearch?: boolean
    wantsHuman?: boolean
    /** "recommend something for me" / "my picks": answered from the saved profile when there is one. */
    wantsPicks?: boolean
    invest?: boolean
    ordinal?: number
    page?: keyof typeof GO_PAGES
    greeting?: boolean
    thanks?: boolean
    bye?: boolean
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }

export function parseBedrooms(text: string): number | undefined {
    const m = text.match(/\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s*[- ]?\s*(?:bed(?:room)?s?|br|brm|bhk)\b/i)
    if (m) {
        const v = NUMBER_WORDS[m[1].toLowerCase()] ?? Number(m[1])
        if (v >= 1 && v <= 20) return v
    }
    if (/\b(studio|bedsit(?:ter)?|single room)\b/i.test(text)) return 1
    return undefined
}

const SUFFIX: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, mil: 1e6, million: 1e6, millions: 1e6, b: 1e9, bn: 1e9, billion: 1e9 }

/** Budget in shillings from "under 3 million", "500k", "between 1m and 2m", "1,500,000". */
export function parseBudget(text: string, plainNumber = false): { min?: number; max?: number; usd?: boolean } {
    const usd = /\$|\busd\b|\bdollars?\b/i.test(text)
    const cleaned = text
        .replace(/(?:\+|\b0)\d[\d\s().-]{7,16}\d/g, ' ') // phone numbers
        .replace(/\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s*[- ]?\s*(?:bed(?:room)?s?|br|brm|bhk)\b/gi, ' ')
        .replace(/\b\d+\s*(?:days?|weeks?|months?|years?|am|pm|st|nd|rd|th)\b/gi, ' ')
    const amounts: number[] = []
    const re = /(\d+(?:[.,]\d+)*)\s*(million|millions|mil|m|billion|bn|b|thousand|k)?(?![a-z0-9])/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(cleaned))) {
        const suffix = m[2] ? SUFFIX[m[2].toLowerCase()] : undefined
        const raw = Number(m[1].replace(/,/g, ''))
        if (!Number.isFinite(raw) || raw <= 0) continue
        let value = raw
        if (suffix) value = raw * suffix
        else if (raw >= 10000) value = raw
        else if (plainNumber) value = raw <= 50 ? raw * 1e6 : raw * 1e3
        else continue
        if (!usd && value < 20000) continue // a rent below this is not a shilling amount
        amounts.push(Math.round(value))
    }
    if (!amounts.length) return usd ? { usd } : {}
    const lower = cleaned.toLowerCase()
    if (amounts.length >= 2 && /(between|from|to|-|–|and)/.test(lower)) {
        const [a, b] = [amounts[0], amounts[1]].sort((x, y) => x - y)
        return usd ? { usd } : { min: a, max: b }
    }
    if (usd) return { usd }
    if (/(above|over|from|at least|minimum|starting|more than|upwards)/.test(lower)) return { min: amounts[0] }
    return { max: amounts[0] }
}

function parseCategory(t: string): SearchCategory | undefined {
    if (/\b(bank ?sales?|auctions?|foreclos\w+|repossess\w+)\b/i.test(t)) return 'bank_sales'
    if (/\b(bnb|airbnb|short ?stay|holiday|per night|a night|vacation|furnished)\b/i.test(t)) return 'furnished_houses'
    if (/\b(buy|buying|purchase|purchasing|for sale|to own)\b/i.test(t)) return 'for_sale'
    if (/\b(rent|renting|rental|rentals|lease|tenant|to let)\b/i.test(t)) return 'rental_units'
    // "I may invest too" next to "rent" is still a rental; investing alone points at buying.
    if (/\binvest\w*\b/i.test(t)) return 'for_sale'
    return undefined
}

const TYPE_WORDS: Array<[string, RegExp]> = [
    ['apartment', /\b(apartments?|flats?|condos?)\b/i],
    ['house', /\b(houses?|homes?|bungalows?|villas?|mansions?|maisonettes?|townhouses?)\b/i],
    ['land', /\b(land|plots?)\b/i],
    ['commercial', /\b(offices?|shops?|commercial|warehouse|store)\b/i],
    ['hostel', /\bhostels?\b/i],
]

const TIMING =
    /\b(today|tonight|tomorrow|asap|as soon as possible|immediately|right away|this (?:week|month|weekend)|next (?:week|month|year)|end of (?:the )?(?:month|year)|in (?:\d+|a|one|two|three|four|five|six|a few|a couple of) (?:days?|weeks?|months?)|(?:january|february|march|april|may|june|july|august|september|october|november|december)(?: \d{1,2})?|soon|very soon|shortly|within (?:\d+|a|one|two|three) (?:days?|weeks?|months?))\b/i

const MOVING = /\b(shifting|moving|relocat\w+|move in|move into|moving in|need to move|have to move|looking to move|planning to move|transfer(?:red|ring)?)\b/i
const NOT_MOVING = /\b(just (?:looking|browsing|checking)|no rush|not sure when|not yet|later|someday|no plans|just curious)\b/i

const STOP_NAME_WORDS = new Set([
    'looking', 'searching', 'interested', 'need', 'want', 'wanting', 'rent', 'buy', 'house', 'home', 'apartment', 'flat', 'land', 'plot', 'show', 'find', 'hello', 'hi', 'hey', 'yes', 'no', 'ok', 'okay', 'sure', 'thanks', 'thank', 'please', 'help', 'what', 'how', 'when', 'where', 'who', 'why', 'can', 'could', 'do', 'does', 'is', 'are', 'the', 'a', 'an', 'my', 'me', 'you', 'kevin', 'bnb', 'moving', 'shifting', 'whatsapp', 'price', 'prices', 'available', 'budget', 'good', 'morning', 'evening', 'afternoon', 'fine', 'well', 'great', 'nothing', 'nope', 'skip', 'not', 'now', 'later',
])

const ORDINALS: Array<[RegExp, number]> = [
    [/\b(first|1st|number one|top)\b/i, 1],
    [/\b(second|2nd|number two)\b/i, 2],
    [/\b(third|3rd|number three)\b/i, 3],
    [/\b(last|final)\b/i, -1],
]

/** A first name (or two) from "John", "my name is John Okello", "call me Sarah"; null when it isn't one. */
export function parseName(text: string, expectingName: boolean): string | undefined {
    const explicit = text.match(/\b(?:my name is|my name's|i am|i'm|im|this is|call me|it'?s|name is|names)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’.-]*(?:\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’.-]*){0,2})/i)
    const candidate = explicit ? explicit[1] : expectingName ? text.replace(/[.!?,]+$/g, '') : ''
    if (!candidate) return undefined
    const words = candidate.trim().split(/\s+/)
    if (words.length === 0 || words.length > 3) return undefined
    if (words.some((w) => !/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’.-]*$/.test(w) || STOP_NAME_WORDS.has(w.toLowerCase()) || w.length > 24)) {
        // "I'm looking for..." / "it's urgent": not a name.
        const trimmed = words.filter((w) => !STOP_NAME_WORDS.has(w.toLowerCase()))
        if (explicit || trimmed.length !== words.length || !trimmed.length) return undefined
    }
    if (!explicit && !expectingName) return undefined
    return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export function parseSignals(message: string, knownPlaces: string[], expecting?: Slot, needsName = false): Signals {
    const t = message.trim()
    const s: Signals = {}
    const lower = t.toLowerCase()

    s.category = parseCategory(t)
    for (const [type, re] of TYPE_WORDS) {
        if (re.test(t)) {
            s.propertyType = type
            break
        }
    }
    s.bedrooms = parseBedrooms(t)
    const budget = parseBudget(t, expecting === 'budget')
    if (budget.min) s.minPrice = budget.min
    if (budget.max) s.maxPrice = budget.max
    if (budget.usd) s.usdBudget = true
    const place = findPlace(t, knownPlaces)
    if (place) {
        s.location = place.name
        s.locationKnown = place.known
    }

    if (MOVING.test(t)) {
        s.movingSoon = true
        const when = t.match(TIMING)?.[0]
        if (when) s.moveTiming = when
    } else if (expecting === 'timing') {
        const when = t.match(TIMING)?.[0]
        if (NOT_MOVING.test(t)) s.notMoving = true
        else if (when) {
            s.movingSoon = true
            s.moveTiming = when
        }
    }

    if (/\b(whats ?app|text you|text me|message you|chat with (?:you|the owner|someone)|reach (?:you|the owner)|call you|contact (?:you|the owner)|speak to the owner|talk to the owner|the owner)\b/i.test(t)) s.wantsWhatsapp = true
    if (/\b(for me|my (?:picks|matches|recommendations|agent)|suits? me|fits? me|good for me|best for me|surprise me|recommend (?:me )?(?:something|anything)|what would you (?:pick|recommend|suggest))\b/i.test(t)) s.wantsPicks = true
    if (/\b(invest\w*|buy[- ]to[- ]let|returns?|roi|yield|rental income|capital gains?)\b/i.test(t)) s.invest = true
    if (/\b(human|real person|an? agent|support|someone from|speak to (?:a|someone)|talk to (?:a|someone))\b/i.test(t) && !s.wantsWhatsapp) s.wantsHuman = true
    if (/\b(coming soon|coming up|come up|upcoming|available later|later on|will be available|be available|next month|going to be|new listings? soon|in the future|after)\b/i.test(t) && /\b(available|coming|upcoming|soon|later|listing|propert|house|home)\b/i.test(t) && !MOVING.test(t)) s.wantsUpcoming = true
    if (/\b(what (?:do you|have you|properties|homes|houses|listings|else)|everything|all (?:the )?(?:properties|homes|listings|houses)|what'?s (?:available|on|there)|what is (?:available|on there)|what can you|what are you offering|categories|types of)\b/i.test(t)) s.wantsOverview = true
    if (/\b(show|find|search|looking for|look for|looking|need|want|wanting|i'?d like|get me|any|available|do you have|recommend|suggest|options|apartments?|houses?|flats?|homes?)\b/i.test(t)) s.wantsSearch = true

    for (const [re, n] of ORDINALS) {
        if (re.test(t) && /\b(one|it|that|this|property|home|house|place|listing|open|view|see|show|tour)\b/i.test(t)) {
            s.ordinal = n
            break
        }
    }

    if (/\b(pay (?:my )?rent|rent ?rail|pay for rent)\b/i.test(t)) s.page = 'payrent'
    else if (/\b(list (?:my|a|our) (?:property|house|home|apartment)|sell my|put my (?:property|house) on|i am a landlord|i'?m a landlord|i'?m an agent|become an agent)\b/i.test(t)) s.page = 'list'
    else if (/\b(recommend (?:a |my |the )?(?:building|place|property|apartment|estate)|i live in (?:a |an |the )?(?:building|apartment|estate)|not on (?:your|the) (?:site|website|platform)|earn (?:points|money)|points|reward)\b/i.test(t)) s.page = 'recommend'
    else if (/\b(how (?:does|do) (?:it|this|realevr|the site|it all) work|how it works)\b/i.test(t)) s.page = 'howitworks'
    else if (/\b(safe|safety|scam|fraud|trust|verified)\b/i.test(t)) s.page = 'safety'
    else if (/\b(contact (?:us|page)|your (?:office|address|email))\b/i.test(t)) s.page = 'contact'
    else if (/\b(book(?:ing)? (?:a )?(?:viewing|visit|tour)|viewing|schedule a visit)\b/i.test(t)) s.page = 'properties'

    if (/^(hi|hello|hey|good (?:morning|afternoon|evening)|hallo|hullo|howdy|greetings|yo)\b[\s,!.?]*(kevin)?[\s!.?]*$/i.test(t)) s.greeting = true
    if (/^(thanks|thank you|thank u|cheers|asante|much appreciated|ok thanks|okay thanks)[\s!.]*$/i.test(t)) s.thanks = true
    if (/^(bye|goodbye|see you|that'?s all|that'?s it|nothing else|no thanks|i'?m done)[\s!.]*$/i.test(t)) s.bye = true

    if (expecting === 'name' || expecting === 'contact') {
        if (/^(no|nope|not now|no thanks|no thank you|prefer not|rather not|skip|maybe later|i'?d rather not|i don'?t want to)[\s,.!]*(thanks|thank you)?[\s.!]*$/i.test(t) || /\b(prefer not to|rather not|don'?t want to (?:share|give)|not comfortable)\b/i.test(t)) s.declined = true
    }

    const searchy = !!(s.category || s.propertyType || s.bedrooms || s.minPrice || s.maxPrice || s.location)
    if (!searchy || expecting === 'name') {
        const name = parseName(t, expecting === 'name' && !searchy)
        if (name) s.name = name
    }
    // A bare "John" answering the greeting, before any question was recorded.
    if (!s.name && (needsName || !expecting) && t.split(/\s+/).length <= 2 && !searchy) {
        const bare = parseName(t, true)
        if (bare && !s.greeting && !s.thanks && !s.bye && !/[?]/.test(t)) s.name = bare
    }

    void lower
    return s
}

// ---------------------------------------------------------------------------
// Turning signals into what is remembered
// ---------------------------------------------------------------------------

/** The part of the signals that describes what they want, as lead fields (the owner's demand picture). */
export function wantsFrom(s: Signals): LeadUpdate {
    const u: LeadUpdate = {}
    if (s.category) u.category = s.category
    if (s.propertyType) u.propertyType = s.propertyType
    if (s.bedrooms) u.bedrooms = s.bedrooms
    if (s.minPrice) u.minBudget = s.minPrice
    if (s.maxPrice) u.maxBudget = s.maxPrice
    if (s.location) u.location = s.location
    if (s.movingSoon) u.movingSoon = true
    if (s.notMoving) u.movingSoon = false
    if (s.moveTiming) u.moveTiming = s.moveTiming
    if (s.name) u.name = s.name
    if (s.declined) u.declined = true
    return u
}

/** "a 2-bedroom apartment to rent in Kiwatule, up to 1.5 million shillings" from the remembered wants. */
export function describeNeed(w: {
    category?: string
    propertyType?: string
    bedrooms?: number
    location?: string
    minBudget?: number
    maxBudget?: number
}, currency = 'UGX'): string | undefined {
    if (!w.category && !w.propertyType && !w.bedrooms && !w.location && !w.maxBudget && !w.minBudget) return undefined
    const what = [w.bedrooms ? `${w.bedrooms}-bedroom` : '', w.propertyType ?? 'home'].filter(Boolean).join(' ')
    const verb = w.category ? CATEGORY_LABEL[w.category as SearchCategory]?.verb : ''
    const parts = [`${what}${verb ? ` ${verb}` : ''}`]
    if (w.location) parts.push(`in ${w.location}`)
    if (w.minBudget && w.maxBudget) parts.push(`${spokenMoney(w.minBudget, currency)} to ${spokenMoney(w.maxBudget, currency)}`)
    else if (w.maxBudget) parts.push(`up to ${spokenMoney(w.maxBudget, currency)}`)
    else if (w.minBudget) parts.push(`from ${spokenMoney(w.minBudget, currency)}`)
    return parts.join(', ').slice(0, 300)
}

// ---------------------------------------------------------------------------
// The conversation
// ---------------------------------------------------------------------------

export interface BrainInput {
    message: string
    lead: KevinLead | null
    account: User | null
    /** The welcome questions (name, contact) are still wanted. */
    intaking: boolean
    shown: { id: number; title: string }[]
    /** How many replies Kevin has already given in this chat, to vary wording. */
    turn: number
    /** For a signed-in visitor: their saved preferences (from "My Agent"), so he does not ask what is known. */
    hints?: { category?: string; location?: string; minBudget?: number; maxBudget?: number }
    /** Where the visitor is (their country and city), so prices are in their currency and nearby homes come first. */
    place?: Place | null
    /** For a signed-in visitor: the homes that best fit their saved profile, with why. */
    picks?: Array<{ card: KevinCard; reason?: string }>
}

export interface BrainResult {
    reply: string
    update: LeadUpdate
    action: KevinAction | null
    results: KevinCard[]
    /** Offer the visitor the WhatsApp button now. */
    whatsapp: boolean
    handoff: boolean
    /** A search that found nothing exact, kept so the owner sees what to add. */
    search?: { query: SearchQuery; total: number }
}

const pick = <T>(items: T[], turn: number): T => items[Math.abs(turn) % items.length]

const priceOf = (c: KevinCard) => spokenMoney(c.price, c.currency)
const perMonth = (c: KevinCard) => (c.category === 'rental_units' ? ' a month' : c.category === 'furnished_houses' ? ' a night' : '')
const describeCard = (c: KevinCard) => `${c.title} in ${c.location} at ${priceOf(c)}${perMonth(c)}`

function nextQuestion(lead: Partial<KevinLead>, account: User | null, intaking: boolean, asked: Record<string, number>, turn: number): { text: string; slot: Slot } | null {
    const can = (slot: Slot) => (asked[slot] ?? 0) < 2
    const hasNeed = !!(lead.category || lead.location || lead.propertyType || lead.need)
    if (!hasNeed && can('need')) {
        return { slot: 'need', text: pick(['Are you looking to rent, buy or book a BnB, and in which area?', 'What are you after: somewhere to rent, a home to buy, or a BnB stay, and where?'], turn) }
    }
    if (hasNeed && !lead.maxBudget && !lead.minBudget && !lead.budget && can('budget')) {
        return { slot: 'budget', text: pick(['What budget should I work with?', 'Roughly what is your budget?'], turn) }
    }
    if (hasNeed && lead.movingSoon === undefined && can('timing')) {
        return { slot: 'timing', text: pick(['When are you hoping to move in?', 'Are you shifting soon, and if so when?'], turn) }
    }
    if (intaking && !lead.declined) {
        if (!lead.name && !account?.fullName && can('name')) return { slot: 'name', text: 'May I have your first name?' }
        const reachable = lead.email || lead.phone || account?.email
        if (!reachable && can('contact')) {
            return {
                slot: 'contact',
                text: 'What is the best WhatsApp number or email for the team to reach you on? I will share it with the RealEVR team so they can help, and you are free to say no.',
            }
        }
    }
    return null
}

/** Run the search, loosening one thing at a time until something real can be recommended. */
export async function searchWithRelaxing(query: SearchQuery, near?: Place | null): Promise<{ cards: KevinCard[]; total: number; used: SearchQuery; dropped: string | null }> {
    // Change the area before the kind of home: someone who wants a 2-bedroom apartment is better
    // served by one in the next suburb than by a house in the one they named.
    const steps: Array<[string, (q: SearchQuery) => SearchQuery]> = [
        ['budget', (q) => ({ ...q, maxPrice: q.maxPrice ? Math.round(q.maxPrice * 1.3) : undefined, minPrice: q.minPrice ? Math.round(q.minPrice * 0.7) : undefined })],
        ['area', (q) => ({ ...q, location: undefined })],
        ['type', (q) => ({ ...q, propertyType: undefined })],
        ['bedrooms', (q) => ({ ...q, bedrooms: q.bedrooms && q.bedrooms > 1 ? q.bedrooms - 1 : undefined })],
        ['category', (q) => ({ ...q, category: undefined })],
    ]
    let current = { ...query }
    let found = await searchListings(current, 3, near)
    if (found.total) return { ...found, used: current, dropped: null }
    for (const [name, loosen] of steps) {
        const next = loosen(current)
        if (JSON.stringify(next) === JSON.stringify(current)) continue
        current = next
        found = await searchListings(current, 3, near)
        if (found.total) return { ...found, used: current, dropped: name }
    }
    return { cards: [], total: 0, used: current, dropped: null }
}

const queryFrom = (u: LeadUpdate & { propertyType?: string }): SearchQuery => {
    const q: SearchQuery = {}
    if (u.location) q.location = u.location
    if (u.category) q.category = u.category as SearchCategory
    if (u.bedrooms) q.bedrooms = u.bedrooms
    if (u.maxBudget) q.maxPrice = u.maxBudget
    if (u.minBudget) q.minPrice = u.minBudget
    if (u.propertyType) q.propertyType = u.propertyType
    return q
}

function overview(snap: PlatformSnapshot, currency = 'UGX'): string {
    const parts = CATEGORIES.filter((c) => snap.byCategory[c]?.count).map((c) => {
        const row = snap.byCategory[c]!
        const r = rangeFor(row, currency)
        const from = r?.min ? `, from ${spokenMoney(r.min, r.currency)}` : ''
        return `${row.count} ${row.count === 1 ? CATEGORY_LABEL[c].one : CATEGORY_LABEL[c].many}${from}`
    })
    if (!parts.length) return 'I do not have any live listings right now, but tell me what you are looking for and I will make sure the team hears it.'
    const places = snap.locations.slice(0, 4).join(', ')
    return `Right now I have ${parts.join(', ')}${places ? `, in places like ${places}` : ''}.`
}

function upcomingNote(snap: PlatformSnapshot, want?: { category?: string; location?: string }, any = false): string | null {
    const soon = snap.upcoming.filter((u) => u.kind !== 'taken')
    const place = want?.location?.toLowerCase()
    const relevant = soon.filter((u) => (!want?.category || u.category === want.category) && (!place || u.location.toLowerCase().includes(place)))
    const list = (relevant.length ? relevant : any || !want ? soon : []).slice(0, 2)
    if (!list.length) return null
    return list.map((u) => `${u.title} in ${u.location} is ${u.kind === 'auction' ? 'going to auction' : 'available'} on ${u.when}`).join(', and ')
}

export async function converse(input: BrainInput): Promise<BrainResult> {
    const { message, lead, account, intaking, shown, turn, hints, picks, place } = input
    const snap = await getSnapshot()
    const money = place ? currencyForCountry(place.country) : 'UGX'
    const expecting = (lead?.lastAsk as Slot | undefined) ?? undefined
    const needsName = !lead?.name && !account?.fullName
    const sig = parseSignals(message, snap.locations, expecting, needsName)
    const contact = detectContactUpdate(message)

    const update: LeadUpdate = { ...wantsFrom(sig) }
    if (contact?.email) update.email = contact.email
    if (contact?.phone) update.phone = contact.phone
    if (sig.name && needsName) update.name = sig.name
    else delete update.name

    // A different kind of home starts a fresh search: last time's bedrooms and budget don't carry over.
    const switched = !!(sig.category && lead?.category && sig.category !== lead.category)
    if (switched) update.resetWants = true
    const carry = <T,>(fresh: T | undefined, old: T | undefined) => (fresh !== undefined ? fresh : switched ? undefined : old)

    // What they want, as it stands after this message.
    const wants = {
        category: update.category ?? lead?.category,
        propertyType: carry(update.propertyType, lead?.propertyType),
        bedrooms: carry(update.bedrooms, lead?.bedrooms),
        location: update.location ?? lead?.location,
        minBudget: carry(update.minBudget, lead?.minBudget),
        maxBudget: carry(update.maxBudget, lead?.maxBudget),
    }
    const hasCriteria = !!(sig.category || sig.propertyType || sig.bedrooms || sig.minPrice || sig.maxPrice || sig.location)
    const need = describeNeed(wants, money)
    if (hasCriteria && need) update.need = need
    if (place && !lead?.country) update.country = place.country
    if (sig.usdBudget && !update.budget) update.budget = message.match(/(?:\$|usd)\s?[\d,]+(?:\.\d+)?|[\d,]+(?:\.\d+)?\s?(?:usd|dollars?)/i)?.[0]?.trim()

    const merged: Partial<KevinLead> = { ...lead, ...update, ...wants }
    const asked = { ...(lead?.asks ?? {}) }
    const result: BrainResult = { reply: '', update, action: null, results: [], whatsapp: false, handoff: false }
    const lines: string[] = []
    const first = (account?.fullName ?? merged.name ?? '').split(' ')[0]

    // ---- the main answer ----
    if (sig.wantsHuman) {
        result.handoff = true
        lines.push('Of course. I have passed your request to the team, and someone will get back to you. You can also message us directly on WhatsApp.')
        result.whatsapp = true
    } else if (sig.wantsWhatsapp) {
        result.whatsapp = true
        lines.push(shown.length ? `Of course. Tap the WhatsApp button and you will be chatting with us directly about ${shown[0].title}.` : 'Of course. Tap the WhatsApp button and you will be chatting with us directly.')
    } else if (sig.movingSoon || (expecting === 'timing' && (sig.moveTiming || sig.notMoving))) {
        if (sig.notMoving) lines.push('No problem, there is no rush. I will keep an eye out for you.')
        else {
            lines.push(
                `Thank you${first ? `, ${first}` : ''}. I have marked you as moving soon${update.moveTiming ? ` (${update.moveTiming})` : ''}, so the team gives you priority.`,
            )
        }
    } else if (sig.wantsPicks && picks?.length && !hasCriteria) {
        const best = picks[0]
        result.results = picks.map((p) => p.card)
        result.action = { type: 'results', query: {}, total: picks.length }
        lines.push(
            `${first ? `${first}, based` : 'Based'} on what you have told me, I would start with ${describeCard(best.card)}.${best.reason ? ` ${best.reason.replace(/\.$/, '')}.` : ''}`,
        )
    } else if (sig.ordinal && shown.length) {
        const index = sig.ordinal === -1 ? shown.length - 1 : sig.ordinal - 1
        const target = shown[index]
        if (target) {
            result.action = { type: 'open', propertyId: target.id }
            lines.push(`Opening ${target.title} for you.`)
        } else lines.push(`I only have ${shown.length} on your screen at the moment.`)
    } else if (sig.wantsUpcoming && !hasCriteria) {
        const note = upcomingNote(snap)
        if (note) lines.push(`Coming up: ${note}.`)
        else lines.push('Nothing is scheduled to open soon yet, but tell me what you are looking for and I will make sure the team knows to add it.')
        const taken = snap.upcoming.filter((u) => u.kind === 'taken')
        if (taken.length) lines.push(`${taken.length} others are taken for now; the team can tell you if one frees up.`)
    } else if (sig.page && (sig.page === 'recommend' || !(sig.location || sig.bedrooms || sig.maxPrice || sig.minPrice))) {
        const explain: Record<string, string> = {
            payrent: 'You can pay your rent securely through RentRail. Taking you there now.',
            list: 'You can list your property for free and add a 360 tour. Taking you to the listing page.',
            howitworks: 'Here is how it works: browse, tour a place in 360, then book a viewing. Opening the guide.',
            safety: 'Every listing is checked and payments stay protected. Opening our trust and safety page.',
            contact: 'Opening our contact page for you.',
            recommend: 'If you live in a building that is not on RealEVR yet, you can tell us about it and earn points: 100 points are worth 10,000 shillings. Taking you there now.',
            properties: 'Open any property to book a viewing or start its 3D tour. Taking you to the properties.',
        }
        lines.push(explain[sig.page] ?? 'Taking you there now.')
        result.action = { type: 'go', page: sig.page, path: GO_PAGES[sig.page] }
    } else if (sig.wantsOverview && !hasCriteria) {
        lines.push(overview(snap, money))
        if (snap.featured[0]) lines.push(`A featured one is ${describeCard(snap.featured[0])}.`)
        const later = upcomingNote(snap, undefined, true)
        if (later) lines.push(`Coming up: ${later}.`)
        if (snap.featured.length) {
            result.results = snap.featured
            result.action = { type: 'results', query: {}, total: snap.featured.length }
        }
    } else if (hasCriteria || (sig.wantsSearch && !sig.wantsOverview && (merged.category || merged.location))) {
        // A budget someone speaks is in their own currency, so compare it with listings priced in that.
        const query = { ...queryFrom({ ...wants }), ...(place ? { currency: currencyForCountry(place.country) } : {}) }
        const found = await searchWithRelaxing(query, place)
        result.search = { query, total: found.dropped ? 0 : found.total }
        if (!found.total) {
            lines.push(
                `I do not have anything like that right now. ${overview(snap, money)} I have noted exactly what you are after so the team can add it.`,
            )
        } else {
            result.results = found.cards
            result.action = { type: 'results', query: found.used, total: found.total }
            const best = found.cards[0]
            if (!found.dropped) {
                lines.push(
                    found.total === 1
                        ? `I found one: ${describeCard(best)}.`
                        : `I found ${found.total}${wants.location ? ` in ${wants.location}` : ''}. The best match is ${describeCard(best)}.`,
                )
            } else {
                const why: Record<string, string> = {
                    type: `I do not have exactly that type${wants.location ? ` in ${wants.location}` : ''}, but`,
                    budget: 'Nothing fits that budget exactly, but a little above it',
                    bedrooms: 'Nothing has quite that many bedrooms, but',
                    area: `I do not have anything in ${wants.location ?? 'that area'} yet${sig.location && !sig.locationKnown ? ' (if I heard that wrong, just tell me the area again)' : ''}, but elsewhere`,
                    category: 'Nothing matches exactly, but',
                }
                lines.push(`${why[found.dropped]} I recommend ${describeCard(best)}. I have noted what you asked for so the team can add more like it.`)
            }
        }
        const later = upcomingNote(snap, { category: wants.category, location: wants.location })
        if (later) lines.push(`Also coming up: ${later}.`)
    } else if (sig.name && !hasCriteria) {
        lines.push(`Lovely to meet you, ${sig.name.split(' ')[0]}.`)
    } else if (contact && (contact.email || contact.phone)) {
        lines.push(`Thank you${first ? `, ${first}` : ''}. I have passed your details to the team.`)
    } else if (sig.declined) {
        lines.push('No problem at all, we can carry on without it.')
    } else if (sig.thanks) {
        lines.push(pick(['You are welcome.', 'My pleasure.'], turn))
    } else if (sig.bye) {
        lines.push('Goodbye for now. I am here whenever you need me.')
    } else if (sig.greeting) {
        lines.push(pick([`Hello${first ? ` ${first}` : ''}! Good to have you here.`, `Hi${first ? ` ${first}` : ''}, welcome to RealEVR Estates.`], turn))
    } else if (expecting === 'budget' && !hasCriteria) {
        lines.push('Sorry, I did not catch the amount. You can say something like "under two million shillings".')
    } else {
        // Nothing recognised: say something useful about the platform, never the same line twice.
        lines.push(pick([`${overview(snap, money)}`, 'I can help you find a home, check prices, or book a viewing.', 'Tell me what kind of place you want and where, and I will look.'], turn))
    }

    // ---- the one follow-up question ----
    // What their saved profile already says counts as known, so the questions skip it.
    const known: Partial<KevinLead> = { ...(hints?.category ? { category: hints.category } : {}), ...(hints?.location ? { location: hints.location } : {}), ...(hints?.maxBudget ? { maxBudget: hints.maxBudget } : {}), ...(hints?.minBudget ? { minBudget: hints.minBudget } : {}) }
    const leadAfter: Partial<KevinLead> = { ...merged, movingSoon: update.movingSoon ?? lead?.movingSoon, declined: update.declined ?? lead?.declined }
    for (const key of Object.keys(known) as Array<keyof typeof known>) {
        if (leadAfter[key] === undefined) (leadAfter as Record<string, unknown>)[key] = known[key]
    }
    const closing = sig.bye || sig.thanks || sig.ordinal || sig.page || sig.wantsHuman
    const ask = closing ? null : nextQuestion(leadAfter, account, intaking, asked, turn)
    if (ask) {
        lines.push(ask.text)
        update.lastAsk = ask.slot
        update.asks = { ...asked, [ask.slot]: (asked[ask.slot] ?? 0) + 1 }
    } else {
        update.lastAsk = ''
        if (!closing && !result.whatsapp && result.results.length) lines.push('Would you like to see one of them, or message us on WhatsApp?')
    }
    result.reply = lines.join(' ').replace(/\s+/g, ' ').trim()
    return result
}
