/**
 * GENE Platform — canonical shared contracts.
 *
 * Per docs/GENE_PLATFORM.md's "Week 0 contracts pass": this is the schema
 * every other GENE module (ingestion, analytics, investor tools, chat)
 * reads/writes against, so the four team's modules can be built in parallel
 * without drifting. Additive only — nothing here changes `shared/schema.ts`
 * or the existing `Property` type; `GeneListingRecord` is a normalized VIEW
 * derived from a `Property` (or, later, an external source), not a
 * replacement for it.
 */

/** Where a normalized listing record came from. */
export type ListingSourceKind = 'internal' | 'external_partner' | 'manual_import'

export interface SourceFreshness {
    sourceId: string
    sourceKind: ListingSourceKind
    lastSyncedAt: string | null
    lastSyncStatus: 'ok' | 'error' | 'never_run'
    lastSyncError?: string
    recordCount: number
}

/**
 * The normalized shape ingestion (1.2), analytics (1.3), investor tooling
 * (3.3), and data-quality checks (2.4) all agree on, regardless of whether
 * the underlying record came from our own DynamoDB `properties` table or an
 * external partner feed.
 */
export interface GeneListingRecord {
    id: string
    sourceId: string
    sourceKind: ListingSourceKind
    externalRef?: string
    title: string
    category: string
    country: string
    city: string
    neighborhood?: string
    priceValue: number
    priceCurrency: string
    bedrooms?: number
    bathrooms?: number
    areaSqm?: number
    available: boolean
    latitude?: number
    longitude?: number
    ingestedAt: string
    raw?: Record<string, unknown>
}

/** Never present a forecast as a certainty — every prediction carries a band. */
export interface ConfidenceInterval {
    p10: number
    p50: number
    p90: number
}

export interface TrendPoint {
    periodStart: string
    metric: string
    value: number
}

/** Countries this pass targets — designed pluggable, not hard-coded to one. */
export const SUPPORTED_COUNTRIES = ['Uganda', 'Kenya', 'Tanzania', 'Rwanda'] as const
export type SupportedCountry = (typeof SUPPORTED_COUNTRIES)[number]

/**
 * Anything that touches money, a live listing, or an outbound customer
 * message must carry this. Team 4's note: "full autonomy is something to
 * earn... not default to at launch" — this is the mechanical enforcement of
 * that policy across every GENE module.
 */
export interface ApprovalGate {
    requiresHumanApproval: boolean
    approvedBy?: string
    approvedAt?: string
    status: 'pending' | 'approved' | 'rejected' | 'auto_approved'
}
