/**
 * GENE Platform — public listings API for third-party property management apps.
 *
 * VERSIONING / DOCS APPROACH: this is v1 of the partner API, currently served
 * unversioned at `/api/gene/partner/...` per the product plan's MVP-first
 * approach (ship something real to integrate against before over-engineering
 * a version scheme nobody has asked for yet). Once a breaking change is
 * needed, the plan is to path-version going forward, e.g.
 * `/api/gene/partner/v1/...` -> `/api/gene/partner/v2/...`, with the
 * unversioned prefix kept as an alias for v1 for backward compatibility.
 * Partner-facing docs live in docs/GENE_PLATFORM.md.
 *
 * Persistence: shared JSON-file collection store (see ./store.ts), collection
 * `gene_partner_keys`. Real listing data comes from the actual `storage`
 * singleton (server/storage.ts) — this module never invents fake data.
 */
import type { Express, Request, Response, NextFunction, RequestHandler } from 'express'
import crypto from 'crypto'
import { readCollection, writeCollection, nextId, nowIso } from './store'
import { storage } from '../storage'

const COLLECTION = 'gene_partner_keys'
const DEFAULT_RATE_LIMIT_PER_MINUTE = 60

export interface PartnerKeyRecord {
    id: number
    key: string // sha256 hash of the raw key — the raw key is NEVER stored
    partnerName: string
    createdAt: string
    revoked: boolean
    rateLimitPerMinute: number
}

function hashKey(rawKey: string): string {
    return crypto.createHash('sha256').update(rawKey).digest('hex')
}

// In-memory sliding-window rate limiter, keyed by hashed API key.
// Fine for a single-process deployment; if this ever runs multi-process,
// this state (like all in-memory rate limiting) would need to move to a
// shared store — noted here rather than silently assumed.
const requestLog = new Map<string, number[]>()

function isOverRateLimit(keyHash: string, limitPerMinute: number): boolean {
    const now = Date.now()
    const windowStart = now - 60_000
    const timestamps = (requestLog.get(keyHash) ?? []).filter((t) => t > windowStart)
    timestamps.push(now)
    requestLog.set(keyHash, timestamps)
    return timestamps.length > limitPerMinute
}

/** Exported for reuse within this file's own router only. */
export function requirePartnerKey(req: Request, res: Response, next: NextFunction): void {
    try {
        const rawKey = req.header('x-gene-api-key')
        if (!rawKey) {
            res.status(401).json({ message: 'Missing x-gene-api-key header' })
            return
        }

        const keyHash = hashKey(rawKey)
        const rows = readCollection<PartnerKeyRecord>(COLLECTION)
        const match = rows.find((r) => r.key === keyHash && !r.revoked)
        if (!match) {
            res.status(401).json({ message: 'Invalid or revoked API key' })
            return
        }

        if (isOverRateLimit(keyHash, match.rateLimitPerMinute)) {
            res.status(429).json({ message: 'Rate limit exceeded' })
            return
        }

        next()
    } catch (error: any) {
        console.error('[gene/listings-api] requirePartnerKey failed:', error)
        res.status(500).json({ message: 'Authentication check failed' })
    }
}

function toPublicListing(property: any) {
    return {
        id: property.id,
        title: property.title,
        price: property.price,
        currency: property.currency,
        location: property.location,
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        available: Boolean(property.isAvailable),
        ...(property.imageUrl ? { imageUrl: property.imageUrl } : {}),
    }
}

export function registerListingsApiRoutes(app: Express, adminMiddleware: RequestHandler): void {
    // --- Partner API key management (admin only) ---

    app.post('/api/gene/partner-keys', adminMiddleware, (req: Request, res: Response) => {
        try {
            const { partnerName, rateLimitPerMinute } = req.body ?? {}
            if (typeof partnerName !== 'string' || !partnerName.trim()) {
                return res.status(400).json({ message: 'partnerName is required' })
            }

            const rawKey = crypto.randomBytes(32).toString('hex')
            const rows = readCollection<PartnerKeyRecord>(COLLECTION)
            const record: PartnerKeyRecord = {
                id: nextId(rows),
                key: hashKey(rawKey),
                partnerName: partnerName.trim(),
                createdAt: nowIso(),
                revoked: false,
                rateLimitPerMinute:
                    typeof rateLimitPerMinute === 'number' && rateLimitPerMinute > 0
                        ? rateLimitPerMinute
                        : DEFAULT_RATE_LIMIT_PER_MINUTE,
            }
            rows.push(record)
            writeCollection(COLLECTION, rows)

            // Raw key is returned exactly once — the hash is all that's persisted.
            res.status(201).json({
                id: record.id,
                partnerName: record.partnerName,
                apiKey: rawKey,
                rateLimitPerMinute: record.rateLimitPerMinute,
                createdAt: record.createdAt,
            })
        } catch (error: any) {
            console.error('[gene/listings-api] key creation failed:', error)
            res.status(500).json({ message: 'Failed to create partner key' })
        }
    })

    app.delete('/api/gene/partner-keys/:id', adminMiddleware, (req: Request, res: Response) => {
        try {
            const id = Number(req.params.id)
            if (Number.isNaN(id)) {
                return res.status(400).json({ message: 'Invalid id' })
            }

            const rows = readCollection<PartnerKeyRecord>(COLLECTION)
            const idx = rows.findIndex((r) => r.id === id)
            if (idx === -1) {
                return res.status(404).json({ message: 'Partner key not found' })
            }

            rows[idx].revoked = true
            writeCollection(COLLECTION, rows)
            res.json({ id: rows[idx].id, revoked: true })
        } catch (error: any) {
            console.error('[gene/listings-api] key revocation failed:', error)
            res.status(500).json({ message: 'Failed to revoke partner key' })
        }
    })

    // --- Partner-facing listings API (behind requirePartnerKey) ---

    app.get('/api/gene/partner/listings', requirePartnerKey, async (_req: Request, res: Response) => {
        try {
            const properties = await storage.getAllProperties()
            res.json(properties.map(toPublicListing))
        } catch (error: any) {
            console.error('[gene/listings-api] listings fetch failed:', error)
            res.status(500).json({ message: 'Failed to load listings' })
        }
    })

    app.post(
        '/api/gene/partner/listings/:id/availability',
        requirePartnerKey,
        async (req: Request, res: Response) => {
            try {
                const id = Number(req.params.id)
                if (Number.isNaN(id)) {
                    return res.status(400).json({ message: 'Invalid property id' })
                }

                const { available } = req.body ?? {}
                if (typeof available !== 'boolean') {
                    return res.status(400).json({ message: 'available (boolean) is required' })
                }

                const current = await storage.getProperty(id)
                if (!current) {
                    return res.status(404).json({ message: 'Property not found' })
                }

                let updated = current
                if (Boolean(current.isAvailable) !== available) {
                    const toggled = await storage.togglePropertyAvailability(id)
                    if (!toggled) {
                        return res.status(404).json({ message: 'Property not found' })
                    }
                    updated = toggled
                }

                res.json(toPublicListing(updated))
            } catch (error: any) {
                console.error('[gene/listings-api] availability update failed:', error)
                res.status(500).json({ message: 'Failed to update availability' })
            }
        }
    )
}
