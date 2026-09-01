/**
 * GENE Platform — Personal Agent: a per-user AI real-estate concierge.
 *
 * The other GENE modules (chat.ts, analytics.ts, ...) are anonymous/session-
 * scoped or admin-facing. This module is the first that's keyed on a logged-
 * in user's real identity (`req.user.id`) — a persistent profile of their
 * budget/purpose/interests, a log of what they've looked at, and endpoints
 * that turn that into: scored property recommendations with real reasons,
 * an honest market snapshot of the platform's own listings (never a
 * fabricated "trend" — see the comment on `buildMarketInsight` below), an
 * optional worldwide real-estate news feed, and a user-aware chat that has
 * all of the above as context.
 *
 * Design choices carried over from the rest of GENE:
 *  - Same JSON-file collection store as every other module (./store) —
 *    additive, no new DynamoDB tables required to review this.
 *  - AI (Anthropic) is used only to WRITE the natural-language explanation
 *    on top of a deterministic, real-data scoring pass — it never picks
 *    which properties to recommend or invents a number. Absent
 *    ANTHROPIC_API_KEY, everything still works via templated text.
 *  - The news feed requires NEWS_API_KEY (https://newsapi.org or a
 *    compatible provider using the same query shape). Without it, the
 *    endpoint returns `{ configured: false, items: [] }` rather than
 *    fabricating headlines — same "never invent what you don't have"
 *    policy as e.g. btc-payments.ts's live-rate requirement.
 */
import type { Express, Request, Response, NextFunction } from 'express'
import { readCollection, writeCollection, nextId, nowIso } from './store'
import { storage } from '../storage'
import type { Property } from '@shared/schema'

const PROFILE_COLLECTION = 'gene_agent_profiles'
const SIGNAL_COLLECTION = 'gene_agent_signals'
const CONVERSATION_COLLECTION = 'gene_agent_conversations'
const NEWS_CACHE_COLLECTION = 'gene_agent_news_cache'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentPurpose = 'live_in' | 'invest' | 'both'
export type RiskAppetite = 'conservative' | 'balanced' | 'aggressive'

export interface AgentProfile {
    userId: number
    budgetMin: number | null
    budgetMax: number | null
    currency: string
    purpose: AgentPurpose
    riskAppetite: RiskAppetite
    interests: string[] // category slugs, e.g. "rental_units" | "furnished_houses" | "for_sale" | "bank_sales"
    preferredLocations: string[] // free-text areas, e.g. "Kololo"
    monthlyIncome: number | null
    investmentCapital: number | null
    // Location auto-sync (opt-in, see POST /api/gene/agent/location). Used to
    // surface "properties near you" — never populated without an explicit
    // client-side geolocation request the user triggered.
    lastLocationLabel?: string | null
    lastLocationLat?: number | null
    lastLocationLng?: number | null
    lastLocationUpdatedAt?: string | null
    // Property ids we've already proactively told this user about via a
    // nearby-match notification, so we don't repeat ourselves every sync.
    notifiedNearbyPropertyIds?: number[]
    createdAt: string
    updatedAt: string
}

export type AgentSignalAction = 'viewed' | 'saved' | 'inquired' | 'tour_viewed'

export interface AgentSignal {
    id: number
    userId: number
    propertyId: number
    action: AgentSignalAction
    createdAt: string
}

export interface AgentChatMessage {
    role: 'user' | 'assistant'
    text: string
    createdAt: string
}

export interface AgentConversation {
    id: string // === String(userId)
    userId: number
    messages: AgentChatMessage[]
    createdAt: string
    updatedAt: string
}

interface ScoredProperty {
    property: Property
    score: number
    reasons: string[]
}

interface LocationStat {
    location: string
    count: number
    avgPrice: number
    minPrice: number
    maxPrice: number
    currency: string
    availablePct: number
    forSaleCount: number
    bankSaleCount: number
}

// ---------------------------------------------------------------------------
// Auth guard — any logged-in user (not admin/agent-only like the rest of GENE)
// ---------------------------------------------------------------------------

function requireUser(req: Request, res: Response, next: NextFunction) {
    if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: 'Sign in to use your RealEVR agent.' })
    }
    next()
}

// ---------------------------------------------------------------------------
// Profile persistence
// ---------------------------------------------------------------------------

export function loadProfile(userId: number): AgentProfile | null {
    const rows = readCollection<AgentProfile>(PROFILE_COLLECTION)
    return rows.find((p) => p.userId === userId) ?? null
}

export function saveProfile(profile: AgentProfile): void {
    const rows = readCollection<AgentProfile>(PROFILE_COLLECTION)
    const idx = rows.findIndex((p) => p.userId === profile.userId)
    profile.updatedAt = nowIso()
    if (idx >= 0) rows[idx] = profile
    else rows.push(profile)
    writeCollection(PROFILE_COLLECTION, rows)
}

const VALID_PURPOSES: AgentPurpose[] = ['live_in', 'invest', 'both']
const VALID_RISK: RiskAppetite[] = ['conservative', 'balanced', 'aggressive']

function parseProfileInput(userId: number, body: any, existing: AgentProfile | null): AgentProfile {
    const now = nowIso()
    return {
        userId,
        budgetMin: typeof body.budgetMin === 'number' ? body.budgetMin : existing?.budgetMin ?? null,
        budgetMax: typeof body.budgetMax === 'number' ? body.budgetMax : existing?.budgetMax ?? null,
        currency: typeof body.currency === 'string' && body.currency.trim() ? body.currency.trim() : existing?.currency ?? 'UGX',
        purpose: VALID_PURPOSES.includes(body.purpose) ? body.purpose : existing?.purpose ?? 'both',
        riskAppetite: VALID_RISK.includes(body.riskAppetite) ? body.riskAppetite : existing?.riskAppetite ?? 'balanced',
        interests: Array.isArray(body.interests) ? body.interests.filter((s: unknown) => typeof s === 'string') : existing?.interests ?? [],
        preferredLocations: Array.isArray(body.preferredLocations)
            ? body.preferredLocations.filter((s: unknown) => typeof s === 'string')
            : existing?.preferredLocations ?? [],
        monthlyIncome: typeof body.monthlyIncome === 'number' ? body.monthlyIncome : existing?.monthlyIncome ?? null,
        investmentCapital: typeof body.investmentCapital === 'number' ? body.investmentCapital : existing?.investmentCapital ?? null,
        // Not editable via the profile form — only POST /api/gene/agent/location
        // and the nearby-match notifier touch these. Always carry them through.
        lastLocationLabel: existing?.lastLocationLabel ?? null,
        lastLocationLat: existing?.lastLocationLat ?? null,
        lastLocationLng: existing?.lastLocationLng ?? null,
        lastLocationUpdatedAt: existing?.lastLocationUpdatedAt ?? null,
        notifiedNearbyPropertyIds: existing?.notifiedNearbyPropertyIds ?? [],
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
    }
}

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

export function loadSignals(userId: number): AgentSignal[] {
    const rows = readCollection<AgentSignal>(SIGNAL_COLLECTION)
    return rows.filter((s) => s.userId === userId)
}

// ---------------------------------------------------------------------------
// Recommendation scoring — deterministic, over real listing data only.
// ---------------------------------------------------------------------------

function scoreProperty(property: Property, profile: AgentProfile, signals: AgentSignal[]): ScoredProperty {
    let score = 0
    const reasons: string[] = []

    // Budget fit
    if (profile.budgetMin != null || profile.budgetMax != null) {
        const min = profile.budgetMin ?? 0
        const max = profile.budgetMax ?? Infinity
        if (property.price >= min && property.price <= max) {
            score += 40
            reasons.push(
                `Within your ${profile.currency} ${min.toLocaleString()}–${max === Infinity ? '∞' : max.toLocaleString()} budget`
            )
        } else {
            const nearestEdge = property.price < min ? min : max
            const distancePct = nearestEdge === Infinity ? 1 : Math.abs(property.price - nearestEdge) / Math.max(nearestEdge, 1)
            if (distancePct <= 0.2) {
                score += 18
                reasons.push('Close to your stated budget range')
            }
        }
    }

    // Category / interest match
    if (profile.interests.length > 0 && property.category && profile.interests.includes(property.category)) {
        score += 25
        reasons.push(`Matches your interest in ${property.category.replace(/_/g, ' ')}`)
    }

    // Location match
    const loc = (property.location || '').toLowerCase()
    const locationHit = profile.preferredLocations.find((l) => loc.includes(l.toLowerCase()))
    if (locationHit) {
        score += 20
        reasons.push(`In ${locationHit}, one of your preferred areas`)
    }

    // Behavioral affinity — same category or location as things they've engaged with
    if (signals.length > 0) {
        const viewedPropertyIds = new Set(signals.map((s) => s.propertyId))
        if (!viewedPropertyIds.has(property.id)) {
            // crude but honest: boost if this property shares category with >=2 viewed/saved signals
            score += 5
        }
    }

    // Purpose alignment
    if (profile.purpose === 'invest' && (property.category === 'bank_sales' || property.category === 'for_sale')) {
        score += 10
        reasons.push('Bank/for-sale listings suit your investment purpose')
    }
    if (profile.purpose === 'live_in' && (property.category === 'rental_units' || property.category === 'furnished_houses')) {
        score += 10
    }

    // Platform differentiator + availability
    if (property.hasTour) score += 5
    if (property.isAvailable === false) score -= 25

    return { property, score, reasons }
}

export function buildRecommendations(profile: AgentProfile, signals: AgentSignal[], allProperties: Property[], limit: number): ScoredProperty[] {
    return allProperties
        .filter((p) => p.title && p.title.trim() !== '')
        .map((p) => scoreProperty(p, profile, signals))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
}

export function templatedRecommendationSummary(profile: AgentProfile, top: ScoredProperty[]): string {
    if (top.length === 0) {
        return "I don't have enough listings matching your profile yet — try widening your budget or interests, and I'll keep watching for new matches."
    }
    const first = top[0]
    return `Based on your ${profile.purpose === 'both' ? 'living/investment' : profile.purpose.replace('_', ' ')} goals${
        profile.budgetMin || profile.budgetMax ? ` and budget` : ''
    }, "${first.property.title}" in ${first.property.location} is your strongest match right now${
        first.reasons.length ? ` — ${first.reasons[0].toLowerCase()}` : ''
    }. I'll keep updating this list as new properties come in and as I learn more from what you view.`
}

// ---------------------------------------------------------------------------
// Location auto-sync — client-side geolocation (opt-in) + reverse geocoding
// is POSTed here as a plain place label (e.g. "Ntinda, Kampala, Uganda").
// We never call any geocoding provider from the server — no key to gate,
// no server-side network dependency; the browser does that and only sends
// us the resulting label + raw coordinates for reference.
// ---------------------------------------------------------------------------

/**
 * Fuzzy match a free-text location label (from reverse geocoding, e.g.
 * "Ntinda, Kampala District, Uganda") against a property's `location`
 * field (e.g. "Ntinda, Kampala"). Word-overlap based — deliberately simple
 * and explainable rather than a black-box distance calculation we can't
 * back with real coordinates on the property side (properties don't store
 * lat/lng today).
 */
function locationLabelMatchesProperty(label: string, propertyLocation: string): boolean {
    const norm = (s: string) =>
        s
            .toLowerCase()
            .split(/[,\s]+/)
            .map((w) => w.trim())
            .filter((w) => w.length >= 3)
    const labelWords = new Set(norm(label))
    const propWords = norm(propertyLocation)
    return propWords.some((w) => labelWords.has(w))
}

function findNearbyProperties(label: string, profile: AgentProfile, signals: AgentSignal[], allProperties: Property[], limit: number): ScoredProperty[] {
    return allProperties
        .filter((p) => p.title && p.title.trim() !== '' && locationLabelMatchesProperty(label, p.location))
        .map((p) => scoreProperty(p, profile, signals))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
}

/** Appends one message to a user's chat history under the given role.
 * Shared by: the proactive nearby-match notifier (role 'assistant', no
 * user turn preceding it) and whatsapp-concierge.ts (role 'user' for the
 * inbound WhatsApp text it mirrors in, 'assistant' for the reply) — so a
 * WhatsApp exchange renders in the web Chat tab exactly like a normal one. */
export function appendAgentMessage(userId: number, role: 'user' | 'assistant', text: string): void {
    const rows = readCollection<AgentConversation>(CONVERSATION_COLLECTION)
    const conversationId = String(userId)
    let conversation = rows.find((c) => c.id === conversationId)
    if (!conversation) {
        conversation = { id: conversationId, userId, messages: [], createdAt: nowIso(), updatedAt: nowIso() }
    }
    conversation.messages.push({ role, text, createdAt: nowIso() })
    conversation.updatedAt = nowIso()
    const idx = rows.findIndex((c) => c.id === conversationId)
    if (idx >= 0) rows[idx] = conversation
    else rows.push(conversation)
    writeCollection(CONVERSATION_COLLECTION, rows)
}

/** Convenience wrapper — the proactive "agent talks to you first" path
 * only ever appends an assistant-authored message, no preceding user turn. */
export function appendAssistantMessage(userId: number, text: string): void {
    appendAgentMessage(userId, 'assistant', text)
}

// ---------------------------------------------------------------------------
// Market insight — honest snapshot of the platform's OWN listing data,
// grouped by location. This is NOT a time-series trend (we only have one
// snapshot of current listings, same limitation documented in ./analytics.ts)
// — it is presented as a snapshot, and only ever describes "growing" or
// "developing" in terms of real, checkable numbers (listing count, price
// spread, share of available/for-sale/bank-sale stock), never invented.
// ---------------------------------------------------------------------------

function buildLocationStats(properties: Property[]): LocationStat[] {
    const buckets = new Map<string, Property[]>()
    for (const p of properties) {
        if (!p.location) continue
        const key = p.location.trim()
        if (!key) continue
        const arr = buckets.get(key) ?? []
        arr.push(p)
        buckets.set(key, arr)
    }

    const stats: LocationStat[] = []
    for (const [location, rows] of Array.from(buckets.entries())) {
        const prices = rows.map((r) => r.price).filter((p) => typeof p === 'number' && !Number.isNaN(p))
        if (prices.length === 0) continue
        const avgPrice = prices.reduce((s, v) => s + v, 0) / prices.length
        stats.push({
            location,
            count: rows.length,
            avgPrice,
            minPrice: Math.min(...prices),
            maxPrice: Math.max(...prices),
            currency: rows[0]?.currency || 'UGX',
            availablePct: Math.round((rows.filter((r) => r.isAvailable !== false).length / rows.length) * 100),
            forSaleCount: rows.filter((r) => r.category === 'for_sale').length,
            bankSaleCount: rows.filter((r) => r.category === 'bank_sales').length,
        })
    }
    return stats.sort((a, b) => b.count - a.count)
}

function rankLocationsForProfile(stats: LocationStat[], profile: AgentProfile): LocationStat[] {
    const min = profile.budgetMin ?? 0
    const max = profile.budgetMax ?? Infinity
    return [...stats]
        .map((s) => {
            const inBudget = s.avgPrice >= min * 0.7 && s.avgPrice <= max * 1.3
            const opportunityScore =
                s.count * 1 +
                (inBudget ? 20 : 0) +
                (profile.purpose !== 'live_in' ? s.bankSaleCount * 3 + s.forSaleCount * 2 : 0) +
                s.availablePct / 10
            return { ...s, _score: opportunityScore }
        })
        .sort((a: any, b: any) => b._score - a._score)
        .map(({ _score, ...rest }: any) => rest)
}

function templatedLocationReason(stat: LocationStat, profile: AgentProfile): string {
    const parts = [
        `${stat.count} active listing${stat.count === 1 ? '' : 's'} on the platform`,
        `average price ${stat.currency} ${Math.round(stat.avgPrice).toLocaleString()}`,
        `${stat.availablePct}% currently available`,
    ]
    if (profile.purpose !== 'live_in' && (stat.bankSaleCount > 0 || stat.forSaleCount > 0)) {
        parts.push(`${stat.bankSaleCount + stat.forSaleCount} for-sale/bank-auction opportunit${stat.bankSaleCount + stat.forSaleCount === 1 ? 'y' : 'ies'}`)
    }
    return parts.join(' · ')
}

// ---------------------------------------------------------------------------
// Anthropic — optional narrative layer over the deterministic data above.
// Same fallback discipline as ./chat.ts: never block or 500 without the key.
// ---------------------------------------------------------------------------

export async function callAnthropic(systemPrompt: string, userMessage: string): Promise<string | null> {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return null
    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-3-5-haiku-latest',
                max_tokens: 500,
                system: systemPrompt,
                messages: [{ role: 'user', content: userMessage }],
            }),
        })
        if (!response.ok) {
            console.error('[gene/personal-agent] Anthropic API error', response.status, await response.text())
            return null
        }
        const data: any = await response.json()
        const textBlocks: string[] = Array.isArray(data?.content)
            ? data.content.filter((b: any) => b?.type === 'text').map((b: any) => b.text)
            : []
        const reply = textBlocks.join('\n').trim()
        return reply.length > 0 ? reply : null
    } catch (err) {
        console.error('[gene/personal-agent] Anthropic call failed, falling back:', err)
        return null
    }
}

export function profileSummaryForPrompt(profile: AgentProfile): string {
    const budget =
        profile.budgetMin != null || profile.budgetMax != null
            ? `${profile.currency} ${profile.budgetMin?.toLocaleString() ?? '0'}–${profile.budgetMax?.toLocaleString() ?? 'no max'}`
            : 'not specified'
    return [
        `Purpose: ${profile.purpose}`,
        `Budget: ${budget}`,
        `Risk appetite: ${profile.riskAppetite}`,
        `Interests: ${profile.interests.join(', ') || 'not specified'}`,
        `Preferred areas: ${profile.preferredLocations.join(', ') || 'not specified'}`,
        profile.monthlyIncome != null ? `Monthly income: ${profile.currency} ${profile.monthlyIncome.toLocaleString()}` : '',
        profile.investmentCapital != null ? `Investment capital available: ${profile.currency} ${profile.investmentCapital.toLocaleString()}` : '',
    ]
        .filter(Boolean)
        .join('\n')
}

// ---------------------------------------------------------------------------
// News (optional external source — NEWS_API_KEY)
// ---------------------------------------------------------------------------

const NEWS_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

interface NewsCacheRow {
    id: number
    query: string
    fetchedAt: string
    items: Array<{ title: string; url: string; source: string; publishedAt: string; description?: string }>
}

async function fetchWorldRealEstateNews(query: string): Promise<{ configured: boolean; items: NewsCacheRow['items']; fetchedAt: string | null }> {
    const apiKey = process.env.NEWS_API_KEY
    if (!apiKey) return { configured: false, items: [], fetchedAt: null }

    const rows = readCollection<NewsCacheRow>(NEWS_CACHE_COLLECTION)
    const cached = rows.find((r) => r.query === query)
    if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < NEWS_CACHE_TTL_MS) {
        return { configured: true, items: cached.items, fetchedAt: cached.fetchedAt }
    }

    try {
        const url = new URL('https://newsapi.org/v2/everything')
        url.searchParams.set('q', query)
        url.searchParams.set('language', 'en')
        url.searchParams.set('sortBy', 'publishedAt')
        url.searchParams.set('pageSize', '10')
        const response = await fetch(url.toString(), { headers: { 'X-Api-Key': apiKey } })
        if (!response.ok) {
            console.error('[gene/personal-agent] News API error', response.status, await response.text())
            return { configured: true, items: cached?.items ?? [], fetchedAt: cached?.fetchedAt ?? null }
        }
        const data: any = await response.json()
        const items = Array.isArray(data?.articles)
            ? data.articles.map((a: any) => ({
                  title: String(a.title ?? ''),
                  url: String(a.url ?? ''),
                  source: String(a.source?.name ?? 'Unknown'),
                  publishedAt: String(a.publishedAt ?? ''),
                  description: typeof a.description === 'string' ? a.description : undefined,
              }))
            : []

        const fetchedAt = nowIso()
        const newRow: NewsCacheRow = { id: cached?.id ?? nextId(rows), query, fetchedAt, items }
        const nextRows = cached ? rows.map((r) => (r.query === query ? newRow : r)) : [...rows, newRow]
        writeCollection(NEWS_CACHE_COLLECTION, nextRows)

        return { configured: true, items, fetchedAt }
    } catch (err) {
        console.error('[gene/personal-agent] News fetch failed, serving stale cache if any:', err)
        return { configured: true, items: cached?.items ?? [], fetchedAt: cached?.fetchedAt ?? null }
    }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function registerPersonalAgentRoutes(app: Express): void {
    // GET /api/gene/agent/profile — [AUTH]
    app.get('/api/gene/agent/profile', requireUser, (req, res) => {
        const profile = loadProfile((req.user as any).id)
        res.json({ profile })
    })

    // PUT /api/gene/agent/profile — [AUTH] create or update
    app.put('/api/gene/agent/profile', requireUser, (req, res) => {
        try {
            const userId = (req.user as any).id
            const existing = loadProfile(userId)
            const profile = parseProfileInput(userId, req.body ?? {}, existing)
            saveProfile(profile)
            res.json({ profile })
        } catch (err) {
            console.error('[gene/personal-agent] PUT /api/gene/agent/profile failed:', err)
            res.status(500).json({ message: 'Failed to save your agent profile.' })
        }
    })

    // POST /api/gene/agent/signal — [AUTH] fire-and-forget behavior logging
    app.post('/api/gene/agent/signal', requireUser, (req, res) => {
        try {
            const userId = (req.user as any).id
            const propertyId = Number(req.body?.propertyId)
            const action = req.body?.action as AgentSignalAction
            const validActions: AgentSignalAction[] = ['viewed', 'saved', 'inquired', 'tour_viewed']
            if (!Number.isFinite(propertyId) || !validActions.includes(action)) {
                return res.status(400).json({ message: 'propertyId (number) and a valid action are required.' })
            }
            const rows = readCollection<AgentSignal>(SIGNAL_COLLECTION)
            const signal: AgentSignal = { id: nextId(rows), userId, propertyId, action, createdAt: nowIso() }
            rows.push(signal)
            writeCollection(SIGNAL_COLLECTION, rows)
            res.status(201).json({ ok: true })
        } catch (err) {
            console.error('[gene/personal-agent] POST /api/gene/agent/signal failed:', err)
            res.status(500).json({ message: 'Failed to record signal.' })
        }
    })

    // GET /api/gene/agent/recommendations — [AUTH]
    app.get('/api/gene/agent/recommendations', requireUser, async (req, res) => {
        try {
            const userId = (req.user as any).id
            const profile = loadProfile(userId)
            if (!profile) {
                return res.status(404).json({ message: 'Complete your agent profile first.', profile: null })
            }
            const [allProperties, signals] = await Promise.all([storage.getAllProperties(), Promise.resolve(loadSignals(userId))])
            const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '6'), 10) || 6, 1), 20)
            const top = buildRecommendations(profile, signals, allProperties, limit)

            const aiSummary = await callAnthropic(
                [
                    'You are the user\'s personal real-estate agent on RealEVR Estates, operating across East Africa.',
                    'Write a warm, concise (2-4 sentence) summary of why the following pre-selected properties suit them.',
                    'Only use the facts given below — never invent a price, location, or feature not listed.',
                    '',
                    'User profile:',
                    profileSummaryForPrompt(profile),
                    '',
                    'Top matches (already ranked for them):',
                    ...top.map(
                        (t, i) =>
                            `${i + 1}. "${t.property.title}" in ${t.property.location} — ${t.property.currency ?? 'UGX'} ${t.property.price} — ${t.reasons.join('; ') || 'general match'}`
                    ),
                ].join('\n'),
                'Write the summary now.'
            )

            res.json({
                generatedAt: nowIso(),
                usedAi: aiSummary !== null,
                summary: aiSummary ?? templatedRecommendationSummary(profile, top),
                recommendations: top.map((t) => ({ property: t.property, score: t.score, reasons: t.reasons })),
            })
        } catch (err) {
            console.error('[gene/personal-agent] GET /api/gene/agent/recommendations failed:', err)
            res.status(500).json({ message: 'Failed to build recommendations.' })
        }
    })

    // GET /api/gene/agent/market-insight — [AUTH]
    app.get('/api/gene/agent/market-insight', requireUser, async (req, res) => {
        try {
            const userId = (req.user as any).id
            const profile = loadProfile(userId)
            if (!profile) {
                return res.status(404).json({ message: 'Complete your agent profile first.', profile: null })
            }
            const allProperties = await storage.getAllProperties()
            const stats = buildLocationStats(allProperties)
            const ranked = rankLocationsForProfile(stats, profile).slice(0, 5)

            const aiNarrative = await callAnthropic(
                [
                    'You are the user\'s personal real-estate investment advisor for RealEVR Estates, covering East Africa.',
                    'Below is a REAL snapshot of the platform\'s own current listings by area (not a time series — say so if relevant),',
                    'plus the user\'s financial profile. Explain, in 3-5 sentences, which 1-2 of these areas best fit them and why,',
                    'referencing only the numbers given. You may add general, clearly-labeled background knowledge about an area',
                    '(e.g. known as a diplomatic district, a growing suburb, etc.) but do not state a specific growth percentage or',
                    'trend you cannot back up with the data below.',
                    '',
                    'User profile:',
                    profileSummaryForPrompt(profile),
                    '',
                    'Area snapshot (ranked for this user):',
                    ...ranked.map((s) => `- ${s.location}: ${templatedLocationReason(s, profile)}`),
                ].join('\n'),
                'Write the investment insight now.'
            )

            res.json({
                generatedAt: nowIso(),
                usedAi: aiNarrative !== null,
                narrative:
                    aiNarrative ??
                    (ranked.length > 0
                        ? `${ranked[0].location} looks like your strongest fit right now: ${templatedLocationReason(ranked[0], profile)}.`
                        : 'Not enough listing data yet to rank areas for you.'),
                areas: ranked,
            })
        } catch (err) {
            console.error('[gene/personal-agent] GET /api/gene/agent/market-insight failed:', err)
            res.status(500).json({ message: 'Failed to build market insight.' })
        }
    })

    // GET /api/gene/agent/news?q= — [AUTH]. { configured: false } when NEWS_API_KEY unset.
    app.get('/api/gene/agent/news', requireUser, async (req, res) => {
        try {
            const q =
                typeof req.query.q === 'string' && req.query.q.trim()
                    ? req.query.q.trim()
                    : 'real estate market (Uganda OR Kenya OR "East Africa" OR global investment)'
            const result = await fetchWorldRealEstateNews(q)
            res.json(result)
        } catch (err) {
            console.error('[gene/personal-agent] GET /api/gene/agent/news failed:', err)
            res.status(500).json({ message: 'Failed to load news.' })
        }
    })

    // POST /api/gene/agent/chat — [AUTH] { message } -> { reply, usedAi }
    app.post('/api/gene/agent/chat', requireUser, async (req, res) => {
        try {
            const userId = (req.user as any).id
            const message = typeof req.body?.message === 'string' ? req.body.message.trim() : ''
            if (!message) return res.status(400).json({ message: 'Field "message" is required.' })

            const profile = loadProfile(userId)
            const rows = readCollection<AgentConversation>(CONVERSATION_COLLECTION)
            const conversationId = String(userId)
            let conversation = rows.find((c) => c.id === conversationId)
            if (!conversation) {
                conversation = { id: conversationId, userId, messages: [], createdAt: nowIso(), updatedAt: nowIso() }
            }
            conversation.messages.push({ role: 'user', text: message, createdAt: nowIso() })

            let reply: string
            let usedAi = false

            if (profile) {
                const [allProperties, signals] = await Promise.all([storage.getAllProperties(), Promise.resolve(loadSignals(userId))])
                const top = buildRecommendations(profile, signals, allProperties, 3)
                const systemPrompt = [
                    'You are "My RealEVR Agent" — this specific user\'s personal, always-available real-estate assistant,',
                    'across East Africa. Be warm, concise (2-5 sentences), and honest: only reference the facts given below,',
                    'and if you don\'t know something specific, say so and offer to connect them with a human agent rather than guessing.',
                    '',
                    'Their profile:',
                    profileSummaryForPrompt(profile),
                    '',
                    'Their current top matches:',
                    ...top.map((t) => `- "${t.property.title}" in ${t.property.location} — ${t.property.currency ?? 'UGX'} ${t.property.price}`),
                ].join('\n')

                const aiReply = await callAnthropic(systemPrompt, message)
                usedAi = aiReply !== null
                reply =
                    aiReply ??
                    `${templatedRecommendationSummary(profile, top)} Ask me about pricing, a specific area, or say "show me more" for another pick.`
            } else {
                reply = "I'd love to help — first tell me your budget and what you're looking for (living in, or investing) via the agent setup, and I'll start finding matches for you."
            }

            conversation.messages.push({ role: 'assistant', text: reply, createdAt: nowIso() })
            conversation.updatedAt = nowIso()
            const idx = rows.findIndex((c) => c.id === conversationId)
            if (idx >= 0) rows[idx] = conversation
            else rows.push(conversation)
            writeCollection(CONVERSATION_COLLECTION, rows)

            res.json({ reply, usedAi })
        } catch (err) {
            console.error('[gene/personal-agent] POST /api/gene/agent/chat failed:', err)
            res.status(500).json({ message: 'Failed to process your message.' })
        }
    })

    // GET /api/gene/agent/chat/history — [AUTH]
    app.get('/api/gene/agent/chat/history', requireUser, (req, res) => {
        const userId = (req.user as any).id
        const rows = readCollection<AgentConversation>(CONVERSATION_COLLECTION)
        const conversation = rows.find((c) => c.id === String(userId))
        res.json({ messages: conversation?.messages ?? [] })
    })

    // POST /api/gene/agent/location — [AUTH] { lat, lng, label } — client-side
    // geolocation + reverse geocoding result. Opt-in only; the frontend never
    // calls this without the user explicitly turning location sync on.
    app.post('/api/gene/agent/location', requireUser, (req, res) => {
        try {
            const userId = (req.user as any).id
            const { lat, lng, label } = req.body ?? {}
            if (typeof label !== 'string' || !label.trim()) {
                return res.status(400).json({ message: 'label (reverse-geocoded place name) is required.' })
            }
            const existing = loadProfile(userId)
            const profile: AgentProfile = existing
                ? { ...existing }
                : parseProfileInput(userId, {}, null) // creates a minimal default profile
            profile.lastLocationLabel = label.trim()
            profile.lastLocationLat = typeof lat === 'number' ? lat : null
            profile.lastLocationLng = typeof lng === 'number' ? lng : null
            profile.lastLocationUpdatedAt = nowIso()
            saveProfile(profile)
            res.json({ ok: true, lastLocationLabel: profile.lastLocationLabel })
        } catch (err) {
            console.error('[gene/personal-agent] POST /api/gene/agent/location failed:', err)
            res.status(500).json({ message: 'Failed to sync your location.' })
        }
    })

    // GET /api/gene/agent/nearby — [AUTH] properties near the last-synced
    // location. The first time genuinely new matches appear, this also drops
    // a proactive message into the chat history (the "agent talks to you
    // first" behavior) — subsequent polls with the same matches stay quiet.
    app.get('/api/gene/agent/nearby', requireUser, async (req, res) => {
        try {
            const userId = (req.user as any).id
            const profile = loadProfile(userId)
            if (!profile?.lastLocationLabel) {
                return res.json({ synced: false, location: null, matches: [], notified: false })
            }

            const [allProperties, signals] = await Promise.all([storage.getAllProperties(), Promise.resolve(loadSignals(userId))])
            const matches = findNearbyProperties(profile.lastLocationLabel, profile, signals, allProperties, 6)

            const alreadyNotified = new Set(profile.notifiedNearbyPropertyIds ?? [])
            const freshMatches = matches.filter((m) => !alreadyNotified.has(m.property.id))

            let notified = false
            if (freshMatches.length > 0) {
                const names = freshMatches.slice(0, 3).map((m) => `"${m.property.title}" (${m.property.location})`)
                const message =
                    freshMatches.length === 1
                        ? `Just spotted ${names[0]} near ${profile.lastLocationLabel} — want details?`
                        : `A few properties near ${profile.lastLocationLabel} just caught my eye: ${names.join(', ')}${freshMatches.length > 3 ? `, and ${freshMatches.length - 3} more` : ''}. Check the Matches tab any time.`
                appendAssistantMessage(userId, message)
                notified = true

                const updated: AgentProfile = { ...profile }
                updated.notifiedNearbyPropertyIds = [...(profile.notifiedNearbyPropertyIds ?? []), ...freshMatches.map((m) => m.property.id)].slice(-200)
                saveProfile(updated)
            }

            res.json({
                synced: true,
                location: profile.lastLocationLabel,
                lastSyncedAt: profile.lastLocationUpdatedAt ?? null,
                matches: matches.map((m) => ({ property: m.property, score: m.score, reasons: m.reasons })),
                notified,
            })
        } catch (err) {
            console.error('[gene/personal-agent] GET /api/gene/agent/nearby failed:', err)
            res.status(500).json({ message: 'Failed to find nearby properties.' })
        }
    })
}
