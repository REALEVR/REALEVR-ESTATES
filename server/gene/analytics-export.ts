/**
 * GENE Platform — Weekly Property Analytics Export.
 *
 * "I need the analytics for each property. I can't view or export these.
 * Export the analytics weekly to the host's WhatsApp number and email at
 * exactly 10am each Saturday."
 *
 * Compiles a platform-wide, per-property performance report (views — the
 * same metric AgentDashboard.tsx's "Property Performance Analytics" panel
 * already shows on-screen but never let anyone view in full or export) and:
 *   1. Delivers it automatically every Saturday at 10:00 AM East Africa Time
 *      to the platform owner's WhatsApp number(s) (admin-notify.ts's
 *      getAdminWhatsappNumbers) and email (email-service.ts's
 *      sendEmailToAdmins) — see server/cron/index.ts for the schedule.
 *   2. Exposes the exact same report as a real, on-demand CSV download
 *      (GET /api/gene/analytics/export.csv) — this is what
 *      AgentDashboard.tsx's previously-decorative "Export Analytics" button
 *      now calls, scoped to the signed-in agent's own properties (a strict
 *      admin sees every property).
 *   3. Lets a strict admin trigger the exact same WhatsApp+email send on
 *      demand (POST /api/gene/analytics/weekly-export/run) — useful to
 *      confirm delivery without waiting for Saturday, or to resend.
 *
 * WEEK-OVER-WEEK HONESTY NOTE: `properties.viewCount` (shared/schema.ts) is
 * a single running total — nothing in this codebase logs a per-day view
 * history to compute a true "views this week" from. This module keeps its
 * OWN weekly snapshot of every property's viewCount (gene_property_
 * analytics_snapshots) and reports "views this week" as the delta against
 * last week's snapshot. A property with no prior snapshot (the very first
 * time this ever runs, or a property created since) has no delta to
 * report — shown honestly as "new" rather than a fabricated number, same
 * "never invent what you don't have" policy as the rest of GENE (e.g.
 * btc-payments.ts's live-rate requirement).
 *
 * Persistence: shared JSON-file collection store (see ./store.ts).
 */
import type { Express, Request, Response, RequestHandler } from 'express'
import { storage } from '../storage'
import { readCollection, writeCollection, nowIso } from './store'
import { sendWhatsAppMessage } from './whatsapp'
import { getAdminWhatsappNumbers } from './admin-notify'
import { sendEmailToAdmins } from '../email-service'
import { requireStrictAdmin } from './admin-guard'
import type { Property } from '@shared/schema'

const SNAPSHOT_COLLECTION = 'gene_property_analytics_snapshots'

interface PropertySnapshot {
    propertyId: number
    viewCount: number
    capturedAt: string
}

export interface PropertyAnalyticsRow {
    property: Property
    viewsAllTime: number
    /** null = no prior snapshot exists for this property yet (first report, or created since). */
    viewsThisWeek: number | null
}

export interface WeeklyAnalyticsReport {
    generatedAt: string
    totalProperties: number
    totalViewsAllTime: number
    /** null only when NOT ONE property has a prior snapshot (the very first run ever). */
    totalViewsThisWeek: number | null
    isFirstReport: boolean
    rows: PropertyAnalyticsRow[]
}

function loadSnapshots(): Record<number, PropertySnapshot> {
    const rows = readCollection<PropertySnapshot>(SNAPSHOT_COLLECTION)
    const map: Record<number, PropertySnapshot> = {}
    for (const r of rows) map[r.propertyId] = r
    return map
}

/**
 * Pure compute against current data — does NOT touch the stored snapshot,
 * so previewing a report (the CSV export route) never consumes next week's
 * real baseline. Call commitAnalyticsSnapshot() separately once a report is
 * actually "delivered" for the week.
 */
export async function buildWeeklyAnalyticsReport(): Promise<WeeklyAnalyticsReport> {
    const properties = await storage.getAllProperties()
    const lastSnapshots = loadSnapshots()

    let anyHadSnapshot = false
    const rows: PropertyAnalyticsRow[] = properties.map((p) => {
        const viewsAllTime = p.viewCount ?? 0
        const prior = lastSnapshots[p.id]
        let viewsThisWeek: number | null = null
        if (prior) {
            anyHadSnapshot = true
            // max(0, ...) guards against a viewCount that was reset/edited
            // by hand between snapshots producing a nonsensical negative delta.
            viewsThisWeek = Math.max(0, viewsAllTime - prior.viewCount)
        }
        return { property: p, viewsAllTime, viewsThisWeek }
    })

    rows.sort((a, b) => {
        const aw = a.viewsThisWeek ?? -1
        const bw = b.viewsThisWeek ?? -1
        if (bw !== aw) return bw - aw
        return b.viewsAllTime - a.viewsAllTime
    })

    const totalViewsAllTime = rows.reduce((sum, r) => sum + r.viewsAllTime, 0)
    const totalViewsThisWeek = anyHadSnapshot ? rows.reduce((sum, r) => sum + (r.viewsThisWeek ?? 0), 0) : null

    return {
        generatedAt: nowIso(),
        totalProperties: rows.length,
        totalViewsAllTime,
        totalViewsThisWeek,
        isFirstReport: !anyHadSnapshot,
        rows,
    }
}

/** Persists this run's viewCounts as the new baseline for next week's diff. */
export async function commitAnalyticsSnapshot(): Promise<void> {
    const properties = await storage.getAllProperties()
    const rows: PropertySnapshot[] = properties.map((p) => ({
        propertyId: p.id,
        viewCount: p.viewCount ?? 0,
        capturedAt: nowIso(),
    }))
    writeCollection(SNAPSHOT_COLLECTION, rows)
}

function csvEscape(value: string): string {
    return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function reportToCsv(report: WeeklyAnalyticsReport): string {
    const header = ['Property', 'Location', 'Category', 'Price', 'Currency', 'Available', 'Views this week', 'Views all-time']
    const lines = [header.join(',')]
    for (const r of report.rows) {
        lines.push(
            [
                csvEscape(r.property.title ?? ''),
                csvEscape(r.property.location ?? ''),
                csvEscape(r.property.category ?? ''),
                String(r.property.price ?? ''),
                csvEscape(r.property.currency ?? 'UGX'),
                r.property.isAvailable ? 'Yes' : 'No',
                r.viewsThisWeek === null ? 'new' : String(r.viewsThisWeek),
                String(r.viewsAllTime),
            ].join(',')
        )
    }
    return lines.join('\n')
}

function formatReportDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function reportToWhatsappText(report: WeeklyAnalyticsReport): string {
    const top = report.rows.slice(0, 5)
    return [
        `📊 Weekly Property Analytics — ${formatReportDate(report.generatedAt)}`,
        '',
        `${report.totalProperties} properties · ${report.totalViewsAllTime.toLocaleString()} views all-time`,
        report.isFirstReport
            ? '(First report — a baseline is now saved, so next Saturday shows real week-over-week numbers.)'
            : `${(report.totalViewsThisWeek ?? 0).toLocaleString()} views this week`,
        '',
        'Top properties this week:',
        ...top.map(
            (r, i) =>
                `${i + 1}. ${r.property.title} — ${r.viewsThisWeek === null ? 'new' : r.viewsThisWeek} this wk (${r.viewsAllTime} all-time)`
        ),
        '',
        'Full breakdown attached to your email.',
    ].join('\n')
}

function reportToEmailHtml(report: WeeklyAnalyticsReport): string {
    const rowsHtml = report.rows
        .map(
            (r) => `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${r.property.title ?? ''}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${r.property.location ?? ''}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${r.property.category ?? ''}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">${r.viewsThisWeek === null ? 'new' : r.viewsThisWeek}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">${r.viewsAllTime}</td>
      </tr>`
        )
        .join('')

    return `
    <div style="font-family:Arial,sans-serif;color:#222;max-width:680px;">
      <h2 style="margin-bottom:4px;">Weekly Property Analytics</h2>
      <p style="color:#666;margin-top:0;">${new Date(report.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      <p>
        <strong>${report.totalProperties}</strong> properties &middot;
        <strong>${report.totalViewsAllTime.toLocaleString()}</strong> views all-time
        ${report.isFirstReport ? '' : ` &middot; <strong>${(report.totalViewsThisWeek ?? 0).toLocaleString()}</strong> views this week`}
      </p>
      ${
          report.isFirstReport
              ? `<p style="color:#888;font-size:13px;">This is the first report — a per-property baseline has now been saved, so next Saturday's report will show real week-over-week numbers.</p>`
              : ''
      }
      <table style="border-collapse:collapse;width:100%;font-size:14px;">
        <thead>
          <tr style="background:#f5f5f5;text-align:left;">
            <th style="padding:6px 10px;">Property</th>
            <th style="padding:6px 10px;">Location</th>
            <th style="padding:6px 10px;">Category</th>
            <th style="padding:6px 10px;text-align:right;">This week</th>
            <th style="padding:6px 10px;text-align:right;">All-time</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <p style="color:#999;font-size:12px;margin-top:16px;">Full CSV attached. Sent automatically every Saturday at 10:00 AM (East Africa Time) — RealEVR Estates.</p>
    </div>
  `
}

/**
 * The scheduled job (server/cron/index.ts, every Saturday 10:00 EAT) AND the
 * manual trigger below both call this — identical behavior either way.
 * Sends to both channels independently (one failing never blocks the
 * other), then commits this run's viewCounts as next week's baseline — so a
 * manual trigger between two Saturdays still advances the baseline
 * correctly instead of causing next Saturday's real run to double-count.
 */
export async function sendWeeklyAnalyticsExport(): Promise<{
    report: WeeklyAnalyticsReport
    whatsapp: { sent: number; attempted: number }
    email: { sent: number; attempted: number }
}> {
    const report = await buildWeeklyAnalyticsReport()
    const whatsappText = reportToWhatsappText(report)

    const numbers = getAdminWhatsappNumbers()
    let whatsappSent = 0
    for (const number of numbers) {
        const result = await sendWhatsAppMessage(number, whatsappText).catch((err) => {
            console.error(`[gene/analytics-export] WhatsApp send failed for ${number}:`, err)
            return { sent: false }
        })
        if (result.sent) whatsappSent += 1
    }

    const csv = reportToCsv(report)
    const emailResult = await sendEmailToAdmins(
        `Weekly Property Analytics — ${formatReportDate(report.generatedAt)}`,
        reportToEmailHtml(report),
        whatsappText,
        [{ filename: `property-analytics-${report.generatedAt.slice(0, 10)}.csv`, content: csv, contentType: 'text/csv' }]
    ).catch((err) => {
        console.error('[gene/analytics-export] email send failed:', err)
        return { sent: 0, attempted: 0 }
    })

    // Commit AFTER both sends attempt — a delivery failure shouldn't also
    // cost the baseline, but the baseline should still reflect "as of this
    // run" regardless of delivery outcome (matches this module's own
    // fire-and-forget, best-effort posture elsewhere in GENE).
    await commitAnalyticsSnapshot()

    return {
        report,
        whatsapp: { sent: whatsappSent, attempted: numbers.length },
        email: emailResult,
    }
}

export function registerAnalyticsExportRoutes(app: Express, adminMiddleware: RequestHandler): void {
    // [ADMIN or AGENT] Lightweight JSON summary (no full row dump) — the
    // "View Trends" button's backend in AgentDashboard.tsx. Same scoping as
    // the CSV export below.
    app.get('/api/gene/analytics/summary', adminMiddleware, async (req: Request, res: Response) => {
        try {
            const report = await buildWeeklyAnalyticsReport()
            const user = req.user as any
            const rows = user?.role === 'admin' ? report.rows : report.rows.filter((r) => r.property.ownerId === user?.id)
            const totalViewsAllTime = rows.reduce((sum, r) => sum + r.viewsAllTime, 0)
            const anyHadSnapshot = rows.some((r) => r.viewsThisWeek !== null)
            const totalViewsThisWeek = anyHadSnapshot ? rows.reduce((sum, r) => sum + (r.viewsThisWeek ?? 0), 0) : null
            res.json({
                generatedAt: report.generatedAt,
                totalProperties: rows.length,
                totalViewsAllTime,
                totalViewsThisWeek,
                isFirstReport: !anyHadSnapshot,
                topProperty: rows[0] ? { title: rows[0].property.title, viewsThisWeek: rows[0].viewsThisWeek, viewsAllTime: rows[0].viewsAllTime } : null,
            })
        } catch (err) {
            console.error('[gene/analytics-export] summary failed:', err)
            res.status(500).json({ message: 'Failed to load analytics summary.' })
        }
    })

    // [ADMIN or AGENT] Real, on-demand CSV export — the "Export Analytics"
    // button's backend in AgentDashboard.tsx. An agent gets only the
    // properties they own; a strict admin gets every property.
    app.get('/api/gene/analytics/export.csv', adminMiddleware, async (req: Request, res: Response) => {
        try {
            const report = await buildWeeklyAnalyticsReport()
            const user = req.user as any
            const scopedRows = user?.role === 'admin' ? report.rows : report.rows.filter((r) => r.property.ownerId === user?.id)
            const csv = reportToCsv({ ...report, rows: scopedRows })
            res.setHeader('Content-Type', 'text/csv; charset=utf-8')
            res.setHeader('Content-Disposition', `attachment; filename="property-analytics-${nowIso().slice(0, 10)}.csv"`)
            res.send(csv)
        } catch (err) {
            console.error('[gene/analytics-export] CSV export failed:', err)
            res.status(500).json({ message: 'Failed to export analytics.' })
        }
    })

    // [STRICT ADMIN] Trigger the exact same weekly WhatsApp+email export on
    // demand — sends to the platform owner's own channels, so scoped to the
    // owner only (same reasoning as admin-guard.ts's other strict routes),
    // not the looser admin-OR-agent adminMiddleware. Useful to confirm
    // delivery without waiting for Saturday, or to resend.
    app.post('/api/gene/analytics/weekly-export/run', requireStrictAdmin, async (_req: Request, res: Response) => {
        try {
            const result = await sendWeeklyAnalyticsExport()
            res.json({
                generatedAt: result.report.generatedAt,
                totalProperties: result.report.totalProperties,
                totalViewsThisWeek: result.report.totalViewsThisWeek,
                isFirstReport: result.report.isFirstReport,
                whatsapp: result.whatsapp,
                email: result.email,
            })
        } catch (err) {
            console.error('[gene/analytics-export] manual weekly export failed:', err)
            res.status(500).json({ message: 'Failed to run the weekly analytics export.' })
        }
    })
}
