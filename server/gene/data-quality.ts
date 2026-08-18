/**
 * GENE Platform — data quality checks that keep the rest of the platform
 * (partner API, chat, analytics) trustworthy.
 *
 * `source-uptime` reads the `gene_source_freshness` collection written by
 * Team 1's ingestion module (server/gene/ingestion.ts) and the `SourceFreshness`
 * shape from ./types.ts — this module only reads/interprets it, it does not
 * redefine or write it. It is resilient to that collection not existing yet
 * (readCollection returns [] in that case, which is a valid "nothing synced yet" state).
 */
import type { Express, Request, Response, RequestHandler } from 'express'
import { readCollection } from './store'
import { storage } from '../storage'
import type { SourceFreshness } from './types'

const SOURCE_FRESHNESS_COLLECTION = 'gene_source_freshness'
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000 // 24h

export type DataQualityIssueType =
    | 'missing_title'
    | 'invalid_price'
    | 'missing_location'
    | 'missing_images'
    | 'duplicate_listing'

export interface DataQualityIssue {
    propertyId: number | string
    issueType: DataQualityIssueType
    detail: string
}

function extractImages(property: any): string[] {
    // Property (shared/schema.ts) models a single `imageUrl` today; some
    // ingested/partner records may carry a richer `images` array. Check both
    // without assuming either is guaranteed present.
    if (Array.isArray(property.images)) return property.images.filter(Boolean)
    if (typeof property.imageUrl === 'string' && property.imageUrl.trim()) return [property.imageUrl]
    return []
}

export function registerDataQualityRoutes(app: Express, adminMiddleware: RequestHandler): void {
    app.get('/api/gene/data-quality/validate', adminMiddleware, async (_req: Request, res: Response) => {
        try {
            const properties = await storage.getAllProperties()
            const issues: DataQualityIssue[] = []
            const seenTitleLocation = new Map<string, number | string>()

            for (const property of properties as any[]) {
                const propertyId = property.id

                if (typeof property.title !== 'string' || !property.title.trim()) {
                    issues.push({ propertyId, issueType: 'missing_title', detail: 'Title is missing or empty' })
                }

                if (typeof property.price !== 'number' || property.price <= 0) {
                    issues.push({
                        propertyId,
                        issueType: 'invalid_price',
                        detail: `Price is ${property.price ?? 'missing'}, expected a value > 0`,
                    })
                }

                if (typeof property.location !== 'string' || !property.location.trim()) {
                    issues.push({
                        propertyId,
                        issueType: 'missing_location',
                        detail: 'Location/city is missing or empty',
                    })
                }

                const images = extractImages(property)
                if (images.length === 0) {
                    issues.push({
                        propertyId,
                        issueType: 'missing_images',
                        detail: 'No images found for this listing',
                    })
                }

                if (typeof property.title === 'string' && typeof property.location === 'string') {
                    const key = `${property.title.trim().toLowerCase()}::${property.location.trim().toLowerCase()}`
                    if (key !== '::') {
                        const existingId = seenTitleLocation.get(key)
                        if (existingId !== undefined && existingId !== propertyId) {
                            issues.push({
                                propertyId,
                                issueType: 'duplicate_listing',
                                detail: `Duplicate title+location also used by property ${existingId} (possible duplicate/fraud signal)`,
                            })
                        } else {
                            seenTitleLocation.set(key, propertyId)
                        }
                    }
                }
            }

            res.json({ totalChecked: properties.length, issues })
        } catch (error: any) {
            console.error('[gene/data-quality] validate failed:', error)
            res.status(500).json({ message: 'Failed to run data quality validation' })
        }
    })

    app.get('/api/gene/data-quality/source-uptime', adminMiddleware, (_req: Request, res: Response) => {
        try {
            const sources = readCollection<SourceFreshness>(SOURCE_FRESHNESS_COLLECTION)
            const now = Date.now()

            const report = sources.map((source) => {
                const lastSyncedAtMs = source.lastSyncedAt ? new Date(source.lastSyncedAt).getTime() : null
                const isStaleByAge =
                    lastSyncedAtMs !== null &&
                    !Number.isNaN(lastSyncedAtMs) &&
                    now - lastSyncedAtMs > STALE_THRESHOLD_MS
                const isStaleByStatus = source.lastSyncStatus !== 'ok'
                const stale = isStaleByAge || isStaleByStatus

                return {
                    ...source,
                    stale,
                    staleReason: stale
                        ? isStaleByStatus
                            ? `lastSyncStatus is '${source.lastSyncStatus}'`
                            : 'lastSyncedAt is more than 24h old'
                        : undefined,
                }
            })

            res.json(report)
        } catch (error: any) {
            console.error('[gene/data-quality] source-uptime failed:', error)
            res.status(500).json({ message: 'Failed to load source uptime' })
        }
    })
}
