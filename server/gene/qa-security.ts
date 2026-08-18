/**
 * GENE Platform — Team 4: continuous testing / vulnerability scanning cadence.
 *
 * `GET /api/gene/qa/dependency-audit` shells out to the repo's own
 * `npm audit --json` from the repo root and returns a summarized count plus
 * the top 20 findings by severity. `npm audit` exits with a non-zero status
 * code whenever it finds vulnerabilities — that is expected/normal and NOT
 * treated as a request failure here; stdout still carries the full JSON
 * report on a non-zero exit, so it's parsed the same way either way. Each run
 * is logged to `gene_qa_runs` so severity trend-over-time is visible via
 * `GET /api/gene/qa/history`.
 *
 * REGRESSION SUITE: this repo has no test runner configured today (no
 * jest/vitest/mocha in package.json — confirmed by inspection, not just
 * assumed). Rather than quietly adding a new test framework as a dependency
 * (out of scope / against the "no new npm deps" constraint for this pass),
 * the "regression test suite" deliverable is `./__smoke__.test-plan.md`: a
 * concrete, runnable-by-hand checklist covering the other new GENE modules.
 * If the team wants to formalize this later, Vitest is the natural fit here
 * (zero-config with Vite, which this repo's client already uses) — that's a
 * recommendation, not something this pass installs.
 */
import type { Express, Request, Response, RequestHandler } from 'express'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { readCollection, writeCollection, nextId, nowIso } from './store'

const execFileAsync = promisify(execFile)

const QA_RUNS_COLLECTION = 'gene_qa_runs'
const AUDIT_TIMEOUT_MS = 30_000
const MAX_AUDIT_BUFFER_BYTES = 20 * 1024 * 1024
const TOP_FINDINGS_LIMIT = 20

type Severity = 'critical' | 'high' | 'moderate' | 'low' | 'info'
const SEVERITY_RANK: Record<Severity, number> = { critical: 4, high: 3, moderate: 2, low: 1, info: 0 }

export interface NpmAuditFinding {
    name: string
    severity: Severity
    range?: string
    fixAvailable?: boolean | Record<string, unknown>
    isDirect?: boolean
    via: string[]
}

export interface DependencyAuditSummary {
    critical: number
    high: number
    moderate: number
    low: number
    info: number
    total: number
}

export interface GeneQaRun {
    id: number
    createdAt: string
    summary: DependencyAuditSummary
}

function isSeverity(value: unknown): value is Severity {
    return typeof value === 'string' && value in SEVERITY_RANK
}

/**
 * Runs `npm audit --json` from the repo root and returns the parsed report.
 * Non-zero exit codes (npm audit's normal behavior when it finds
 * vulnerabilities) are NOT treated as failures — stdout is parsed either way.
 * Only a genuinely unparsable/empty result throws.
 */
async function runNpmAudit(): Promise<any> {
    try {
        const { stdout } = await execFileAsync('npm', ['audit', '--json'], {
            cwd: process.cwd(),
            timeout: AUDIT_TIMEOUT_MS,
            maxBuffer: MAX_AUDIT_BUFFER_BYTES,
        })
        return JSON.parse(stdout)
    } catch (error: any) {
        // execFile rejects on non-zero exit, but npm audit still writes the full
        // JSON report to stdout when it finds vulnerabilities — recover it here.
        if (typeof error?.stdout === 'string' && error.stdout.trim().length > 0) {
            return JSON.parse(error.stdout)
        }
        throw error
    }
}

function summarizeAndExtractFindings(raw: any): { summary: DependencyAuditSummary; findings: NpmAuditFinding[] } {
    const metaCounts = raw?.metadata?.vulnerabilities ?? {}
    const summary: DependencyAuditSummary = {
        critical: Number(metaCounts.critical) || 0,
        high: Number(metaCounts.high) || 0,
        moderate: Number(metaCounts.moderate) || 0,
        low: Number(metaCounts.low) || 0,
        info: Number(metaCounts.info) || 0,
        total: Number(metaCounts.total) || 0,
    }

    const vulnerabilities = raw?.vulnerabilities && typeof raw.vulnerabilities === 'object' ? raw.vulnerabilities : {}
    const findings: NpmAuditFinding[] = Object.values(vulnerabilities as Record<string, any>)
        .filter((entry) => isSeverity(entry?.severity))
        .map((entry: any) => ({
            name: String(entry.name ?? 'unknown'),
            severity: entry.severity as Severity,
            range: typeof entry.range === 'string' ? entry.range : undefined,
            fixAvailable: entry.fixAvailable,
            isDirect: Boolean(entry.isDirect),
            via: Array.isArray(entry.via) ? entry.via.map((v: any) => (typeof v === 'string' ? v : v?.title ?? String(v))) : [],
        }))
        .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
        .slice(0, TOP_FINDINGS_LIMIT)

    // If metadata was missing entirely (older npm formats), fall back to
    // deriving the summary from the findings we do have rather than reporting
    // all zeros.
    if (summary.total === 0 && findings.length > 0) {
        for (const f of Object.values(vulnerabilities as Record<string, any>)) {
            if (isSeverity(f?.severity)) {
                summary[f.severity as Severity] += 1
                summary.total += 1
            }
        }
    }

    return { summary, findings }
}

function logQaRun(summary: DependencyAuditSummary): GeneQaRun {
    const rows = readCollection<GeneQaRun>(QA_RUNS_COLLECTION)
    const record: GeneQaRun = { id: nextId(rows), createdAt: nowIso(), summary }
    rows.push(record)
    writeCollection(QA_RUNS_COLLECTION, rows)
    return record
}

export function registerQaSecurityRoutes(app: Express, adminMiddleware: RequestHandler): void {
    // GET /api/gene/qa/dependency-audit [ADMIN]
    app.get('/api/gene/qa/dependency-audit', adminMiddleware, async (_req: Request, res: Response) => {
        try {
            const raw = await runNpmAudit()
            const { summary, findings } = summarizeAndExtractFindings(raw)
            const run = logQaRun(summary)
            res.json({ ...summary, topFindings: findings, runId: run.id, ranAt: run.createdAt })
        } catch (error: any) {
            console.error('[gene/qa-security] dependency audit failed:', error)
            res.status(500).json({ message: 'Failed to run dependency audit', detail: String(error?.message ?? error) })
        }
    })

    // GET /api/gene/qa/history [ADMIN]
    app.get('/api/gene/qa/history', adminMiddleware, (_req: Request, res: Response) => {
        try {
            const rows = readCollection<GeneQaRun>(QA_RUNS_COLLECTION)
            res.json(rows)
        } catch (error: any) {
            console.error('[gene/qa-security] history read failed:', error)
            res.status(500).json({ message: 'Failed to load QA run history' })
        }
    })
}
