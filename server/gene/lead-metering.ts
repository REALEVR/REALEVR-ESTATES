/**
 * GENE Platform — pay-per-lead metering (monetization playbook, 2026-08-29,
 * Section 2 stream #5 / Section 8's 90-day list item 8). Each property gets
 * a free monthly quota of leads; beyond that, leads are marked `billable`
 * for manual invoicing — same honest, no-live-auto-charge pattern as every
 * other GENE payments module. This module does NOT invent a new lead
 * source: it's called from the one real, already-built lead event in this
 * codebase — `listings-lifecycle.ts`'s `POST /:propertyId/offers` (a buyer
 * submitting an inquiry) — via `recordLead()`, exported below. Wiring a
 * second lead source (e.g. a future per-property WhatsApp click) later is a
 * one-line call to the same function.
 *
 * Persistence: shared JSON-file collection store (see ./store.ts), collection
 * `gene_leads`.
 */
import type { Express, Request, Response, RequestHandler } from 'express'
import { readCollection, writeCollection, nextId, nowIso } from './store'

const COLLECTION = 'gene_leads'

/** Matches the playbook's own worked example (Section 2, stream #5). */
export const FREE_LEADS_PER_PROPERTY_PER_MONTH = 10
export const LEAD_PRICE_UGX = 2000

export type LeadChannel = 'inquiry' | 'whatsapp' | 'call'

export interface LeadRecord {
    id: number
    propertyId: number
    channel: LeadChannel
    monthKey: string // "2026-08" — the free-quota bucket
    leadNumberThisMonth: number // 1-indexed position within this property+month
    billable: boolean
    createdAt: string
}

function readLeads(): LeadRecord[] {
    return readCollection<LeadRecord>(COLLECTION)
}
function writeLeads(rows: LeadRecord[]): void {
    writeCollection(COLLECTION, rows)
}

function monthKeyFor(iso: string): string {
    return iso.slice(0, 7) // "YYYY-MM"
}

/** Call this from any real lead-generating event. Pure record-keeping — never
 * blocks or alters the caller's own response; callers should treat this as
 * best-effort (wrap in try/catch, as listings-lifecycle.ts does). */
export function recordLead(propertyId: number, channel: LeadChannel): LeadRecord {
    const now = nowIso()
    const monthKey = monthKeyFor(now)
    const rows = readLeads()
    const countThisMonth = rows.filter((r) => r.propertyId === propertyId && r.monthKey === monthKey).length
    const leadNumberThisMonth = countThisMonth + 1
    const billable = leadNumberThisMonth > FREE_LEADS_PER_PROPERTY_PER_MONTH

    const record: LeadRecord = {
        id: nextId(rows),
        propertyId,
        channel,
        monthKey,
        leadNumberThisMonth,
        billable,
        createdAt: now,
    }
    rows.push(record)
    writeLeads(rows)
    return record
}

export function registerLeadMeteringRoutes(app: Express, adminMiddleware: RequestHandler): void {
    // Public — lightweight ping for a future non-form lead source (e.g. a
    // per-property WhatsApp click button) to record itself without needing
    // to know anything about billing.
    app.post('/api/gene/leads/:propertyId/ping', (req: Request, res: Response) => {
        try {
            const propertyId = Number(req.params.propertyId)
            if (!Number.isFinite(propertyId)) return res.status(400).json({ message: 'Invalid property id.' })
            const channel = (req.body?.channel as LeadChannel) || 'whatsapp'
            if (!['inquiry', 'whatsapp', 'call'].includes(channel)) {
                return res.status(400).json({ message: 'channel must be one of: inquiry, whatsapp, call' })
            }
            const record = recordLead(propertyId, channel)
            res.status(201).json({ recorded: true, billable: record.billable })
        } catch (err) {
            console.error('[gene/lead-metering] ping failed:', err)
            res.status(500).json({ message: 'Failed to record lead.' })
        }
    })

    // [ADMIN or AGENT] — monthly billing summary for manual invoicing.
    app.get('/api/gene/leads/billing-summary', adminMiddleware, (req: Request, res: Response) => {
        try {
            const monthKey = typeof req.query.month === 'string' ? req.query.month : monthKeyFor(nowIso())
            const rows = readLeads().filter((r) => r.monthKey === monthKey && r.billable)

            const byProperty = new Map<number, number>()
            for (const r of rows) byProperty.set(r.propertyId, (byProperty.get(r.propertyId) ?? 0) + 1)

            const lines = Array.from(byProperty.entries()).map(([propertyId, billableLeadCount]) => ({
                propertyId,
                billableLeadCount,
                amountDueUgx: billableLeadCount * LEAD_PRICE_UGX,
            }))
            const totalUgx = lines.reduce((sum, l) => sum + l.amountDueUgx, 0)

            res.json({
                monthKey,
                freeLeadsPerPropertyPerMonth: FREE_LEADS_PER_PROPERTY_PER_MONTH,
                leadPriceUgx: LEAD_PRICE_UGX,
                lines,
                totalUgx,
                note: 'This is a manual-invoicing summary, not a live charge — no auto-billing gateway is wired here.',
            })
        } catch (err) {
            console.error('[gene/lead-metering] billing-summary failed:', err)
            res.status(500).json({ message: 'Failed to compute billing summary.' })
        }
    })

    // [ADMIN or AGENT] — raw lead list for one property (debugging/support).
    app.get('/api/gene/leads/:propertyId', adminMiddleware, (req: Request, res: Response) => {
        try {
            const propertyId = Number(req.params.propertyId)
            if (!Number.isFinite(propertyId)) return res.status(400).json({ message: 'Invalid property id.' })
            const rows = readLeads()
                .filter((r) => r.propertyId === propertyId)
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            res.json(rows)
        } catch (err) {
            console.error('[gene/lead-metering] list failed:', err)
            res.status(500).json({ message: 'Failed to load leads.' })
        }
    })
}
