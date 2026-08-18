/**
 * GENE Platform — Team 1: data ingestion / RAG-lite retrieval layer.
 *
 * v1 implements exactly one real adapter: `sourceId === 'internal'`, which
 * pulls every property from the real DynamoDB-backed `storage` singleton and
 * normalizes each into the shared `GeneListingRecord` contract (see
 * `./types`). Normalized records are stored (replace-all per run) in the
 * `gene_listings` collection, and a `gene_source_freshness` row is
 * upserted per sourceId so freshness can be monitored without re-running
 * ingestion.
 *
 * RAG NOTE: `GET /api/gene/ingestion/listings` below is intentionally a
 * plain "read the normalized collection" endpoint, not a vector index. It
 * stands in for the retrieval half of RAG in v1 — good enough for other
 * GENE modules (chat context, analytics) to query structured listing data.
 * To swap in real retrieval later: keep `gene_listings` as the source of
 * truth, add an embedding step (e.g. embed `title`/`raw` fields into a
 * vector store) that runs after `runIngestion`, and have callers query that
 * index instead of/in addition to this endpoint — the normalized record
 * shape here does not need to change.
 */
import type { Express, RequestHandler } from 'express'
import { readCollection, writeCollection, nowIso } from './store'
import { storage } from '../storage'
import type { GeneListingRecord, SourceFreshness, ListingSourceKind } from './types'
import type { Property } from '@shared/schema'

const LISTINGS_COLLECTION = 'gene_listings'
const FRESHNESS_COLLECTION = 'gene_source_freshness'

/**
 * `location` on `Property` (see `shared/schema.ts`) is a single free-text
 * field, conventionally formatted as "Neighborhood, City, Country" (see
 * `server/seed.ts`). There are no separate country/city/neighborhood
 * columns to read from, so we parse best-effort from that string:
 *   - 3 comma-separated parts -> neighborhood, city, country
 *   - 2 parts -> city, country (no neighborhood)
 *   - 1 part -> treated as city, country left as "Unknown"
 */
function parseLocation(location: string): { neighborhood?: string; city: string; country: string } {
    const parts = location
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0)

    if (parts.length >= 3) {
        return { neighborhood: parts[0], city: parts[1], country: parts[parts.length - 1] }
    }
    if (parts.length === 2) {
        return { city: parts[0], country: parts[1] }
    }
    if (parts.length === 1) {
        return { city: parts[0], country: 'Unknown' }
    }
    return { city: 'Unknown', country: 'Unknown' }
}

function normalizeProperty(property: Property): GeneListingRecord {
    const { neighborhood, city, country } = parseLocation(property.location ?? '')
    return {
        id: `internal:${property.id}`,
        sourceId: 'internal',
        sourceKind: 'internal',
        externalRef: String(property.id),
        title: property.title,
        category: property.category,
        country,
        city,
        neighborhood,
        priceValue: property.price,
        priceCurrency: property.currency ?? 'UGX',
        bedrooms: property.bedrooms ?? undefined,
        bathrooms: property.bathrooms ?? undefined,
        areaSqm: property.squareMeters ?? undefined,
        available: property.isAvailable !== false,
        raw: { propertyType: property.propertyType, ownerId: property.ownerId ?? undefined },
        ingestedAt: nowIso(),
    }
}

function upsertFreshness(freshness: SourceFreshness): void {
    const rows = readCollection<SourceFreshness>(FRESHNESS_COLLECTION)
    const idx = rows.findIndex((r) => r.sourceId === freshness.sourceId)
    if (idx >= 0) {
        rows[idx] = freshness
    } else {
        rows.push(freshness)
    }
    writeCollection(FRESHNESS_COLLECTION, rows)
}

/**
 * Runs ingestion for a single source and returns its updated freshness row.
 * Never throws — an unknown/unimplemented sourceId or a failure while
 * pulling data both resolve to an `error` freshness row rather than an
 * unhandled rejection, so callers (routes, cron, etc.) can always trust the
 * return value.
 */
export async function runIngestion(sourceId: string): Promise<SourceFreshness> {
    if (sourceId !== 'internal') {
        const freshness: SourceFreshness = {
            sourceId,
            sourceKind: 'external_partner' as ListingSourceKind,
            lastSyncedAt: nowIso(),
            lastSyncStatus: 'error',
            lastSyncError: `No ingestion adapter registered for sourceId "${sourceId}". Only "internal" is implemented in v1.`,
            recordCount: 0,
        }
        upsertFreshness(freshness)
        return freshness
    }

    try {
        const properties = await storage.getAllProperties()
        const records = properties.map(normalizeProperty)
        writeCollection(LISTINGS_COLLECTION, records)

        const freshness: SourceFreshness = {
            sourceId: 'internal',
            sourceKind: 'internal',
            lastSyncedAt: nowIso(),
            lastSyncStatus: 'ok',
            recordCount: records.length,
        }
        upsertFreshness(freshness)
        return freshness
    } catch (err) {
        const freshness: SourceFreshness = {
            sourceId: 'internal',
            sourceKind: 'internal',
            lastSyncedAt: nowIso(),
            lastSyncStatus: 'error',
            lastSyncError: err instanceof Error ? err.message : String(err),
            recordCount: 0,
        }
        upsertFreshness(freshness)
        return freshness
    }
}

export function registerGeneIngestionRoutes(app: Express, adminMiddleware: RequestHandler): void {
    // POST /api/gene/ingestion/run/:sourceId — [ADMIN] triggers runIngestion.
    app.post('/api/gene/ingestion/run/:sourceId', adminMiddleware, async (req, res) => {
        try {
            const { sourceId } = req.params
            const freshness = await runIngestion(sourceId)
            const status = freshness.lastSyncStatus === 'ok' ? 200 : 502
            res.status(status).json(freshness)
        } catch (err) {
            console.error('[gene/ingestion] POST /api/gene/ingestion/run/:sourceId failed:', err)
            res.status(500).json({ message: 'Failed to run ingestion.' })
        }
    })

    // GET /api/gene/ingestion/status — public. Source freshness monitoring.
    app.get('/api/gene/ingestion/status', async (_req, res) => {
        try {
            const rows = readCollection<SourceFreshness>(FRESHNESS_COLLECTION)
            res.json(rows)
        } catch (err) {
            console.error('[gene/ingestion] GET /api/gene/ingestion/status failed:', err)
            res.status(500).json({ message: 'Failed to load ingestion status.' })
        }
    })

    // GET /api/gene/ingestion/listings — public. Normalized listings retrieval layer.
    app.get('/api/gene/ingestion/listings', async (_req, res) => {
        try {
            const rows = readCollection<GeneListingRecord>(LISTINGS_COLLECTION)
            res.json(rows)
        } catch (err) {
            console.error('[gene/ingestion] GET /api/gene/ingestion/listings failed:', err)
            res.status(500).json({ message: 'Failed to load listings.' })
        }
    })
}
