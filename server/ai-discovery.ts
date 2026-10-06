/**
 * Letting AI assistants search RealEVR Estates: an open, read-only listings API and an MCP server (Model Context
 * Protocol) over the same data, so ChatGPT / Claude / Perplexity-style agents and any developer can answer
 * "2 bedroom flats in Kololo under 3 million" with real homes and a link back to the page.
 *
 * Public by design, so it only ever exposes what the website already shows to anyone: no owner phone numbers or
 * emails (the property page is where a person contacts the owner), no unavailable listings, no private fields.
 * Read-only, rate limited per address, nothing here calls a paid AI service.
 *
 *   GET  /public-api/v1/search      ?q= &location= &category= &type= &bedrooms= &min_price= &max_price= &currency= &limit=
 *   GET  /public-api/v1/properties/:id
 *   GET  /public-api/v1/places
 *   GET  /public-api/v1/knowledge   ?q=
 *   GET  /openapi.json              the description of the above
 *   POST /mcp                       MCP (Streamable HTTP, stateless): search_properties, get_property, list_places, real_estate_knowledge
 *   GET  /.well-known/mcp.json      where to find the MCP server
 *
 * (Not under /api/ because robots.txt keeps crawlers out of /api/.)
 */
import type { Express, Request, Response } from 'express'
import { getCanonicalBaseUrl } from './sitemap'
import { populatedPlaces } from './place-pages'
import { knowledgeFor } from './gene/kevin-knowledge'
import { FILTER_CATEGORIES, matchesFilters, type PropertyFilters } from '../shared/property-filters'
import { countryName, inferListingCountry, listingCity } from '../shared/africa'

type Listing = Record<string, any>
interface ListingSource {
    getAllProperties(): Promise<Listing[]>
}

const SITE_NAME = 'RealEVR Estates'
const MAX_LIMIT = 20
const DEFAULT_LIMIT = 10
const PROPERTY_TYPES = ['apartment', 'house', 'land', 'commercial', 'hostel']

// ---------------------------------------------------------------------------
// Turning a stored listing into the public shape
// ---------------------------------------------------------------------------

/** Agents sometimes type their number into the description. The page shows the right contact, so the API leaves these out. */
export function stripContacts(text: string): string {
    return text
        .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '')
        .replace(/https?:\/\/(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)\S*/gi, '')
        .replace(/\+\d[\d\s().-]{7,}\d/g, '') // +256 702 742333
        .replace(/\b0\d{2,3}[\s.-]?\d{3}[\s.-]?\d{3,4}\b/g, '') // 0702 742 333
}

export function publicListing(p: Listing, base: string) {
    const city = listingCity(p)
    const country = inferListingCountry(p)
    const id = Number(p.id)
    return {
        id,
        title: String(p.title ?? ''),
        category: String(p.category ?? ''),
        propertyType: String(p.propertyType ?? ''),
        location: String(p.location ?? ''),
        city: city?.name ?? null,
        country: countryName(country) || null,
        bedrooms: Number(p.bedrooms) || 0,
        bathrooms: Number(p.bathrooms) || 0,
        squareMeters: Number(p.squareMeters) || null,
        price: Number(p.price) || 0,
        currency: String(p.currency || 'UGX'),
        monthlyPrice: p.monthlyPrice ? Number(p.monthlyPrice) : null,
        furnished: p.category === 'furnished_houses',
        amenities: Array.isArray(p.amenities) ? p.amenities.filter((a: unknown) => typeof a === 'string' && a.trim()).slice(0, 20) : [],
        description: stripContacts(String(p.description ?? '')).replace(/\s+/g, ' ').trim().slice(0, 400),
        hasVirtualTour: !!p.tourUrl && p.hasTour !== false,
        featured: !!p.isFeatured,
        image: p.imageUrl ? (String(p.imageUrl).startsWith('http') ? String(p.imageUrl) : `${base}${String(p.imageUrl).startsWith('/') ? '' : '/'}${p.imageUrl}`) : null,
        // The page has the 360° tour, photos, map and the way to contact the owner.
        url: `${base}/property/${id}`,
    }
}

export type PublicListing = ReturnType<typeof publicListing>

const isPublic = (p: Listing) => p.isAvailable !== false

const STOP = new Set(['a', 'an', 'the', 'in', 'for', 'to', 'of', 'with', 'and', 'near', 'at', 'on', 'me', 'find', 'show', 'looking', 'want', 'need', 'home', 'homes', 'place', 'places', 'property', 'properties', 'house', 'houses'])

/** Free text ("cheap furnished flat near the university") matched against what a listing says about itself. */
function textScore(p: Listing, q: string): number {
    const terms = q.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w))
    if (!terms.length) return 1
    const title = `${p.title ?? ''} ${p.location ?? ''}`.toLowerCase()
    const rest = `${p.description ?? ''} ${p.propertyType ?? ''} ${(Array.isArray(p.amenities) ? p.amenities.join(' ') : '')}`.toLowerCase()
    let score = 0
    for (const t of terms) {
        if (title.includes(t)) score += 3
        else if (rest.includes(t)) score += 1
    }
    return score
}

export interface SearchInput {
    q?: string
    location?: string
    category?: string
    type?: string
    bedrooms?: number
    minPrice?: number
    maxPrice?: number
    currency?: string
    limit?: number
}

function positive(v: unknown): number | undefined {
    const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN
    return Number.isFinite(n) && n > 0 ? n : undefined
}

export function parseSearch(raw: Record<string, unknown>): SearchInput {
    const str = (v: unknown, max = 100) => (typeof v === 'string' ? v.trim().slice(0, max) : '') || undefined
    const category = str(raw.category)
    const type = str(raw.type ?? raw.property_type)?.toLowerCase()
    const currency = str(raw.currency, 3)?.toUpperCase()
    return {
        q: str(raw.q ?? raw.query, 200),
        location: str(raw.location, 60),
        category: category && FILTER_CATEGORIES.includes(category) ? category : undefined,
        type: type && PROPERTY_TYPES.includes(type) ? type : undefined,
        bedrooms: positive(raw.bedrooms),
        minPrice: positive(raw.min_price ?? raw.minPrice),
        maxPrice: positive(raw.max_price ?? raw.maxPrice),
        currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : undefined,
        limit: Math.min(MAX_LIMIT, Math.max(1, Math.floor(positive(raw.limit) ?? DEFAULT_LIMIT))),
    }
}

export function searchListings(all: Listing[], input: SearchInput, base: string) {
    const filters: PropertyFilters = {
        location: input.location,
        category: input.category,
        propertyType: input.type,
        bedrooms: input.bedrooms,
        minPrice: input.minPrice,
        maxPrice: input.maxPrice,
        currency: input.currency,
    }
    const scored = all
        .filter(isPublic)
        .filter((p) => matchesFilters(p, filters))
        .map((p) => ({ p, score: input.q ? textScore(p, input.q) : 1 }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || Number(!!b.p.isFeatured) - Number(!!a.p.isFeatured) || Number(b.p.viewCount ?? 0) - Number(a.p.viewCount ?? 0))
    return {
        total: scored.length,
        results: scored.slice(0, input.limit ?? DEFAULT_LIMIT).map((x) => publicListing(x.p, base)),
    }
}

// ---------------------------------------------------------------------------
// Rate limit (per address, in memory: this is a single small server)
// ---------------------------------------------------------------------------

const hits = new Map<string, { count: number; resetAt: number }>()
const LIMIT_PER_MINUTE = 60

function limited(req: Request, res: Response): boolean {
    const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? 'unknown').split(',')[0].trim()
    const now = Date.now()
    const row = hits.get(ip)
    if (!row || row.resetAt < now) {
        hits.set(ip, { count: 1, resetAt: now + 60_000 })
        if (hits.size > 5000) hits.forEach((v, k) => v.resetAt < now && hits.delete(k))
        return false
    }
    row.count++
    if (row.count > LIMIT_PER_MINUTE) {
        res.status(429).set('Retry-After', '60').json({ error: 'Too many requests. Up to 60 a minute, please slow down.' })
        return true
    }
    return false
}

// ---------------------------------------------------------------------------
// MCP (JSON-RPC 2.0 over HTTP, stateless)
// ---------------------------------------------------------------------------

const MCP_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']

const TOOLS = [
    {
        name: 'search_properties',
        description:
            `Search real, currently available homes on ${SITE_NAME} (Africa: rentals, furnished BnB stays, homes for sale and bank sales, each with a 360° virtual tour). ` +
            'Use for any "find me a flat / house / plot in <place>" question. Every result has a `url`: give it to the person so they can walk through the home and contact the owner.',
        inputSchema: {
            type: 'object',
            properties: {
                q: { type: 'string', description: 'Free text, e.g. "furnished flat near the university".' },
                location: { type: 'string', description: 'Neighbourhood, city or country, e.g. "Kololo", "Nairobi".' },
                category: { type: 'string', enum: FILTER_CATEGORIES, description: 'rental_units, for_sale, furnished_houses (BnB) or bank_sales.' },
                type: { type: 'string', enum: PROPERTY_TYPES },
                bedrooms: { type: 'integer', minimum: 1, description: 'Minimum bedrooms.' },
                min_price: { type: 'number', minimum: 0 },
                max_price: { type: 'number', minimum: 0 },
                currency: { type: 'string', description: 'ISO code the prices are in (default UGX).' },
                limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT },
            },
        },
    },
    {
        name: 'get_property',
        description: `Full public details of one ${SITE_NAME} listing by id (from search_properties).`,
        inputSchema: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    },
    {
        name: 'list_places',
        description: `The countries and cities where ${SITE_NAME} has homes listed, with counts. Use to see where it can help before searching.`,
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'real_estate_knowledge',
        description:
            'Recent real estate news and plain-language facts about buying, renting and property rules in African countries, gathered from published reports. Use for market or "how does X work in <country>" questions. Always cite the source it names.',
        inputSchema: { type: 'object', properties: { question: { type: 'string' }, country: { type: 'string', description: 'Country name or ISO code, optional.' } }, required: ['question'] },
    },
]

const MCP_INSTRUCTIONS =
    `${SITE_NAME} is a live property platform for Africa with a 360° virtual tour on every listing. Search with search_properties, ` +
    'then give the person the `url` of the homes you mention so they can tour and contact the owner. Prices are in each listing\'s own currency. ' +
    'Do not invent listings: only describe what the tools return.'

function listingSummary(l: PublicListing): string {
    const beds = l.bedrooms ? `${l.bedrooms} bed` : ''
    const price = `${l.currency} ${l.price.toLocaleString('en-US')}${l.category === 'rental_units' ? ' per month' : l.category === 'furnished_houses' ? ' per night' : ''}`
    return `- ${l.title} | ${[beds, l.propertyType].filter(Boolean).join(' ')} | ${l.location}${l.country && !l.location.toLowerCase().includes(l.country.toLowerCase()) ? `, ${l.country}` : ''} | ${price} | ${l.hasVirtualTour ? '360° tour | ' : ''}${l.url}`
}

async function callTool(name: string, args: Record<string, unknown>, source: ListingSource, base: string): Promise<{ text: string; data?: unknown }> {
    if (name === 'search_properties') {
        const input = parseSearch(args)
        const { total, results } = searchListings(await source.getAllProperties(), input, base)
        if (!results.length) {
            return { text: `No available homes match that on ${SITE_NAME}. Try a wider place, a higher price or fewer filters. Browse everything at ${base}/properties`, data: { total: 0, results: [] } }
        }
        return {
            text: `${total} home${total === 1 ? '' : 's'} on ${SITE_NAME}${total > results.length ? ` (showing ${results.length})` : ''}:\n${results.map(listingSummary).join('\n')}\nMore: ${base}/properties`,
            data: { total, results },
        }
    }
    if (name === 'get_property') {
        const id = positive(args.id)
        const found = id ? (await source.getAllProperties()).find((p) => Number(p.id) === id && isPublic(p)) : undefined
        if (!found) return { text: 'No available listing has that id.', data: null }
        const l = publicListing(found, base)
        return { text: `${listingSummary(l)}\n${l.description}\nAmenities: ${l.amenities.join(', ') || 'not listed'}\nTour, photos, map and contact: ${l.url}`, data: l }
    }
    if (name === 'list_places') {
        const places = populatedPlaces((await source.getAllProperties()).filter(isPublic))
        return {
            text: places.length ? places.map((c) => `${c.name} (${c.count}): ${c.cities.map((x) => `${x.name} ${x.count}`).join(', ')} - ${base}/homes/${c.slug}`).join('\n') : 'No homes are listed yet.',
            data: places,
        }
    }
    if (name === 'real_estate_knowledge') {
        const question = typeof args.question === 'string' ? args.question.trim().slice(0, 300) : ''
        if (!question) return { text: 'Ask a question, e.g. "what are the rules for foreigners buying land in Kenya?"' }
        const country = typeof args.country === 'string' ? `${args.country} ` : ''
        const answer = await knowledgeFor(`${country}${question}`, null, { live: false })
        return { text: answer.trim() || `Nothing reliable on that yet. See ${base}/guides for the guides we have written.` }
    }
    throw new RpcError(-32602, `Unknown tool: ${name}`)
}

class RpcError extends Error {
    constructor(public code: number, message: string) {
        super(message)
    }
}

async function handleRpc(msg: any, source: ListingSource, base: string): Promise<object | null> {
    const id = msg?.id
    const isNotification = id === undefined || id === null
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
        return { jsonrpc: '2.0', id: id ?? null, error: { code: -32600, message: 'Invalid request' } }
    }
    try {
        let result: unknown
        switch (msg.method) {
            case 'initialize': {
                const asked = String(msg.params?.protocolVersion ?? '')
                result = {
                    protocolVersion: MCP_VERSIONS.includes(asked) ? asked : MCP_VERSIONS[0],
                    capabilities: { tools: { listChanged: false } },
                    serverInfo: { name: 'realevr-estates', title: SITE_NAME, version: '1.0.0' },
                    instructions: MCP_INSTRUCTIONS,
                }
                break
            }
            case 'ping':
                result = {}
                break
            case 'tools/list':
                result = { tools: TOOLS }
                break
            case 'tools/call': {
                const name = String(msg.params?.name ?? '')
                const args = msg.params?.arguments && typeof msg.params.arguments === 'object' ? msg.params.arguments : {}
                try {
                    const out = await callTool(name, args, source, base)
                    result = { content: [{ type: 'text', text: out.text }], ...(out.data !== undefined ? { structuredContent: { result: out.data } } : {}), isError: false }
                } catch (err) {
                    if (err instanceof RpcError) throw err
                    console.error('[mcp] tool failed:', name, err)
                    result = { content: [{ type: 'text', text: 'That lookup failed. Please try again in a moment.' }], isError: true }
                }
                break
            }
            default:
                if (isNotification) return null // notifications/initialized, notifications/cancelled, ...
                throw new RpcError(-32601, `Method not found: ${msg.method}`)
        }
        return isNotification ? null : { jsonrpc: '2.0', id, result }
    } catch (err) {
        if (isNotification) return null
        const e = err instanceof RpcError ? err : new RpcError(-32603, 'Internal error')
        return { jsonrpc: '2.0', id, error: { code: e.code, message: e.message } }
    }
}

// ---------------------------------------------------------------------------
// OpenAPI description
// ---------------------------------------------------------------------------

export function openApiSpec(base: string): object {
    const listing = {
        type: 'object',
        properties: {
            id: { type: 'integer' }, title: { type: 'string' }, category: { type: 'string' }, propertyType: { type: 'string' },
            location: { type: 'string' }, city: { type: 'string', nullable: true }, country: { type: 'string', nullable: true },
            bedrooms: { type: 'integer' }, bathrooms: { type: 'integer' }, squareMeters: { type: 'integer', nullable: true },
            price: { type: 'number' }, currency: { type: 'string' }, monthlyPrice: { type: 'number', nullable: true },
            furnished: { type: 'boolean' }, amenities: { type: 'array', items: { type: 'string' } }, description: { type: 'string' },
            hasVirtualTour: { type: 'boolean' }, featured: { type: 'boolean' }, image: { type: 'string', nullable: true },
            url: { type: 'string', description: 'The listing page: 360° tour, photos, map and how to contact the owner.' },
        },
    }
    const q = (name: string, description: string, schema: object = { type: 'string' }) => ({ name, in: 'query', required: false, description, schema })
    return {
        openapi: '3.1.0',
        info: {
            title: `${SITE_NAME} public listings API`,
            version: '1.0.0',
            description: `Search real, available homes in Africa (rentals, BnBs, sales, bank sales), each with a 360° virtual tour. Read only, free, up to 60 requests a minute per address. When you show a result to a person, link to its \`url\`. Also available as an MCP server at ${base}/mcp.`,
        },
        servers: [{ url: base }],
        paths: {
            '/public-api/v1/search': {
                get: {
                    operationId: 'searchProperties',
                    summary: 'Search available homes',
                    parameters: [
                        q('q', 'Free text, e.g. "furnished flat near the university"'),
                        q('location', 'Neighbourhood, city or country'),
                        q('category', 'rental_units | for_sale | furnished_houses | bank_sales', { type: 'string', enum: FILTER_CATEGORIES }),
                        q('type', 'Property type', { type: 'string', enum: PROPERTY_TYPES }),
                        q('bedrooms', 'Minimum bedrooms', { type: 'integer' }),
                        q('min_price', 'Minimum price', { type: 'number' }),
                        q('max_price', 'Maximum price', { type: 'number' }),
                        q('currency', 'ISO currency the prices are in (default UGX)'),
                        q('limit', `1 to ${MAX_LIMIT} (default ${DEFAULT_LIMIT})`, { type: 'integer' }),
                    ],
                    responses: { '200': { description: 'Matching homes', content: { 'application/json': { schema: { type: 'object', properties: { total: { type: 'integer' }, results: { type: 'array', items: listing } } } } } } },
                },
            },
            '/public-api/v1/properties/{id}': {
                get: {
                    operationId: 'getProperty',
                    summary: 'One listing',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                    responses: { '200': { description: 'The listing', content: { 'application/json': { schema: listing } } }, '404': { description: 'Not found or not available' } },
                },
            },
            '/public-api/v1/places': { get: { operationId: 'listPlaces', summary: 'Countries and cities with homes', responses: { '200': { description: 'Places with counts' } } } },
            '/public-api/v1/knowledge': {
                get: { operationId: 'realEstateKnowledge', summary: 'Recent news and facts for a real estate question', parameters: [q('q', 'The question')], responses: { '200': { description: 'Answer text with sources' } } },
            },
        },
    }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function registerAiDiscoveryRoutes(app: Express, source: ListingSource): void {
    const open = (req: Request, res: Response): boolean => {
        res.set('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version')
        res.set('Cache-Control', 'public, max-age=60')
        return !limited(req, res)
    }

    app.get('/public-api/v1/search', async (req, res) => {
        if (!open(req, res)) return
        try {
            res.json(searchListings(await source.getAllProperties(), parseSearch(req.query as Record<string, unknown>), getCanonicalBaseUrl()))
        } catch (err) {
            console.error('[public-api] search failed:', err)
            res.status(500).json({ error: 'Search is temporarily unavailable.' })
        }
    })

    app.get('/public-api/v1/properties/:id', async (req, res) => {
        if (!open(req, res)) return
        try {
            const id = Number(req.params.id)
            const found = Number.isFinite(id) ? (await source.getAllProperties()).find((p) => Number(p.id) === id && isPublic(p)) : undefined
            if (!found) return res.status(404).json({ error: 'No available listing has that id.' })
            res.json(publicListing(found, getCanonicalBaseUrl()))
        } catch (err) {
            console.error('[public-api] property failed:', err)
            res.status(500).json({ error: 'Temporarily unavailable.' })
        }
    })

    app.get('/public-api/v1/places', async (req, res) => {
        if (!open(req, res)) return
        try {
            res.json(populatedPlaces((await source.getAllProperties()).filter(isPublic)))
        } catch (err) {
            console.error('[public-api] places failed:', err)
            res.status(500).json({ error: 'Temporarily unavailable.' })
        }
    })

    app.get('/public-api/v1/knowledge', async (req, res) => {
        if (!open(req, res)) return
        const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 300) : ''
        if (!q) return res.status(400).json({ error: 'Add ?q= with your question.' })
        try {
            res.json({ question: q, answer: (await knowledgeFor(q, null, { live: false })).trim() || null })
        } catch (err) {
            console.error('[public-api] knowledge failed:', err)
            res.status(500).json({ error: 'Temporarily unavailable.' })
        }
    })

    app.get('/openapi.json', (_req, res) => {
        res.set('Cache-Control', 'public, max-age=3600').json(openApiSpec(getCanonicalBaseUrl()))
    })

    app.get('/.well-known/mcp.json', (_req, res) => {
        const base = getCanonicalBaseUrl()
        res.set('Cache-Control', 'public, max-age=3600').json({
            name: 'realevr-estates',
            title: SITE_NAME,
            description: 'Search real, available homes in Africa with 360° virtual tours.',
            version: '1.0.0',
            transport: { type: 'streamable-http', url: `${base}/mcp` },
            tools: TOOLS.map((t) => t.name),
            documentation: `${base}/llms.txt`,
            openapi: `${base}/openapi.json`,
        })
    })

    // Proof that this domain's owner publishes the MCP server to the official MCP Registry (HTTP authentication,
    // https://github.com/modelcontextprotocol/registry). It is the PUBLIC half of a key pair; the private half is not in the repo.
    app.get('/.well-known/mcp-registry-auth', (_req, res) => {
        res.type('text/plain; charset=utf-8').set('Cache-Control', 'public, max-age=3600').send('v=MCPv1; k=ed25519; p=dDPntUqj6p/AMlBM7X+r4cDTLkVnBNr5bcwtTvP2aNE=\n')
    })

    app.post('/mcp', async (req, res) => {
        res.set('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version')
        if (limited(req, res)) return
        const base = getCanonicalBaseUrl()
        const body = req.body
        if (Array.isArray(body)) {
            const out = (await Promise.all(body.slice(0, 20).map((m) => handleRpc(m, source, base)))).filter(Boolean)
            return out.length ? res.json(out) : res.status(202).end()
        }
        const out = await handleRpc(body, source, base)
        return out ? res.json(out) : res.status(202).end()
    })

    // Stateless server: there is no event stream to open, which the protocol allows a server to say with 405.
    app.get('/mcp', (_req, res) => {
        res.set('Allow', 'POST').status(405).json({ error: `This is an MCP server. POST JSON-RPC to ${getCanonicalBaseUrl()}/mcp. See /.well-known/mcp.json` })
    })
}
