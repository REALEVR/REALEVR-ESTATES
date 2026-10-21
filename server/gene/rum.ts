/**
 * Real-user page speed. The site's own visitors report how fast the page loaded for them (first paint, main picture, layout
 * jumps, response to taps, total bytes) together with the kind of connection they were on, so "does it work on a 3G phone?"
 * is answered with measurements instead of a guess.
 *
 * Only numbers are kept: no address, no user id, no page path beyond its first segment. A day keeps at most 400 samples per
 * connection class and metric (new ones replace random old ones), so the file stays small however busy the site gets.
 * GET /api/admin/rum (administrators) returns the 75th percentile, the figure Google uses, for each connection class.
 */
import type { Express, Request, Response } from 'express'
import { readCollection, writeCollection } from './store'
import { requireStrictAdmin } from './admin-guard'

const COLLECTION = 'gene_rum'
const KEEP_DAYS = 14
const MAX_SAMPLES = 400

export type Connection = 'fast' | 'slow' | 'unknown'
const METRICS = ['fcp', 'lcp', 'ttfb', 'cls', 'inp', 'kb'] as const
type Metric = (typeof METRICS)[number]
/** Largest believable value per metric: anything above is a bad reading, not a slow site. */
const CEILING: Record<Metric, number> = { fcp: 60000, lcp: 60000, ttfb: 60000, cls: 10, inp: 30000, kb: 200000 }

interface Bucket {
    day: string
    connection: Connection
    metric: Metric
    values: number[]
    seen: number
}

const dayOf = (d = new Date()) => d.toISOString().slice(0, 10)

export function classifyConnection(effectiveType: unknown, saveData: unknown): Connection {
    if (saveData === true) return 'slow'
    if (effectiveType === '4g') return 'fast'
    if (effectiveType === '3g' || effectiveType === '2g' || effectiveType === 'slow-2g') return 'slow'
    return 'unknown'
}

export function percentile(values: number[], p: number): number | null {
    if (!values.length) return null
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]
}

/** Per-IP limit so one browser cannot flood the file: 20 reports a minute. */
const hits = new Map<string, number[]>()
function allowed(ip: string): boolean {
    const now = Date.now()
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000)
    if (recent.length >= 20) return false
    recent.push(now)
    hits.set(ip, recent)
    if (hits.size > 5000) hits.clear()
    return true
}

export function record(connection: Connection, readings: Partial<Record<Metric, number>>, now = new Date()): void {
    const rows = readCollection<Bucket>(COLLECTION)
    const cutoff = dayOf(new Date(now.getTime() - KEEP_DAYS * 86_400_000))
    const kept = rows.filter((r) => r.day >= cutoff)
    const day = dayOf(now)
    for (const metric of METRICS) {
        const v = readings[metric]
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > CEILING[metric]) continue
        let bucket = kept.find((r) => r.day === day && r.connection === connection && r.metric === metric)
        if (!bucket) {
            bucket = { day, connection, metric, values: [], seen: 0 }
            kept.push(bucket)
        }
        bucket.seen++
        if (bucket.values.length < MAX_SAMPLES) bucket.values.push(Math.round(v * 1000) / 1000)
        else bucket.values[Math.floor(Math.random() * MAX_SAMPLES)] = Math.round(v * 1000) / 1000
    }
    writeCollection(COLLECTION, kept)
}

export function summarize(days = 7, now = new Date()) {
    const since = dayOf(new Date(now.getTime() - days * 86_400_000))
    const rows = readCollection<Bucket>(COLLECTION).filter((r) => r.day >= since)
    const out: Record<Connection, { visits: number; p75: Partial<Record<Metric, number>> }> = {
        fast: { visits: 0, p75: {} },
        slow: { visits: 0, p75: {} },
        unknown: { visits: 0, p75: {} },
    }
    for (const conn of Object.keys(out) as Connection[]) {
        for (const metric of METRICS) {
            const mine = rows.filter((r) => r.connection === conn && r.metric === metric)
            const values = mine.flatMap((r) => r.values)
            const p = percentile(values, 75)
            if (p !== null) out[conn].p75[metric] = metric === 'cls' ? Math.round(p * 1000) / 1000 : Math.round(p)
            if (metric === 'lcp') out[conn].visits = mine.reduce((n, r) => n + r.seen, 0)
        }
    }
    return out
}

export function registerRumRoutes(app: Express): void {
    app.post('/api/rum', (req: Request, res: Response) => {
        res.status(204).end()
        try {
            if (!allowed(String(req.ip))) return
            const b = req.body ?? {}
            const readings: Partial<Record<Metric, number>> = {}
            for (const m of METRICS) if (typeof b[m] === 'number') readings[m] = b[m]
            record(classifyConnection(b.conn, b.saveData), readings)
        } catch (err) {
            console.warn('[rum] could not record a report:', (err as Error)?.message)
        }
    })

    app.get('/api/admin/rum', requireStrictAdmin, (req: Request, res: Response) => {
        const days = Math.max(1, Math.min(14, Number(req.query.days) || 7))
        res.json({ days, targets: { lcpMs: 2500, fcpMs: 1800, cls: 0.1, inpMs: 200, kb: 1024 }, ...{ connections: summarize(days) } })
    })
}
