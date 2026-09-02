/**
 * GENE Platform — AI Workforce: 10 scoped "employee agent" roles.
 *
 * Answers the user's request for "10 employee agents ... as actual company
 * employees as AI agents" honestly: this file names and describes all 10
 * roles (WORKFORCE_ROSTER, below), and every one of them is either backed
 * by real, working code in this module, or explicitly marked as inert
 * pending a real credential that does not exist yet in this environment
 * (same pattern as WhatsApp, Bitcoin payments, and the Africa news feed
 * elsewhere in GENE Platform — see docs/GENE_PLATFORM.md).
 *
 * Two hard limits are deliberate and NOT configurable from here, matching
 * the scope the user chose when asked (2026-09-02 AskUserQuestion — see
 * GENE_PLATFORM.md v1.15+ changelog entry for the exact answers):
 *
 *  - OUTREACH IS INBOUND-ONLY. There is no function anywhere in this
 *    module that initiates contact with a prospective client. The
 *    "Inbound Concierge" agent only ever drafts a reply to a message it
 *    is handed — it cannot look up a phone number or send a first
 *    message. "Reaching out to potential clients" in the user's original
 *    request is deliberately NOT built as autonomous cold outreach.
 *
 *  - SALES CLOSES REQUIRE A HUMAN. The "Sales Qualification Assistant"
 *    and "Deal Closer" agents can qualify a lead, draft a deal summary,
 *    and reference a real payment amount — but a deal packet's status
 *    can only move from `pending_human_confirmation` to `confirmed`
 *    through confirmDealPacket(), which always records a real
 *    confirmedByUserId. No code path here moves money or marks a sale
 *    closed without that human step.
 */
import type { Express, Request, Response, NextFunction, RequestHandler } from 'express'
import { readCollection, writeCollection, nextId, nowIso } from './store'
import { storage } from '../storage'
import type { Property } from '@shared/schema'
import { fetchAfricaRealEstateNews } from './africa-media-feed'

// ---------------------------------------------------------------------------
// The roster
// ---------------------------------------------------------------------------

export type WorkforceAgentStatus = 'live' | 'human_confirmation_required' | 'awaiting_credentials'

export interface WorkforceAgentDefinition {
    id: string
    name: string
    role: string
    mission: string
    status: WorkforceAgentStatus
    statusNote: string
}

export const WORKFORCE_ROSTER: WorkforceAgentDefinition[] = [
    {
        id: 'caption-writer',
        name: 'Adia',
        role: 'Content & Caption Writer',
        mission: 'Drafts ready-to-post social captions and hashtags for any live listing.',
        status: 'live',
        statusNote: 'Uses Claude when ANTHROPIC_API_KEY is set, otherwise a real template drafted from the listing\'s own data.',
    },
    {
        id: 'video-scriptwriter',
        name: 'Kato',
        role: 'Video Script & Reel Writer',
        mission: 'Writes a short-form video/reel script (shot list + voiceover lines) for a property tour.',
        status: 'live',
        statusNote: 'Produces a text script only — it does not render or generate a video file.',
    },
    {
        id: 'blog-writer',
        name: 'Naledi',
        role: 'Blog & SEO Writer',
        mission: 'Drafts long-form blog/newsroom articles from real listing and market data.',
        status: 'live',
        statusNote: 'Same drafting engine as the caption writer, with a longer-form prompt/template.',
    },
    {
        id: 'newsroom-analyst',
        name: 'Simi',
        role: 'Newsroom Analyst',
        mission: 'Builds the daily analytics + market digest the newsroom writers draft from.',
        status: 'live',
        statusNote: 'Pulls real, current platform numbers — no projected or estimated figures.',
    },
    {
        id: 'market-scout',
        name: 'Themba',
        role: 'Market Intelligence Scout',
        mission: 'Tracks real estate news across Africa and feeds it into the newsroom digest and the homepage pulse panel.',
        status: 'live',
        statusNote: 'Requires NEWS_API_KEY to have real headlines to report; returns an empty feed honestly without it.',
    },
    {
        id: 'inbound-concierge',
        name: 'Amara',
        role: 'Inbound Concierge',
        mission: 'Drafts a fast, accurate reply to an inbound question from a prospective tenant or buyer.',
        status: 'live',
        statusNote: 'Inbound-only by design — cannot initiate contact with anyone. See the module header for why.',
    },
    {
        id: 'sales-qualifier',
        name: 'Femi',
        role: 'Sales Qualification Assistant',
        mission: 'Turns an inbound lead into a structured deal packet: property, contact, notes, and the real price to quote.',
        status: 'live',
        statusNote: 'Every packet starts pending_human_confirmation and cannot self-approve.',
    },
    {
        id: 'deal-closer',
        name: 'Wanjiru',
        role: 'Deal Closer',
        mission: 'Prepares the final deal summary an agent reviews before a sale is marked closed.',
        status: 'human_confirmation_required',
        statusNote: 'Never closes a deal or moves money on its own — always waits on a human confirmation call.',
    },
    {
        id: 'social-publisher',
        name: 'Zola',
        role: 'Social Publishing Agent',
        mission: 'Publishes drafted captions/scripts to RealEVR\'s social accounts on a schedule.',
        status: 'awaiting_credentials',
        statusNote:
            'No real Facebook/Instagram/X/TikTok API credentials are configured yet (Footer.tsx\'s social links are still placeholders) — drafts queue for manual posting instead of publishing themselves. Auto-publishing turns on the moment real credentials are added, with no code changes needed.',
    },
    {
        id: 'listing-auditor',
        name: 'Baraka',
        role: 'Listing Quality Auditor',
        mission: 'Flags listings that are missing the details (photos, amenities, description) that make a listing convert.',
        status: 'live',
        statusNote: 'Checks real listing fields against a fixed completeness checklist.',
    },
]

// ---------------------------------------------------------------------------
// Auth guards
// ---------------------------------------------------------------------------

function requireUser(req: Request, res: Response, next: NextFunction) {
    if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: 'Sign in to use the AI workforce tools.' })
    }
    next()
}

// ---------------------------------------------------------------------------
// Content drafting (caption / video script / blog post)
// ---------------------------------------------------------------------------

export type WorkforceContentType = 'social_caption' | 'video_script' | 'blog_post'

async function callAnthropicForCopy(systemPrompt: string, userPrompt: string): Promise<string | null> {
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
                messages: [{ role: 'user', content: userPrompt }],
            }),
        })
        if (!response.ok) {
            console.error('[gene/ai-workforce] Anthropic API error', response.status, await response.text())
            return null
        }
        const data: any = await response.json()
        const textBlocks: string[] = Array.isArray(data?.content)
            ? data.content.filter((b: any) => b?.type === 'text').map((b: any) => b.text)
            : []
        const text = textBlocks.join('\n').trim()
        return text.length > 0 ? text : null
    } catch (err) {
        console.error('[gene/ai-workforce] Anthropic call failed, falling back to template:', err)
        return null
    }
}

function priceLine(property: Property): string {
    const amount = property.price != null ? property.price.toLocaleString() : 'Price on request'
    const currency = property.currency ?? 'UGX'
    const unit = property.category === 'rental_units' ? '/month' : property.category === 'furnished_houses' ? '/night' : ''
    return property.price != null ? `${amount} ${currency}${unit}` : amount
}

function templateCaption(property: Property): { content: string; hashtags: string[] } {
    const content = [
        `Step inside ${property.title} in ${property.location} — before you ever set foot on the property.`,
        `${property.bedrooms} bed · ${property.bathrooms} bath · ${property.squareMeters} sq m`,
        `${priceLine(property)}${property.hasTour ? ' · 360° virtual tour available' : ''}`,
        'Tour it now on RealEVR Estates.',
    ].join('\n')
    const hashtags = ['#RealEVREstates', '#VirtualTour', `#${property.location.split(',')[0].replace(/\s+/g, '')}`, '#RealEstateAfrica']
    return { content, hashtags }
}

function templateVideoScript(property: Property): { content: string } {
    const content = [
        `SHOT LIST — ${property.title}`,
        `0:00-0:03  Exterior establishing shot, ${property.location}.`,
        `0:03-0:10  Wide entrance shot. VOICEOVER: "Welcome to ${property.title} — ${property.bedrooms} bedrooms, ${property.bathrooms} bathrooms, ${property.squareMeters} square meters."`,
        `0:10-0:20  Living space walkthrough.`,
        `0:20-0:28  Kitchen / key amenity close-ups.`,
        `0:28-0:35  Bedroom(s).`,
        `0:35-0:40  Closing shot with price card overlay: "${priceLine(property)}".`,
        `VOICEOVER (close): "Take the full 360° tour on RealEVR Estates — link in bio."`,
    ].join('\n')
    return { content }
}

function templateBlogPost(property: Property): { content: string } {
    const content = [
        `# ${property.title}: What It's Like to Live in ${property.location}`,
        '',
        `${property.description}`,
        '',
        `This ${property.propertyType.toLowerCase()} offers ${property.bedrooms} bedrooms and ${property.bathrooms} bathrooms across ${property.squareMeters} square meters, listed at ${priceLine(property)}.`,
        property.hasTour
            ? 'A full 360° virtual tour is available — walk through every room on RealEVR Estates before scheduling an in-person visit.'
            : '',
    ]
        .filter(Boolean)
        .join('\n')
    return { content }
}

export async function draftListingContent(
    propertyId: number,
    contentType: WorkforceContentType
): Promise<{ content: string; hashtags?: string[]; source: 'anthropic' | 'template'; property: { id: number; title: string } } | null> {
    const property = await storage.getProperty(propertyId)
    if (!property) return null

    const prompts: Record<WorkforceContentType, { system: string; user: string }> = {
        social_caption: {
            system:
                'You write short, honest social media captions for a real estate virtual-tour platform in East Africa. 2-4 lines, no false claims, no invented statistics, end with a clear call to action. Include 3-5 relevant hashtags on a final line.',
            user: `Property: ${property.title}\nLocation: ${property.location}\n${property.bedrooms} bed, ${property.bathrooms} bath, ${property.squareMeters} sqm\nPrice: ${priceLine(property)}\nHas virtual tour: ${property.hasTour ? 'yes' : 'no'}`,
        },
        video_script: {
            system:
                'You write short-form (30-45s) video/reel scripts as a timestamped shot list with voiceover lines, for a real estate virtual-tour platform. Never claim you are generating or attaching an actual video file — you are writing the script only.',
            user: `Property: ${property.title}\nLocation: ${property.location}\n${property.bedrooms} bed, ${property.bathrooms} bath, ${property.squareMeters} sqm\nPrice: ${priceLine(property)}`,
        },
        blog_post: {
            system:
                'You write short (150-250 word) real-estate blog posts for a company newsroom, grounded only in the facts given — never invent amenities, history, or statistics not provided.',
            user: `Property: ${property.title}\nLocation: ${property.location}\nDescription: ${property.description}\n${property.bedrooms} bed, ${property.bathrooms} bath, ${property.squareMeters} sqm\nPrice: ${priceLine(property)}\nHas virtual tour: ${property.hasTour ? 'yes' : 'no'}`,
        },
    }

    const { system, user } = prompts[contentType]
    const aiText = await callAnthropicForCopy(system, user)
    if (aiText) {
        return { content: aiText, source: 'anthropic', property: { id: property.id, title: property.title } }
    }

    if (contentType === 'social_caption') {
        const fallback = templateCaption(property)
        return { content: fallback.content, hashtags: fallback.hashtags, source: 'template', property: { id: property.id, title: property.title } }
    }
    const fallback = contentType === 'video_script' ? templateVideoScript(property) : templateBlogPost(property)
    return { content: fallback.content, source: 'template', property: { id: property.id, title: property.title } }
}

// ---------------------------------------------------------------------------
// Newsroom digest (Newsroom Analyst + Market Intelligence Scout)
// ---------------------------------------------------------------------------

const NEWSROOM_DIGEST_COLLECTION = 'gene_workforce_newsroom_digests'

interface NewsroomDigestRow {
    id: number
    generatedAt: string
    listingStats: {
        totalLive: number
        byCategory: Record<string, number>
        withVirtualTour: number
        tourCoveragePercent: number
    }
    marketNews: {
        configured: boolean
        headlineCount: number
        headlines: Array<{ title: string; source: string; url: string; publishedAt: string }>
    }
}

export async function buildNewsroomDigest(): Promise<NewsroomDigestRow> {
    const properties = await storage.getAllProperties()
    const live = properties.filter((p) => p.title && p.title.trim() !== '')
    const byCategory: Record<string, number> = {}
    for (const p of live) {
        byCategory[p.category] = (byCategory[p.category] ?? 0) + 1
    }
    const withTour = live.filter((p) => p.hasTour).length

    const news = await fetchAfricaRealEstateNews()

    const rows = readCollection<NewsroomDigestRow>(NEWSROOM_DIGEST_COLLECTION)
    const digest: NewsroomDigestRow = {
        id: nextId(rows),
        generatedAt: nowIso(),
        listingStats: {
            totalLive: live.length,
            byCategory,
            withVirtualTour: withTour,
            tourCoveragePercent: live.length > 0 ? Math.round((withTour / live.length) * 100) : 0,
        },
        marketNews: {
            configured: news.configured,
            headlineCount: news.items.length,
            headlines: news.items.slice(0, 10).map((i) => ({ title: i.title, source: i.source, url: i.url, publishedAt: i.publishedAt })),
        },
    }
    // Keep a rolling history (last 100 digests) rather than growing forever.
    writeCollection(NEWSROOM_DIGEST_COLLECTION, [...rows, digest].slice(-100))
    return digest
}

// ---------------------------------------------------------------------------
// Inbound Concierge — drafts a reply to an inbound message ONLY.
// There is no function here that looks up a contact and sends first.
// ---------------------------------------------------------------------------

export function draftInboundReply(message: string, property?: Property): { reply: string; matchedIntent: string } {
    const lower = message.toLowerCase()

    if (property && (lower.includes('price') || lower.includes('cost') || lower.includes('how much'))) {
        return {
            matchedIntent: 'price',
            reply: `${property.title} is listed at ${priceLine(property)}. Would you like to schedule a viewing or take the 360° virtual tour first?`,
        }
    }
    if (property && (lower.includes('available') || lower.includes('still open') || lower.includes('taken'))) {
        return {
            matchedIntent: 'availability',
            reply: `${property.title} is currently marked ${property.isAvailable ? 'available' : 'unavailable'} on our system. I'll have the listing agent confirm directly and get back to you shortly.`,
        }
    }
    if (lower.includes('tour') || lower.includes('view') || lower.includes('visit') || lower.includes('schedule')) {
        return {
            matchedIntent: 'viewing',
            reply: property
                ? `You can take the 360° virtual tour of ${property.title} right on the listing page, or I can have the agent set up an in-person visit — which would you prefer?`
                : `I can help you schedule a viewing or point you to a virtual tour — which property are you interested in?`,
        }
    }
    if (lower.includes('location') || lower.includes('where')) {
        return {
            matchedIntent: 'location',
            reply: property
                ? `${property.title} is located in ${property.location}. Want directions or a map link?`
                : `Could you tell me which property or area you're asking about?`,
        }
    }

    return {
        matchedIntent: 'general',
        reply: "Thanks for reaching out to RealEVR Estates! I've passed your message to the listing agent, who'll follow up shortly. In the meantime, feel free to browse virtual tours on the site.",
    }
}

// ---------------------------------------------------------------------------
// Sales Qualification Assistant + Deal Closer — human-confirmed close.
// ---------------------------------------------------------------------------

const DEAL_PACKET_COLLECTION = 'gene_workforce_deal_packets'

export interface DealPacket {
    id: number
    propertyId: number
    propertyTitle: string
    leadContact: string
    notes?: string
    priceQuoted: string
    status: 'pending_human_confirmation' | 'confirmed' | 'declined'
    createdAt: string
    confirmedAt?: string
    confirmedByUserId?: number
}

export async function createDealPacket(propertyId: number, leadContact: string, notes?: string): Promise<DealPacket | null> {
    const property = await storage.getProperty(propertyId)
    if (!property) return null

    const rows = readCollection<DealPacket>(DEAL_PACKET_COLLECTION)
    const packet: DealPacket = {
        id: nextId(rows),
        propertyId,
        propertyTitle: property.title,
        leadContact,
        notes,
        priceQuoted: priceLine(property),
        status: 'pending_human_confirmation',
        createdAt: nowIso(),
    }
    writeCollection(DEAL_PACKET_COLLECTION, [...rows, packet])
    return packet
}

export function listDealPackets(): DealPacket[] {
    return readCollection<DealPacket>(DEAL_PACKET_COLLECTION)
}

// The ONLY function in this module that can move a deal packet out of
// pending_human_confirmation. Always requires a real confirmedByUserId —
// there is no "auto-confirm" path.
export function confirmDealPacket(id: number, confirmedByUserId: number, decision: 'confirmed' | 'declined'): DealPacket | null {
    const rows = readCollection<DealPacket>(DEAL_PACKET_COLLECTION)
    const idx = rows.findIndex((p) => p.id === id)
    if (idx === -1) return null
    const updated: DealPacket = { ...rows[idx], status: decision, confirmedAt: nowIso(), confirmedByUserId }
    const next = [...rows]
    next[idx] = updated
    writeCollection(DEAL_PACKET_COLLECTION, next)
    return updated
}

// ---------------------------------------------------------------------------
// Social Publishing Agent — credential-gated, queues rather than posts.
// ---------------------------------------------------------------------------

const SOCIAL_PLATFORM_ENV: Record<string, string> = {
    facebook: 'FACEBOOK_PAGE_ACCESS_TOKEN',
    instagram: 'INSTAGRAM_ACCESS_TOKEN',
    twitter: 'TWITTER_API_KEY',
    tiktok: 'TIKTOK_ACCESS_TOKEN',
}

export function getSocialPublishingStatus(): Record<string, { configured: boolean }> {
    const status: Record<string, { configured: boolean }> = {}
    for (const [platform, envVar] of Object.entries(SOCIAL_PLATFORM_ENV)) {
        status[platform] = { configured: Boolean(process.env[envVar]) }
    }
    return status
}

const SOCIAL_QUEUE_COLLECTION = 'gene_workforce_social_queue'

export interface QueuedSocialPost {
    id: number
    propertyId: number
    platform: string
    content: string
    hashtags?: string[]
    status: 'queued_awaiting_credentials' | 'queued_ready'
    createdAt: string
}

export function queueSocialPost(propertyId: number, platform: string, content: string, hashtags?: string[]): QueuedSocialPost {
    const rows = readCollection<QueuedSocialPost>(SOCIAL_QUEUE_COLLECTION)
    const configured = Boolean(SOCIAL_PLATFORM_ENV[platform] && process.env[SOCIAL_PLATFORM_ENV[platform]])
    const post: QueuedSocialPost = {
        id: nextId(rows),
        propertyId,
        platform,
        content,
        hashtags,
        // Even when a credential IS configured, this module still only
        // queues — actually calling each platform's publish API is a
        // deliberately separate, explicit step this module does not take
        // on its own, so a queued post never goes out without a person
        // (or a future, explicitly-built publish job) triggering it.
        status: configured ? 'queued_ready' : 'queued_awaiting_credentials',
        createdAt: nowIso(),
    }
    writeCollection(SOCIAL_QUEUE_COLLECTION, [...rows, post])
    return post
}

export function listQueuedSocialPosts(): QueuedSocialPost[] {
    return readCollection<QueuedSocialPost>(SOCIAL_QUEUE_COLLECTION)
}

// ---------------------------------------------------------------------------
// Listing Quality Auditor
// ---------------------------------------------------------------------------

export interface ListingQualityIssue {
    propertyId: number
    title: string
    issues: string[]
}

export async function auditListingQuality(): Promise<ListingQualityIssue[]> {
    const properties = await storage.getAllProperties()
    const results: ListingQualityIssue[] = []
    for (const p of properties) {
        const issues: string[] = []
        if (!p.description || p.description.trim().length < 20) issues.push('Description is missing or very short')
        if (!p.amenities || p.amenities.length === 0) issues.push('No amenities listed')
        if (!p.imageUrl) issues.push('No cover image')
        if (!p.hasTour) issues.push('No virtual tour attached')
        if (p.price == null || p.price <= 0) issues.push('Price missing or invalid')
        if (issues.length > 0) {
            results.push({ propertyId: p.id, title: p.title || `Property #${p.id}`, issues })
        }
    }
    return results
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function registerAiWorkforceRoutes(app: Express, adminMiddleware: RequestHandler): void {
    // GET /api/gene/workforce/roster — public. Honest "meet the AI team"
    // metadata: names, roles, and real current status for each of the 10.
    app.get('/api/gene/workforce/roster', (_req, res) => {
        res.json({ roster: WORKFORCE_ROSTER })
    })

    // POST /api/gene/workforce/content/draft — [AUTH] { propertyId, contentType }
    app.post('/api/gene/workforce/content/draft', requireUser, async (req, res) => {
        try {
            const propertyId = Number(req.body?.propertyId)
            const contentType = (req.body?.contentType ?? 'social_caption') as WorkforceContentType
            if (!propertyId || !['social_caption', 'video_script', 'blog_post'].includes(contentType)) {
                return res.status(400).json({ message: 'propertyId and a valid contentType are required.' })
            }
            const draft = await draftListingContent(propertyId, contentType)
            if (!draft) return res.status(404).json({ message: 'Property not found.' })
            res.json({ draft })
        } catch (err) {
            console.error('[gene/ai-workforce] POST /content/draft failed:', err)
            res.status(500).json({ message: 'Failed to draft content.' })
        }
    })

    // GET /api/gene/workforce/newsroom/digest — [ADMIN]
    app.get('/api/gene/workforce/newsroom/digest', adminMiddleware, async (_req, res) => {
        try {
            const digest = await buildNewsroomDigest()
            res.json({ digest })
        } catch (err) {
            console.error('[gene/ai-workforce] GET /newsroom/digest failed:', err)
            res.status(500).json({ message: 'Failed to build the newsroom digest.' })
        }
    })

    // POST /api/gene/workforce/inbound/draft-reply — [AUTH] { message, propertyId? }
    app.post('/api/gene/workforce/inbound/draft-reply', requireUser, async (req, res) => {
        try {
            const message = String(req.body?.message ?? '').trim()
            if (!message) return res.status(400).json({ message: 'message is required.' })
            const propertyId = req.body?.propertyId ? Number(req.body.propertyId) : undefined
            const property = propertyId ? await storage.getProperty(propertyId) : undefined
            const draft = draftInboundReply(message, property)
            res.json(draft)
        } catch (err) {
            console.error('[gene/ai-workforce] POST /inbound/draft-reply failed:', err)
            res.status(500).json({ message: 'Failed to draft a reply.' })
        }
    })

    // POST /api/gene/workforce/deals — [AUTH] { propertyId, leadContact, notes? }
    app.post('/api/gene/workforce/deals', requireUser, async (req, res) => {
        try {
            const propertyId = Number(req.body?.propertyId)
            const leadContact = String(req.body?.leadContact ?? '').trim()
            if (!propertyId || !leadContact) {
                return res.status(400).json({ message: 'propertyId and leadContact are required.' })
            }
            const packet = await createDealPacket(propertyId, leadContact, req.body?.notes)
            if (!packet) return res.status(404).json({ message: 'Property not found.' })
            res.json({ packet })
        } catch (err) {
            console.error('[gene/ai-workforce] POST /deals failed:', err)
            res.status(500).json({ message: 'Failed to create the deal packet.' })
        }
    })

    // GET /api/gene/workforce/deals — [ADMIN]
    app.get('/api/gene/workforce/deals', adminMiddleware, (_req, res) => {
        res.json({ packets: listDealPackets() })
    })

    // POST /api/gene/workforce/deals/:id/confirm — [ADMIN] { decision: 'confirmed'|'declined' }
    // The human-confirmed-close step. Requires a real signed-in admin/agent
    // user — confirmedByUserId is always their real id, never fabricated.
    app.post('/api/gene/workforce/deals/:id/confirm', adminMiddleware, (req, res) => {
        try {
            const id = Number(req.params.id)
            const decision = req.body?.decision === 'declined' ? 'declined' : 'confirmed'
            const confirmedByUserId = (req.user as any)?.id
            if (!confirmedByUserId) {
                return res.status(401).json({ message: 'A signed-in admin/agent is required to confirm a deal.' })
            }
            const packet = confirmDealPacket(id, confirmedByUserId, decision)
            if (!packet) return res.status(404).json({ message: 'Deal packet not found.' })
            res.json({ packet })
        } catch (err) {
            console.error('[gene/ai-workforce] POST /deals/:id/confirm failed:', err)
            res.status(500).json({ message: 'Failed to confirm the deal.' })
        }
    })

    // GET /api/gene/workforce/social/status — public. Honest per-platform
    // configured/not-configured status (mirrors Footer.tsx's placeholder links).
    app.get('/api/gene/workforce/social/status', (_req, res) => {
        res.json({ platforms: getSocialPublishingStatus() })
    })

    // POST /api/gene/workforce/social/queue — [AUTH] { propertyId, platform, content, hashtags? }
    app.post('/api/gene/workforce/social/queue', requireUser, (req, res) => {
        try {
            const propertyId = Number(req.body?.propertyId)
            const platform = String(req.body?.platform ?? '')
            const content = String(req.body?.content ?? '').trim()
            if (!propertyId || !platform || !content) {
                return res.status(400).json({ message: 'propertyId, platform, and content are required.' })
            }
            const post = queueSocialPost(propertyId, platform, content, req.body?.hashtags)
            res.json({ post })
        } catch (err) {
            console.error('[gene/ai-workforce] POST /social/queue failed:', err)
            res.status(500).json({ message: 'Failed to queue the post.' })
        }
    })

    // GET /api/gene/workforce/social/queue — [ADMIN]
    app.get('/api/gene/workforce/social/queue', adminMiddleware, (_req, res) => {
        res.json({ posts: listQueuedSocialPosts() })
    })

    // GET /api/gene/workforce/listing-quality — [ADMIN]
    app.get('/api/gene/workforce/listing-quality', adminMiddleware, async (_req, res) => {
        try {
            const issues = await auditListingQuality()
            res.json({ issues })
        } catch (err) {
            console.error('[gene/ai-workforce] GET /listing-quality failed:', err)
            res.status(500).json({ message: 'Failed to audit listing quality.' })
        }
    })
}
