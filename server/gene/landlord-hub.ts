/**
 * GENE Platform — Landlord Hub: the data behind the landlord "mini app"
 * (see client/src/pages/AgentDashboard.tsx's Inbox/Reviews tabs) — property
 * reviews (no review-content table existed anywhere in the base schema,
 * only a bare `rating`/`reviewCount` pair on `properties`) and an inbox
 * combining interested-tenant signals with WhatsApp messages, both scoped
 * to properties the caller actually owns.
 *
 * Reads (read-only, shared contracts — never redefine the shape):
 *  - `gene_agent_signals`, written by server/gene/personal-agent.ts
 *  - `gene_whatsapp_messages`, written by server/gene/whatsapp-concierge.ts
 *
 * Persistence for reviews: shared JSON-file collection store (./store.ts).
 */
import type { Express, Request, Response } from 'express'
import { readCollection, writeCollection, nextId, nowIso } from './store'
import { storage } from '../storage'

const REVIEW_COLLECTION = 'gene_property_reviews'
const SIGNAL_COLLECTION = 'gene_agent_signals'
const WHATSAPP_MESSAGE_COLLECTION = 'gene_whatsapp_messages'

export interface PropertyReview {
    id: number
    propertyId: number
    reviewerUserId: number
    reviewerName: string
    rating: number // 1-5
    text: string
    createdAt: string
}

interface AgentSignalRow {
    id: number
    userId: number
    propertyId: number
    action: string
    createdAt: string
}

interface WhatsappMessageRow {
    id: number
    phone: string
    direction: 'inbound' | 'outbound'
    text: string
    userId?: number
    matchedPropertyId?: number
    createdAt: string
}

function requireUser(req: Request, res: Response, next: () => void): void {
    if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
        res.status(401).json({ message: 'Sign in first.' })
        return
    }
    next()
}

export function registerLandlordHubRoutes(app: Express): void {
    // POST /api/gene/reviews — [AUTH] any signed-in user reviews a property.
    app.post('/api/gene/reviews', requireUser, (req: Request, res: Response) => {
        try {
            const user = req.user as any
            const propertyId = Number(req.body?.propertyId)
            const rating = Number(req.body?.rating)
            const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''

            if (!Number.isFinite(propertyId)) {
                return res.status(400).json({ message: 'propertyId (number) is required.' })
            }
            if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
                return res.status(400).json({ message: 'rating must be a number from 1 to 5.' })
            }
            if (!text) {
                return res.status(400).json({ message: 'text is required.' })
            }

            const rows = readCollection<PropertyReview>(REVIEW_COLLECTION)
            const review: PropertyReview = {
                id: nextId(rows),
                propertyId,
                reviewerUserId: user.id,
                reviewerName: user.username ?? user.fullName ?? 'RealEVR user',
                rating: Math.round(rating),
                text,
                createdAt: nowIso(),
            }
            rows.push(review)
            writeCollection(REVIEW_COLLECTION, rows)
            res.status(201).json(review)
        } catch (err) {
            console.error('[gene/landlord-hub] POST /api/gene/reviews failed:', err)
            res.status(500).json({ message: 'Failed to save your review.' })
        }
    })

    // GET /api/gene/reviews/property/:id — public.
    app.get('/api/gene/reviews/property/:id', (req: Request, res: Response) => {
        try {
            const propertyId = Number(req.params.id)
            const rows = readCollection<PropertyReview>(REVIEW_COLLECTION)
                .filter((r) => r.propertyId === propertyId)
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            res.json(rows)
        } catch (err) {
            console.error('[gene/landlord-hub] GET /api/gene/reviews/property/:id failed:', err)
            res.status(500).json({ message: 'Failed to load reviews.' })
        }
    })

    // GET /api/gene/landlord/inbox — [AUTH] interested tenants + WhatsApp
    // messages, scoped to properties the caller owns.
    app.get('/api/gene/landlord/inbox', requireUser, async (req: Request, res: Response) => {
        try {
            const user = req.user as any
            const owned = await storage.getPropertiesByOwner(user.id)
            const ownedIds = new Set(owned.map((p) => p.id))
            const propertyById = new Map(owned.map((p) => [p.id, p]))

            if (ownedIds.size === 0) {
                return res.json({ interestedTenants: [], messages: [] })
            }

            const signals = readCollection<AgentSignalRow>(SIGNAL_COLLECTION)
                .filter((s) => ownedIds.has(s.propertyId) && ['inquired', 'saved', 'tour_viewed', 'viewed'].includes(s.action))
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .slice(0, 100)

            const interestedTenants = await Promise.all(
                signals.map(async (s) => {
                    const tenant = await storage.getUser(s.userId).catch(() => undefined)
                    return {
                        propertyId: s.propertyId,
                        propertyTitle: propertyById.get(s.propertyId)?.title ?? `Property #${s.propertyId}`,
                        action: s.action,
                        createdAt: s.createdAt,
                        tenantName: tenant?.username ?? tenant?.fullName ?? `User #${s.userId}`,
                        tenantEmail: tenant?.email ?? null,
                    }
                })
            )

            const messages = readCollection<WhatsappMessageRow>(WHATSAPP_MESSAGE_COLLECTION)
                .filter((m) => m.matchedPropertyId !== undefined && ownedIds.has(m.matchedPropertyId))
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .slice(0, 100)
                .map((m) => ({
                    ...m,
                    propertyTitle: m.matchedPropertyId ? propertyById.get(m.matchedPropertyId)?.title ?? null : null,
                }))

            res.json({ interestedTenants, messages })
        } catch (err) {
            console.error('[gene/landlord-hub] GET /api/gene/landlord/inbox failed:', err)
            res.status(500).json({ message: 'Failed to load your inbox.' })
        }
    })

    // GET /api/gene/landlord/reviews — [AUTH] reviews for properties the caller owns.
    app.get('/api/gene/landlord/reviews', requireUser, async (req: Request, res: Response) => {
        try {
            const user = req.user as any
            const owned = await storage.getPropertiesByOwner(user.id)
            const ownedIds = new Set(owned.map((p) => p.id))
            const propertyById = new Map(owned.map((p) => [p.id, p]))

            const reviews = readCollection<PropertyReview>(REVIEW_COLLECTION)
                .filter((r) => ownedIds.has(r.propertyId))
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((r) => ({ ...r, propertyTitle: propertyById.get(r.propertyId)?.title ?? `Property #${r.propertyId}` }))

            res.json(reviews)
        } catch (err) {
            console.error('[gene/landlord-hub] GET /api/gene/landlord/reviews failed:', err)
            res.status(500).json({ message: 'Failed to load reviews for your properties.' })
        }
    })
}
