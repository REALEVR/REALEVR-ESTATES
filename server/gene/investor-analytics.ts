/**
 * GENE Platform — investor-facing dashboards/reports.
 *
 * Reads REAL property data via `storage.getAllProperties()` /
 * `storage.getProperty()` (see `server/storage.ts`). No mock data.
 *
 * `shared/schema.ts`'s `Property` type does NOT have a field called
 * `areaSqm` (that name only exists in `server/gene/types.ts`'s normalized
 * `GeneListingRecord` view) — the real field is `squareMeters`. Similarly
 * there is no dedicated `city` column; the closest real field is
 * `location` (free-text). This module uses the real field names and says so,
 * rather than guessing/inventing columns that don't exist.
 */
import type { Express, RequestHandler } from 'express'
import { storage } from '../storage'
import type { Property } from '@shared/schema'

export interface RoiInputs {
    price: number
    assumedMonthlyRent: number
    assumedAnnualExpensesPct: number
}

export interface RoiResult {
    inputs: RoiInputs
    formulas: {
        grossYield: string
        netYield: string
        capRate: string
    }
    grossAnnualRent: number
    annualExpenses: number
    netAnnualIncome: number
    grossYieldPct: number
    netYieldPct: number
    /**
     * Cap rate here uses the same net-income/price formula as net yield
     * (net operating income / purchase price). We surface both names because
     * "net yield" and "cap rate" are used interchangeably by different
     * investors, but the calculation is identical and shown so it's auditable.
     */
    capRatePct: number
}

/** Pure helper — no I/O. */
export function computeRoi(inputs: RoiInputs): RoiResult {
    const { price, assumedMonthlyRent, assumedAnnualExpensesPct } = inputs
    const grossAnnualRent = assumedMonthlyRent * 12
    const annualExpenses = grossAnnualRent * assumedAnnualExpensesPct
    const netAnnualIncome = grossAnnualRent - annualExpenses

    const grossYieldPct = price > 0 ? (grossAnnualRent / price) * 100 : 0
    const netYieldPct = price > 0 ? (netAnnualIncome / price) * 100 : 0
    const capRatePct = netYieldPct

    return {
        inputs,
        formulas: {
            grossYield: '(assumedMonthlyRent * 12) / price',
            netYield: '((assumedMonthlyRent * 12) - (assumedMonthlyRent * 12 * assumedAnnualExpensesPct)) / price',
            capRate: 'netAnnualIncome / price (same basis as netYield, expressed as cap rate)',
        },
        grossAnnualRent,
        annualExpenses,
        netAnnualIncome,
        grossYieldPct,
        netYieldPct,
        capRatePct,
    }
}

export interface ComparableResult {
    property: Property
    similarityScore: number
    pricePerSqm: number | null
}

/**
 * Pure helper — no I/O. Ranks candidate properties by similarity to the
 * subject property using category match, location (free-text) match, and
 * bedroom-count closeness.
 */
export function findComparables(subject: Property, candidates: Property[]): ComparableResult[] {
    const results: ComparableResult[] = []

    for (const candidate of candidates) {
        if (candidate.id === subject.id) continue

        let score = 0
        if (candidate.category === subject.category) score += 3
        if (
            subject.location &&
            candidate.location &&
            candidate.location.toLowerCase().includes(subject.location.toLowerCase().split(',')[0].trim())
        ) {
            score += 2
        }
        if (typeof candidate.bedrooms === 'number' && typeof subject.bedrooms === 'number') {
            const bedroomDelta = Math.abs(candidate.bedrooms - subject.bedrooms)
            score += Math.max(0, 2 - bedroomDelta) // exact match=2, off by 1=1, off by 2+=0
        }

        // Only surface candidates with at least some relevance.
        if (score <= 0) continue

        const pricePerSqm =
            typeof candidate.squareMeters === 'number' && candidate.squareMeters > 0
                ? candidate.price / candidate.squareMeters
                : null

        results.push({ property: candidate, similarityScore: score, pricePerSqm })
    }

    return results.sort((a, b) => b.similarityScore - a.similarityScore)
}

function parseNumberQuery(value: unknown, fallback: number): number {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
}

export function registerInvestorAnalyticsRoutes(app: Express, _adminMiddleware: RequestHandler): void {
    /** Public. Real ROI/yield calculator against a real property's price. */
    app.get('/api/gene/investor/roi', async (req, res) => {
        try {
            const propertyId = Number(req.query.propertyId)
            if (!Number.isFinite(propertyId)) {
                return res.status(400).json({ message: 'propertyId (number) is required' })
            }
            const property = await storage.getProperty(propertyId)
            if (!property) {
                return res.status(404).json({ message: 'Property not found' })
            }

            const assumedMonthlyRent = parseNumberQuery(req.query.assumedMonthlyRent, 0)
            const assumedAnnualExpensesPct = parseNumberQuery(req.query.assumedAnnualExpensesPct, 0)

            if (assumedMonthlyRent <= 0) {
                return res.status(400).json({ message: 'assumedMonthlyRent (positive number) is required' })
            }
            if (assumedAnnualExpensesPct < 0 || assumedAnnualExpensesPct > 1) {
                return res.status(400).json({ message: 'assumedAnnualExpensesPct must be a fraction between 0 and 1 (e.g. 0.2 for 20%)' })
            }

            const result = computeRoi({
                price: property.price,
                assumedMonthlyRent,
                assumedAnnualExpensesPct,
            })

            res.json({
                propertyId: property.id,
                propertyTitle: property.title,
                propertyPrice: property.price,
                currency: property.currency,
                ...result,
            })
        } catch (error: any) {
            console.error('[gene/investor-analytics] roi error', error)
            res.status(500).json({ message: 'Failed to compute ROI', error: error?.message })
        }
    })

    /** Public. Real comparable properties from storage.getAllProperties(). */
    app.get('/api/gene/investor/comparables', async (req, res) => {
        try {
            const propertyId = Number(req.query.propertyId)
            if (!Number.isFinite(propertyId)) {
                return res.status(400).json({ message: 'propertyId (number) is required' })
            }

            const [property, allProperties] = await Promise.all([
                storage.getProperty(propertyId),
                storage.getAllProperties(),
            ])
            if (!property) {
                return res.status(404).json({ message: 'Property not found' })
            }

            const comparables = findComparables(property, allProperties)

            res.json({
                propertyId: property.id,
                comparables: comparables.slice(0, 10),
                note:
                    'Similarity ranks by category match, free-text location overlap (there is no dedicated "city" column on Property), and bedroom-count closeness. pricePerSqm uses the real `squareMeters` field and is null where that field is missing/zero.',
            })
        } catch (error: any) {
            console.error('[gene/investor-analytics] comparables error', error)
            res.status(500).json({ message: 'Failed to compute comparables', error: error?.message })
        }
    })

    /**
     * Public. Combines ROI + comparables into one exportable-shaped JSON
     * report. Actual PDF/export generation is out of scope here — this
     * returns clean structured JSON a report-generator can consume later.
     */
    app.get('/api/gene/investor/report', async (req, res) => {
        try {
            const propertyId = Number(req.query.propertyId)
            if (!Number.isFinite(propertyId)) {
                return res.status(400).json({ message: 'propertyId (number) is required' })
            }

            const [property, allProperties] = await Promise.all([
                storage.getProperty(propertyId),
                storage.getAllProperties(),
            ])
            if (!property) {
                return res.status(404).json({ message: 'Property not found' })
            }

            const assumedMonthlyRent = parseNumberQuery(req.query.assumedMonthlyRent, property.monthlyPrice ?? 0)
            const assumedAnnualExpensesPct = parseNumberQuery(req.query.assumedAnnualExpensesPct, 0.15)

            const roi =
                assumedMonthlyRent > 0
                    ? computeRoi({ price: property.price, assumedMonthlyRent, assumedAnnualExpensesPct })
                    : null

            const comparables = findComparables(property, allProperties).slice(0, 10)

            res.json({
                generatedAt: new Date().toISOString(),
                property: {
                    id: property.id,
                    title: property.title,
                    location: property.location,
                    category: property.category,
                    price: property.price,
                    currency: property.currency,
                    bedrooms: property.bedrooms,
                    bathrooms: property.bathrooms,
                    squareMeters: property.squareMeters,
                },
                roi: roi ?? {
                    note: 'No assumedMonthlyRent supplied (and property has no monthlyPrice fallback) — ROI section omitted. Pass ?assumedMonthlyRent= to include it.',
                },
                comparables: {
                    count: comparables.length,
                    items: comparables,
                },
            })
        } catch (error: any) {
            console.error('[gene/investor-analytics] report error', error)
            res.status(500).json({ message: 'Failed to build investor report', error: error?.message })
        }
    })
}
