/**
 * GENE Platform — Team 1: market trend detection + price forecasting.
 *
 * Reads the normalized `gene_listings` collection written by
 * `./ingestion`'s `runIngestion('internal')`. This module does NOT trigger
 * ingestion itself — if `gene_listings` is empty, the trend/forecast
 * endpoints just return empty/insufficient-data results rather than
 * silently running ingestion as a side effect of a GET. Call
 * `POST /api/gene/ingestion/run/internal` first (or on a schedule) to keep
 * this collection warm.
 *
 * FORECASTING METHOD (v1): we only ever have a single ingestion snapshot's
 * worth of prices to work with right now (one row per listing, no
 * historical time series yet — that would come from `gene_source_freshness`
 * rows accumulated across many ingestion runs over time). Rather than fake
 * a trend line off one data point, we forecast a defensible price
 * *distribution* for the requested segment from the CROSS-SECTIONAL spread
 * of current listing prices in that segment (mean + sample std-dev, mapped
 * to p10/p50/p90 via the normal-distribution 1.2816 z-score for the 10th
 * and 90th percentiles). This is honest about what it is: a snapshot price
 * range, not a time-series prediction. Once multiple ingestion runs have
 * accumulated real history, replace `forecastFromCrossSection` with an
 * actual regression over time (e.g. `avgPrice ~ periodStart`).
 */
import type { Express, RequestHandler } from 'express'
import { readCollection } from './store'
import type { GeneListingRecord, TrendPoint, ConfidenceInterval } from './types'
import { nowIso } from './store'

const LISTINGS_COLLECTION = 'gene_listings'

// z-score such that P(Z <= z) = 0.90 for a standard normal distribution.
const Z_90 = 1.2816

interface TrendBucket {
    country: string
    category: string
    city: string
    count: number
    avgPrice: number
    minPrice: number
    maxPrice: number
    currency: string
    trend: TrendPoint[]
}

function loadListings(country?: string, category?: string): GeneListingRecord[] {
    const rows = readCollection<GeneListingRecord>(LISTINGS_COLLECTION)
    return rows.filter((r) => {
        if (country && r.country.toLowerCase() !== country.toLowerCase()) return false
        if (category && r.category.toLowerCase() !== category.toLowerCase()) return false
        return true
    })
}

function mean(values: number[]): number {
    return values.reduce((sum, v) => sum + v, 0) / values.length
}

function sampleStdDev(values: number[], avg: number): number {
    if (values.length < 2) return 0
    const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (values.length - 1)
    return Math.sqrt(variance)
}

function buildTrends(listings: GeneListingRecord[]): TrendBucket[] {
    const buckets = new Map<string, GeneListingRecord[]>()
    for (const listing of listings) {
        const key = `${listing.country}||${listing.category}||${listing.city}`
        const arr = buckets.get(key) ?? []
        arr.push(listing)
        buckets.set(key, arr)
    }

    const periodStart = nowIso()
    const result: TrendBucket[] = []
    for (const [key, rows] of Array.from(buckets.entries())) {
        const [country, category, city] = key.split('||')
        const prices = rows.map((r) => r.priceValue)
        const avgPrice = mean(prices)
        const minPrice = Math.min(...prices)
        const maxPrice = Math.max(...prices)
        const currency = rows[0]?.priceCurrency ?? 'UGX'
        result.push({
            country,
            category,
            city,
            count: rows.length,
            avgPrice,
            minPrice,
            maxPrice,
            currency,
            trend: [
                { periodStart, metric: `avg_price:${country}:${category}:${city}`, value: avgPrice },
                { periodStart, metric: `min_price:${country}:${category}:${city}`, value: minPrice },
                { periodStart, metric: `max_price:${country}:${category}:${city}`, value: maxPrice },
                { periodStart, metric: `count:${country}:${category}:${city}`, value: rows.length },
            ],
        })
    }
    return result.sort((a, b) => b.count - a.count)
}

/**
 * See module doc — cross-sectional price-distribution forecast, not a real
 * time-series prediction. Returns null when there isn't even one listing to
 * anchor off of.
 */
function forecastFromCrossSection(listings: GeneListingRecord[]): (ConfidenceInterval & { sampleSize: number; method: string }) | null {
    if (listings.length === 0) return null

    const prices = listings.map((l) => l.priceValue)
    const p50 = mean(prices)

    if (listings.length === 1) {
        // Not enough spread to estimate variance — widen a fixed +/-15% band
        // around the single observed price rather than presenting a false
        // single-point certainty.
        return {
            p10: Math.max(0, p50 * 0.85),
            p50,
            p90: p50 * 1.15,
            sampleSize: 1,
            method: 'single_observation_fixed_band_15pct',
        }
    }

    const std = sampleStdDev(prices, p50)
    return {
        p10: Math.max(0, p50 - Z_90 * std),
        p50,
        p90: p50 + Z_90 * std,
        sampleSize: listings.length,
        method: 'cross_sectional_normal_approximation',
    }
}

export function registerGeneAnalyticsRoutes(app: Express, adminMiddleware: RequestHandler): void {
    // GET /api/gene/analytics/trends?country=&category= — public.
    app.get('/api/gene/analytics/trends', async (req, res) => {
        try {
            const country = typeof req.query.country === 'string' ? req.query.country : undefined
            const category = typeof req.query.category === 'string' ? req.query.category : undefined
            const listings = loadListings(country, category)
            const buckets = buildTrends(listings)
            res.json({ generatedAt: nowIso(), filters: { country: country ?? null, category: category ?? null }, buckets })
        } catch (err) {
            console.error('[gene/analytics] GET /api/gene/analytics/trends failed:', err)
            res.status(500).json({ message: 'Failed to compute trends.' })
        }
    })

    // GET /api/gene/analytics/forecast?country=&category= — public.
    app.get('/api/gene/analytics/forecast', async (req, res) => {
        try {
            const country = typeof req.query.country === 'string' ? req.query.country : undefined
            const category = typeof req.query.category === 'string' ? req.query.category : undefined
            const listings = loadListings(country, category)
            const forecast = forecastFromCrossSection(listings)
            if (!forecast) {
                return res.status(404).json({
                    message: 'No listings match that filter — run ingestion or widen the country/category filter.',
                })
            }
            res.json({
                generatedAt: nowIso(),
                filters: { country: country ?? null, category: category ?? null },
                forecast: { p10: forecast.p10, p50: forecast.p50, p90: forecast.p90 } as ConfidenceInterval,
                sampleSize: forecast.sampleSize,
                method: forecast.method,
            })
        } catch (err) {
            console.error('[gene/analytics] GET /api/gene/analytics/forecast failed:', err)
            res.status(500).json({ message: 'Failed to compute forecast.' })
        }
    })

    // POST /api/gene/analytics/backtest — [ADMIN] backtesting harness.
    // Body: Array<{ predicted: ConfidenceInterval, actual: number }>
    app.post('/api/gene/analytics/backtest', adminMiddleware, async (req, res) => {
        try {
            const body = req.body
            if (!Array.isArray(body) || body.length === 0) {
                return res.status(400).json({ message: 'Body must be a non-empty array of { predicted, actual }.' })
            }

            let withinBand = 0
            let absErrorSum = 0
            const invalid: number[] = []

            body.forEach((entry: any, idx: number) => {
                const predicted = entry?.predicted
                const actual = entry?.actual
                if (
                    !predicted ||
                    typeof predicted.p10 !== 'number' ||
                    typeof predicted.p50 !== 'number' ||
                    typeof predicted.p90 !== 'number' ||
                    typeof actual !== 'number'
                ) {
                    invalid.push(idx)
                    return
                }
                if (actual >= predicted.p10 && actual <= predicted.p90) withinBand += 1
                absErrorSum += Math.abs(actual - predicted.p50)
            })

            const validCount = body.length - invalid.length
            if (validCount === 0) {
                return res.status(400).json({ message: 'No valid { predicted, actual } entries found.', invalidIndexes: invalid })
            }

            res.json({
                totalEntries: body.length,
                validEntries: validCount,
                invalidIndexes: invalid,
                coveragePct: Math.round((withinBand / validCount) * 10000) / 100,
                meanAbsoluteErrorVsP50: Math.round((absErrorSum / validCount) * 100) / 100,
            })
        } catch (err) {
            console.error('[gene/analytics] POST /api/gene/analytics/backtest failed:', err)
            res.status(500).json({ message: 'Failed to run backtest.' })
        }
    })
}
