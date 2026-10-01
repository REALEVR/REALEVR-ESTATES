/**
 * What Kevin can DO, not just say.
 *
 * A phone assistant is useful because it acts: "homes in Kololo under three
 * million" shows homes, "open the second one" opens it. Kevin's AI asks for an
 * action by ending its reply with one bracketed token (the same trick as the
 * [[HUMAN]] hand-off marker in chat.ts), because every AI provider here is
 * called for plain text, not tool use. This module is the safe half of that:
 * it finds the token, treats everything inside it as untrusted input
 * (it came from a model that has read visitor-supplied text), and turns it
 * into one of three narrow, read-only outcomes:
 *
 *   SEARCH {json}  -> up to three public listings matching the filters
 *   OPEN <id>      -> a public listing that really exists
 *   GO <page>      -> a page from a fixed allowlist
 *
 * Nothing here can pay, book, message anyone or change data. Opening a
 * property page is as far as it goes; the payment and booking steps stay on
 * the pages that already guard them.
 */
import { storage } from '../storage'

export type SearchCategory = 'rental_units' | 'for_sale' | 'furnished_houses' | 'bank_sales'

export interface SearchQuery {
    location?: string
    minPrice?: number
    maxPrice?: number
    bedrooms?: number
    category?: SearchCategory
}

export interface KevinCard {
    id: number
    title: string
    location: string
    price: number
    currency: string
    bedrooms: number
    category: string
    imageUrl: string
}

export type KevinAction =
    | { type: 'results'; query: SearchQuery; total: number }
    | { type: 'open'; propertyId: number }
    | { type: 'go'; page: string; path: string }

export type RawAction =
    | { kind: 'search'; query: SearchQuery }
    | { kind: 'open'; propertyId: number }
    | { kind: 'go'; page: string }

const CATEGORY_WORDS: Record<string, SearchCategory> = {
    rent: 'rental_units',
    rentals: 'rental_units',
    sale: 'for_sale',
    bnb: 'furnished_houses',
    furnished: 'furnished_houses',
    banksale: 'bank_sales',
}

/** Fixed allowlist: the model can name a page, never a URL. */
export const GO_PAGES: Record<string, string> = {
    home: '/',
    properties: '/properties',
    featured: '/featured-properties',
    new: '/new-listings',
    rentals: '/rental-units',
    sale: '/for-sale',
    bnb: '/bnbs',
    banksales: '/bank-sales',
    payrent: '/rentrail',
    howitworks: '/how-it-works',
    help: '/help',
    contact: '/contact',
    list: '/list-your-property',
    safety: '/trust-safety',
}

const ACTION_TOKEN = /\[\[\s*(SEARCH|OPEN|GO)\b([^\]]*)\]\]/gi

/** The instructions that teach the model the action tokens (kept next to the parser they must match). */
export const ACTION_PROMPT = [
    'You can act for the visitor by ending your message with ONE action token. Never mention or explain the token.',
    '[[SEARCH {"location":"Kololo","maxPrice":3000000,"bedrooms":2,"category":"rentals"}]] shows matching homes on screen. Every key is optional.',
    'category is one of: rentals, sale, bnb, furnished, banksale. Prices are plain numbers in Ugandan shillings.',
    '[[OPEN 123]] opens one home. Use only an id the visitor can already see on their screen.',
    `[[GO page]] opens a page. page is one of: ${Object.keys(GO_PAGES).join(', ')}.`,
    'Use payrent when they want to pay rent. Only act when they ask to see, find, open or go somewhere; never to book or pay.',
]

// Built from a string: the `u` flag as a literal trips this repo's tsc target.
const NOT_LOCATION_CHARS = new RegExp("[^\\p{L}\\p{N} '-]", 'gu')

function cleanLocation(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined
    const cleaned = value.replace(NOT_LOCATION_CHARS, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
    return cleaned || undefined
}

function cleanNumber(value: unknown, max: number): number | undefined {
    const n = typeof value === 'string' ? Number(value.replace(/[, ]/g, '')) : value
    return typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= max ? Math.round(n) : undefined
}

/** Pull the first action token out of a reply and strip every action token from the text. */
export function extractKevinAction(reply: string): { text: string; action: RawAction | null } {
    let action: RawAction | null = null
    const text = reply
        .replace(ACTION_TOKEN, (_whole, verb: string, arg: string) => {
            if (action) return ''
            const kind = verb.toUpperCase()
            const body = (arg ?? '').trim()
            if (kind === 'SEARCH') {
                let parsed: any = {}
                try {
                    parsed = body ? JSON.parse(body) : {}
                } catch {
                    parsed = {}
                }
                const query: SearchQuery = {}
                const location = cleanLocation(parsed?.location)
                if (location) query.location = location
                const minPrice = cleanNumber(parsed?.minPrice, 1e12)
                if (minPrice) query.minPrice = minPrice
                const maxPrice = cleanNumber(parsed?.maxPrice, 1e12)
                if (maxPrice) query.maxPrice = maxPrice
                const bedrooms = cleanNumber(parsed?.bedrooms, 20)
                if (bedrooms) query.bedrooms = bedrooms
                const category = typeof parsed?.category === 'string' ? CATEGORY_WORDS[parsed.category.toLowerCase()] : undefined
                if (category) query.category = category
                action = { kind: 'search', query }
            } else if (kind === 'OPEN') {
                const id = Number.parseInt(body, 10)
                if (Number.isSafeInteger(id) && id > 0) action = { kind: 'open', propertyId: id }
            } else if (kind === 'GO') {
                const page = body.toLowerCase().replace(/[^a-z]/g, '')
                if (Object.prototype.hasOwnProperty.call(GO_PAGES, page)) action = { kind: 'go', page }
            }
            return ''
        })
        .replace(/\s{2,}/g, ' ')
        .trim()
    return { text, action }
}

function toCard(p: any): KevinCard {
    return {
        id: Number(p.id),
        title: String(p.title ?? '').slice(0, 120),
        location: String(p.location ?? '').slice(0, 120),
        price: Number(p.price) || 0,
        currency: String(p.currency ?? 'UGX'),
        bedrooms: Number(p.bedrooms) || 0,
        category: String(p.category ?? ''),
        imageUrl: String(p.imageUrl ?? ''),
    }
}

export async function searchListings(query: SearchQuery, limit = 3): Promise<{ cards: KevinCard[]; total: number }> {
    const all = await storage.getAllProperties()
    const words = (query.location ?? '').toLowerCase().split(/\s+/).filter(Boolean)
    const matches = all.filter((p: any) => {
        if (p.isAvailable === false) return false // same rule as the public listing API
        if (query.category && p.category !== query.category) return false
        if (words.length) {
            const haystack = `${p.location ?? ''} ${p.title ?? ''}`.toLowerCase()
            if (!words.every((w) => haystack.includes(w))) return false
        }
        // Budgets are in shillings, so only compare listings priced in them.
        const inShillings = !p.currency || p.currency === 'UGX'
        if (inShillings && query.maxPrice && p.price > query.maxPrice) return false
        if (inShillings && query.minPrice && p.price < query.minPrice) return false
        if (query.bedrooms && (Number(p.bedrooms) || 0) < query.bedrooms) return false
        return true
    })
    matches.sort((a: any, b: any) => Number(!!b.isFeatured) - Number(!!a.isFeatured) || Number(b.id) - Number(a.id))
    return { cards: matches.slice(0, limit).map(toCard), total: matches.length }
}

export async function findListing(id: number): Promise<KevinCard | null> {
    const all = await storage.getAllProperties()
    const found = all.find((p: any) => Number(p.id) === id && p.isAvailable !== false)
    return found ? toCard(found) : null
}

/**
 * What is on the visitor's screen right now, as the client reports it. It goes
 * into the AI's instructions so "open the second one" can mean something, so
 * every field is reduced to a number or a short plain string first.
 */
export function parseShown(value: unknown): { id: number; title: string }[] {
    if (!Array.isArray(value)) return []
    const shown: { id: number; title: string }[] = []
    for (const item of value.slice(0, 3)) {
        const id = Number((item as any)?.id)
        if (!Number.isSafeInteger(id) || id <= 0) continue
        const title = String((item as any)?.title ?? '')
            .replace(/[\[\]\r\n]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 80)
        shown.push({ id, title })
    }
    return shown
}
