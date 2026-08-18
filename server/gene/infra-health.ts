/**
 * GENE Platform — Team 4: daily health checks / monitoring.
 *
 * `GET /api/gene/infra/health` runs a handful of REAL checks (DynamoDB
 * reachability through the actual `storage` singleton, filesystem
 * writability under the same `data/gene` directory the rest of GENE persists
 * to, and presence of the `ffmpeg`/`ffprobe` binaries the guided-360-upload
 * feature depends on) and returns an overall status a human or a future
 * uptime dashboard can act on. Every check is individually try/caught so one
 * failing dependency never crashes the route or hides the other checks'
 * results.
 *
 * Each call also appends a compact snapshot to `gene_health_history` (capped
 * to the most recent 500 entries) so `GET /api/gene/infra/health-history` has
 * real trend data to render, instead of only ever showing "right now."
 *
 * ALERTING HOOK (not implemented — needs real credentials): a paging/Slack
 * webhook integration would hook in right after `overallStatus` is computed
 * below, e.g. `if (overallStatus !== 'ok') await notifySlack(...)`. Left as a
 * TODO rather than implemented against fake/placeholder credentials.
 */
import type { Express, Request, Response, RequestHandler } from 'express'
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { readCollection, writeCollection, nowIso } from './store'
import { storage } from '../storage'

const HEALTH_HISTORY_COLLECTION = 'gene_health_history'
const MAX_HISTORY_ENTRIES = 500
const DATA_GENE_DIR = path.join(process.cwd(), 'data', 'gene')
const HEALTH_CHECK_FILE = path.join(DATA_GENE_DIR, '.health-check')

export type HealthCheckStatus = 'ok' | 'fail'
export type OverallHealthStatus = 'ok' | 'degraded' | 'down'

export interface GeneHealthCheckResult {
    name: string
    status: HealthCheckStatus
    detail?: string
    latencyMs: number
}

export interface GeneHealthSnapshot {
    timestamp: string
    overallStatus: OverallHealthStatus
}

async function timed(name: string, fn: () => void | Promise<void>): Promise<GeneHealthCheckResult> {
    const start = Date.now()
    try {
        await fn()
        return { name, status: 'ok', latencyMs: Date.now() - start }
    } catch (error: any) {
        return {
            name,
            status: 'fail',
            detail: typeof error?.message === 'string' ? error.message : String(error),
            latencyMs: Date.now() - start,
        }
    }
}

async function checkDynamoDb(): Promise<GeneHealthCheckResult> {
    return timed('dynamodb', async () => {
        await storage.getAllProperties()
    })
}

async function checkFilesystemWritable(): Promise<GeneHealthCheckResult> {
    return timed('filesystem', () => {
        fs.mkdirSync(DATA_GENE_DIR, { recursive: true })
        fs.writeFileSync(HEALTH_CHECK_FILE, `health-check ${nowIso()}`)
        fs.unlinkSync(HEALTH_CHECK_FILE)
    })
}

async function checkFfmpeg(): Promise<GeneHealthCheckResult> {
    return timed('ffmpeg', () => {
        execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    })
}

async function checkFfprobe(): Promise<GeneHealthCheckResult> {
    return timed('ffprobe', () => {
        execFileSync('ffprobe', ['-version'], { stdio: 'ignore' })
    })
}

function computeOverallStatus(checks: GeneHealthCheckResult[]): OverallHealthStatus {
    const dynamoFailed = checks.find((c) => c.name === 'dynamodb')?.status === 'fail'
    if (dynamoFailed) return 'down' // core data access broken — this is a real outage, not a degradation
    const anyFailed = checks.some((c) => c.status === 'fail')
    return anyFailed ? 'degraded' : 'ok'
}

function appendHistorySnapshot(overallStatus: OverallHealthStatus): void {
    const rows = readCollection<GeneHealthSnapshot>(HEALTH_HISTORY_COLLECTION)
    rows.push({ timestamp: nowIso(), overallStatus })
    // Trim oldest entries so this collection doesn't grow unbounded.
    const trimmed = rows.length > MAX_HISTORY_ENTRIES ? rows.slice(rows.length - MAX_HISTORY_ENTRIES) : rows
    writeCollection(HEALTH_HISTORY_COLLECTION, trimmed)
}

export function registerInfraHealthRoutes(app: Express, adminMiddleware: RequestHandler): void {
    // GET /api/gene/infra/health — public, standard practice for a health endpoint.
    app.get('/api/gene/infra/health', async (_req: Request, res: Response) => {
        try {
            const checks = await Promise.all([checkDynamoDb(), checkFilesystemWritable(), checkFfmpeg(), checkFfprobe()])
            const overallStatus = computeOverallStatus(checks)

            try {
                appendHistorySnapshot(overallStatus)
            } catch (historyError) {
                // Never let history logging failure affect the health response itself.
                console.error('[gene/infra-health] failed to append health history:', historyError)
            }

            // TODO(alerting): if (overallStatus !== 'ok') notify a paging/Slack
            // webhook here once real credentials exist. Intentionally not wired up.

            const httpStatus = overallStatus === 'ok' ? 200 : overallStatus === 'degraded' ? 200 : 503
            res.status(httpStatus).json({ status: overallStatus, checks })
        } catch (error: any) {
            // Should be unreachable (every check above is individually try/caught),
            // but never let this route crash the process regardless.
            console.error('[gene/infra-health] health check route failed unexpectedly:', error)
            res.status(500).json({ status: 'down', checks: [], message: 'Health check failed unexpectedly' })
        }
    })

    // GET /api/gene/infra/health-history [ADMIN] — trimmed history for a simple uptime dashboard.
    app.get('/api/gene/infra/health-history', adminMiddleware, (_req: Request, res: Response) => {
        try {
            const rows = readCollection<GeneHealthSnapshot>(HEALTH_HISTORY_COLLECTION)
            res.json(rows)
        } catch (error: any) {
            console.error('[gene/infra-health] health history read failed:', error)
            res.status(500).json({ message: 'Failed to load health history' })
        }
    })
}
