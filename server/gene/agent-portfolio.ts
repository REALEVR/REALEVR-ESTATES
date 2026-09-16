/**
 * GENE Platform — Agent Portfolio: a shareable, public "mini-website" for
 * each agent, so a prospective tenant/buyer can look at an agent's real
 * track record (their live listings, genuine tenant reviews aggregated
 * across those listings, and articles the agent chooses to write) before
 * ever messaging them — and so the agent has one clean link to post/market
 * themselves with, instead of a bare login-only dashboard.
 *
 * Public surface: GET /api/agents/:username/portfolio — no auth, safe to
 * share anywhere (WhatsApp, Facebook, a business card QR code). Returns
 * 404 for a normal (non-agent, non-admin) account, or one with no
 * portfolio content at all yet, rather than a mostly-empty page.
 *
 * Everything here is additive: no schema change to `users`/`properties`.
 * Bio/tagline/photo/experience/specialties and articles live in their own
 * JSON-file collections (see ./store.ts); properties and reviews are read
 * live from the real storage/Review models already powering the rest of
 * the site, never duplicated, so a portfolio never drifts out of sync with
 * an agent's actual listings or ratings.
 *
 * Image uploads (avatar/cover/article cover) reuse the existing
 * POST /api/upload/property-image route (server/routes.ts) — already
 * gated to admin/agent/property_manager and already uploads to S3; despite
 * its property-specific name it's a generic "upload one image, get a URL
 * back" endpoint, so this doesn't duplicate that S3 plumbing.
 */
import type { Express, Request, Response, NextFunction } from 'express'
import { readCollection, writeCollection, nextId, nowIso } from './store'
import { storage } from '../storage'
import { getReviewsForProperty } from '../models/Review'
import { getCanonicalBaseUrl } from '../sitemap'
import type { Property } from '@shared/schema'

const PORTFOLIO_COLLECTION = 'gene_agent_portfolios'
const ARTICLE_COLLECTION = 'gene_agent_articles'

export interface AgentPortfolio {
    userId: number
    tagline?: string
    bio?: string
    avatarUrl?: string
    coverImageUrl?: string
    /** Free-text tags the agent picks themselves, e.g. "BnBs", "Bank Sales",
     * "Kampala" — deliberately not a fixed enum; this is marketing copy for
     * their own page, not a filter anyone queries by. */
    specialties?: string[]
    yearsExperience?: number
    updatedAt: string
}

export interface AgentArticle {
    id: number
    userId: number
    title: string
    slug: string
    excerpt?: string
    body: string
    coverImageUrl?: string
    published: boolean
    createdAt: string
    updatedAt: string
}

function loadPortfolio(userId: number): AgentPortfolio | undefined {
    return readCollection<AgentPortfolio>(PORTFOLIO_COLLECTION).find((p) => p.userId === userId)
}

function savePortfolio(portfolio: AgentPortfolio): void {
    const rows = readCollection<AgentPortfolio>(PORTFOLIO_COLLECTION)
    const idx = rows.findIndex((p) => p.userId === portfolio.userId)
    if (idx === -1) rows.push(portfolio)
    else rows[idx] = portfolio
    writeCollection(PORTFOLIO_COLLECTION, rows)
}

function slugify(title: string): string {
    const base = title
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    return base || 'post'
}

/** Unique per-agent, not site-wide — two different agents can each have a
 * post slugged "welcome-to-my-page" without colliding, since articles are
 * always addressed as (username, slug) together. */
function uniqueSlug(userId: number, title: string, excludeArticleId?: number): string {
    const base = slugify(title)
    const existing = readCollection<AgentArticle>(ARTICLE_COLLECTION).filter(
        (a) => a.userId === userId && a.id !== excludeArticleId
    )
    let slug = base
    let suffix = 2
    while (existing.some((a) => a.slug === slug)) {
        slug = `${base}-${suffix}`
        suffix += 1
    }
    return slug
}

function requireUser(req: Request, res: Response, next: NextFunction): void {
    if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
        res.status(401).json({ message: 'Sign in first.' })
        return
    }
    next()
}

/** Only agents and admins get a shareable portfolio — a "normal" account
 * managing no listings has nothing to show on one. */
function isPortfolioEligible(role: string | null | undefined): boolean {
    return role === 'agent' || role === 'admin'
}

function toPublicProperty(p: Property) {
    return {
        id: p.id,
        title: p.title,
        location: p.location,
        price: p.price,
        currency: p.currency,
        category: p.category,
        imageUrl: p.imageUrl,
        bedrooms: p.bedrooms,
        bathrooms: p.bathrooms,
        isAvailable: p.isAvailable,
        hasTour: p.hasTour,
        rating: p.rating,
        reviewCount: p.reviewCount,
    }
}

function toPublicArticle(a: AgentArticle) {
    return {
        id: a.id,
        title: a.title,
        slug: a.slug,
        excerpt: a.excerpt,
        body: a.body,
        coverImageUrl: a.coverImageUrl,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
    }
}

/**
 * The one place the public portfolio's data is actually assembled — used by
 * both the public JSON API below AND server/social-preview.ts's bot-facing
 * meta-tag route, so a link-preview card and the page a person actually
 * opens can never disagree about an agent's stats. Returns null for a
 * username that doesn't exist, isn't agent/admin-eligible, or has no
 * portfolio content at all yet (never a mostly-empty page).
 */
export async function getPublicAgentPortfolio(username: string) {
    const user = await storage.getUserByUsername(username)
    if (!user || !isPortfolioEligible(user.role)) return null

    const portfolio = loadPortfolio(user.id)
    const allArticles = readCollection<AgentArticle>(ARTICLE_COLLECTION)
        .filter((a) => a.userId === user.id && a.published)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    const allProperties = await storage.getAllProperties()
    const ownedProperties = allProperties.filter((p) => p.ownerId === user.id && p.isAvailable !== false)

    // Real tenant reviews, aggregated live across every property this agent
    // owns — never a separate, disconnected "agent reviews" system a tenant
    // would have to find and use a second time.
    const reviewLists = await Promise.all(ownedProperties.map((p) => getReviewsForProperty(p.id)))
    const allReviews = reviewLists.flat().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    const propertyTitleById = new Map(ownedProperties.map((p) => [p.id, p.title]))

    const totalReviews = allReviews.length
    const avgRating =
        totalReviews > 0 ? Math.round((allReviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews) * 10) / 10 : 0
    const totalViews = ownedProperties.reduce((sum, p) => sum + (p.viewCount ?? 0), 0)

    // Nothing to show at all — no bio, no properties, no articles — reads
    // as a broken/empty page rather than "not set up yet".
    const hasAnyContent = !!portfolio || ownedProperties.length > 0 || allArticles.length > 0
    if (!hasAnyContent) return null

    return {
        agent: {
            username: user.username,
            fullName: user.fullName,
            companyName: user.companyName || null,
            phoneNumber: user.phoneNumber || null,
            role: user.role,
        },
        portfolio: {
            tagline: portfolio?.tagline || null,
            bio: portfolio?.bio || null,
            avatarUrl: portfolio?.avatarUrl || null,
            coverImageUrl: portfolio?.coverImageUrl || null,
            specialties: portfolio?.specialties || [],
            yearsExperience: portfolio?.yearsExperience ?? null,
        },
        stats: {
            totalProperties: ownedProperties.length,
            avgRating,
            totalReviews,
            totalViews,
        },
        properties: ownedProperties.slice(0, 24).map(toPublicProperty),
        articles: allArticles.map(toPublicArticle),
        reviews: allReviews.slice(0, 12).map((r) => ({
            rating: r.rating,
            comment: r.comment,
            userName: r.userName,
            createdAt: r.createdAt,
            propertyTitle: propertyTitleById.get(r.propertyId) || null,
        })),
        shareUrl: `${getCanonicalBaseUrl()}/agent/${encodeURIComponent(user.username)}`,
    }
}

export function registerAgentPortfolioRoutes(app: Express): void {
    // GET /api/agents/:username/portfolio — [PUBLIC] the whole shareable page's data.
    app.get('/api/agents/:username/portfolio', async (req: Request, res: Response) => {
        try {
            const username = String(req.params.username || '').trim()
            if (!username) return res.status(400).json({ message: 'username is required.' })

            const data = await getPublicAgentPortfolio(username)
            if (!data) return res.status(404).json({ message: 'No agent portfolio at this address.' })
            res.json(data)
        } catch (err) {
            console.error('[gene/agent-portfolio] GET public portfolio failed:', err)
            res.status(500).json({ message: 'Failed to load this portfolio.' })
        }
    })

    // GET /api/agent/portfolio/me — [AUTH] own portfolio + own articles
    // (drafts included) — the dashboard editor's own data source.
    app.get('/api/agent/portfolio/me', requireUser, (req: Request, res: Response) => {
        const user = req.user as any
        const portfolio = loadPortfolio(user.id)
        const articles = readCollection<AgentArticle>(ARTICLE_COLLECTION)
            .filter((a) => a.userId === user.id)
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        res.json({
            portfolio: portfolio || null,
            articles,
            shareUrl: `${getCanonicalBaseUrl()}/agent/${encodeURIComponent(user.username)}`,
        })
    })

    // PUT /api/agent/portfolio — [AUTH] upsert the caller's own bio/tagline/etc.
    app.put('/api/agent/portfolio', requireUser, (req: Request, res: Response) => {
        try {
            const user = req.user as any
            if (!isPortfolioEligible(user.role)) {
                return res.status(403).json({ message: 'Only agent or admin accounts have a portfolio.' })
            }
            const body = req.body ?? {}
            const specialties = Array.isArray(body.specialties)
                ? body.specialties.filter((s: unknown) => typeof s === 'string' && s.trim()).map((s: string) => s.trim())
                : []
            const yearsExperience = Number(body.yearsExperience)

            const portfolio: AgentPortfolio = {
                userId: user.id,
                tagline: typeof body.tagline === 'string' ? body.tagline.trim().slice(0, 140) : undefined,
                bio: typeof body.bio === 'string' ? body.bio.trim().slice(0, 4000) : undefined,
                avatarUrl: typeof body.avatarUrl === 'string' ? body.avatarUrl.trim() : undefined,
                coverImageUrl: typeof body.coverImageUrl === 'string' ? body.coverImageUrl.trim() : undefined,
                specialties: specialties.slice(0, 12),
                yearsExperience: Number.isFinite(yearsExperience) && yearsExperience >= 0 ? Math.round(yearsExperience) : undefined,
                updatedAt: nowIso(),
            }
            savePortfolio(portfolio)
            res.json(portfolio)
        } catch (err) {
            console.error('[gene/agent-portfolio] PUT portfolio failed:', err)
            res.status(500).json({ message: 'Failed to save your portfolio.' })
        }
    })

    // POST /api/agent/portfolio/articles — [AUTH] create an article (draft or published).
    app.post('/api/agent/portfolio/articles', requireUser, (req: Request, res: Response) => {
        try {
            const user = req.user as any
            if (!isPortfolioEligible(user.role)) {
                return res.status(403).json({ message: 'Only agent or admin accounts can write articles.' })
            }
            const title = typeof req.body?.title === 'string' ? req.body.title.trim() : ''
            const bodyText = typeof req.body?.body === 'string' ? req.body.body.trim() : ''
            if (!title) return res.status(400).json({ message: 'title is required.' })
            if (!bodyText) return res.status(400).json({ message: 'body is required.' })

            const rows = readCollection<AgentArticle>(ARTICLE_COLLECTION)
            const now = nowIso()
            const article: AgentArticle = {
                id: nextId(rows),
                userId: user.id,
                title: title.slice(0, 200),
                slug: uniqueSlug(user.id, title),
                excerpt: typeof req.body?.excerpt === 'string' ? req.body.excerpt.trim().slice(0, 300) : undefined,
                body: bodyText.slice(0, 20000),
                coverImageUrl: typeof req.body?.coverImageUrl === 'string' ? req.body.coverImageUrl.trim() : undefined,
                published: req.body?.published === true,
                createdAt: now,
                updatedAt: now,
            }
            rows.push(article)
            writeCollection(ARTICLE_COLLECTION, rows)
            res.status(201).json(article)
        } catch (err) {
            console.error('[gene/agent-portfolio] create article failed:', err)
            res.status(500).json({ message: 'Failed to create the article.' })
        }
    })

    // PUT /api/agent/portfolio/articles/:id — [AUTH, own article only]
    app.put('/api/agent/portfolio/articles/:id', requireUser, (req: Request, res: Response) => {
        try {
            const user = req.user as any
            const id = Number(req.params.id)
            const rows = readCollection<AgentArticle>(ARTICLE_COLLECTION)
            const idx = rows.findIndex((a) => a.id === id)
            if (idx === -1) return res.status(404).json({ message: 'Article not found.' })
            if (rows[idx].userId !== user.id) return res.status(403).json({ message: "You can only edit your own articles." })

            const existing = rows[idx]
            const title = typeof req.body?.title === 'string' && req.body.title.trim() ? req.body.title.trim().slice(0, 200) : existing.title
            const retitled = title !== existing.title

            rows[idx] = {
                ...existing,
                title,
                slug: retitled ? uniqueSlug(user.id, title, existing.id) : existing.slug,
                excerpt: typeof req.body?.excerpt === 'string' ? req.body.excerpt.trim().slice(0, 300) : existing.excerpt,
                body: typeof req.body?.body === 'string' && req.body.body.trim() ? req.body.body.trim().slice(0, 20000) : existing.body,
                coverImageUrl: typeof req.body?.coverImageUrl === 'string' ? req.body.coverImageUrl.trim() : existing.coverImageUrl,
                published: typeof req.body?.published === 'boolean' ? req.body.published : existing.published,
                updatedAt: nowIso(),
            }
            writeCollection(ARTICLE_COLLECTION, rows)
            res.json(rows[idx])
        } catch (err) {
            console.error('[gene/agent-portfolio] update article failed:', err)
            res.status(500).json({ message: 'Failed to update the article.' })
        }
    })

    // DELETE /api/agent/portfolio/articles/:id — [AUTH, own article only]
    app.delete('/api/agent/portfolio/articles/:id', requireUser, (req: Request, res: Response) => {
        try {
            const user = req.user as any
            const id = Number(req.params.id)
            const rows = readCollection<AgentArticle>(ARTICLE_COLLECTION)
            const idx = rows.findIndex((a) => a.id === id)
            if (idx === -1) return res.status(404).json({ message: 'Article not found.' })
            if (rows[idx].userId !== user.id) return res.status(403).json({ message: 'You can only delete your own articles.' })
            rows.splice(idx, 1)
            writeCollection(ARTICLE_COLLECTION, rows)
            res.json({ message: 'Article deleted.' })
        } catch (err) {
            console.error('[gene/agent-portfolio] delete article failed:', err)
            res.status(500).json({ message: 'Failed to delete the article.' })
        }
    })
}
