/**
 * Checkable trust on a listing: facts a visitor can verify instead of badges they have to take on faith, and a way to report a
 * listing that turns out to be wrong.
 *
 *   GET  /api/properties/:id/trust   public facts about whoever manages the listing: when they joined, how many listings they
 *                                    have, how many of those have a tour, whether their email is confirmed. Nothing is
 *                                    claimed that is not stored: we do not check IDs or phone numbers, so we do not say we do.
 *   POST /api/properties/:id/report  anyone can report a listing (scam, already rented, wrong details, fake photos). Admins are
 *                                    told in-app, by email and on WhatsApp.
 *   GET  /api/admin/listing-reports  admin review list.
 *
 * Reports are stored in the shared JSON collection store (see ./store.ts), collection `gene_listing_reports`.
 */
import crypto from 'crypto'
import type { Express, Request, RequestHandler, Response } from 'express'
import { storage } from '../storage'
import { nextId, nowIso, readCollection, writeCollection } from './store'
import { notifyAdminsEverywhere } from './admin-notify'

const COLLECTION = 'gene_listing_reports'

export const REPORT_REASONS = {
    scam: 'Looks like a scam',
    already_rented: 'Already rented or sold',
    wrong_info: 'Wrong price, place or details',
    fake_photos: 'Photos are not of this property',
    other: 'Something else',
} as const
export type ReportReason = keyof typeof REPORT_REASONS

export interface ListingReport {
    id: number
    propertyId: number
    propertyTitle: string
    reason: ReportReason
    details: string
    contact: string
    reporterKey: string
    createdAt: string
    status: 'open' | 'reviewed'
}

export interface ListingTrustFacts {
    propertyId: number
    owner: {
        /** "YYYY-MM" the account was created, or null when it was never recorded. */
        joined: string | null
        listings: number
        withTours: number
        emailVerified: boolean
    } | null
}

const MAX_DETAILS = 500
const MAX_CONTACT = 80
const MAX_REPORTS_PER_KEY_PER_HOUR = 5

/** Plain text only: no control characters, no angle brackets, bounded length. */
export function cleanText(value: unknown, max: number): string {
    if (typeof value !== 'string') return ''
    return value
        .replace(/[\u0000-\u001f\u007f]+/g, ' ')
        .replace(/[<>]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A stable, non-reversible key for "the same person" so repeat reports can be limited without storing an IP address. */
function reporterKey(req: Request): string {
    const ip = String(req.ip || req.socket?.remoteAddress || 'unknown')
    const salt = process.env.SESSION_SECRET || 'realevr-report-salt'
    return crypto.createHash('sha256').update(`${salt}|${ip}`).digest('hex').slice(0, 16)
}

export async function buildTrustFacts(propertyId: number): Promise<ListingTrustFacts | null> {
    const property = await storage.getProperty(propertyId)
    if (!property) return null
    if (property.ownerId == null) return { propertyId, owner: null }

    const [owner, all] = await Promise.all([storage.getUser(property.ownerId), storage.getAllProperties()])
    if (!owner) return { propertyId, owner: null }
    const theirs = all.filter((p) => p.ownerId === property.ownerId && p.isAvailable !== false)
    const created = typeof owner.createdAt === 'string' ? new Date(owner.createdAt) : null
    return {
        propertyId,
        owner: {
            joined: created && !Number.isNaN(created.getTime()) ? created.toISOString().slice(0, 7) : null,
            listings: theirs.length,
            // hasTour defaults to true in the schema, so a tour only counts when there is a real tour to open.
            withTours: theirs.filter((p) => p.hasTour && p.tourUrl).length,
            emailVerified: Boolean(owner.isVerified),
        },
    }
}

export function registerListingTrustRoutes(app: Express, adminMiddleware: RequestHandler): void {
    app.get('/api/properties/:id/trust', async (req: Request, res: Response) => {
        try {
            const id = Number(req.params.id)
            if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid property id.' })
            const facts = await buildTrustFacts(id)
            if (!facts) return res.status(404).json({ message: 'Property not found.' })
            res.set('Cache-Control', 'public, max-age=120').json(facts)
        } catch (err) {
            console.error('[gene/listing-trust] facts failed:', err)
            res.status(500).json({ message: 'Could not load listing facts.' })
        }
    })

    app.post('/api/properties/:id/report', async (req: Request, res: Response) => {
        try {
            const id = Number(req.params.id)
            if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid property id.' })

            const body = (req.body ?? {}) as Record<string, unknown>
            // A hidden field only bots fill in: accept quietly so they learn nothing.
            if (typeof body.website === 'string' && body.website.trim() !== '') return res.status(201).json({ ok: true })

            const reason = String(body.reason ?? '') as ReportReason
            if (!(reason in REPORT_REASONS)) return res.status(400).json({ message: 'Choose what is wrong with this listing.' })
            const details = cleanText(body.details, MAX_DETAILS)
            if (reason === 'other' && details.length < 10) {
                return res.status(400).json({ message: 'Tell us a little about what is wrong (at least a sentence).' })
            }

            const property = await storage.getProperty(id)
            if (!property) return res.status(404).json({ message: 'Property not found.' })

            const key = reporterKey(req)
            const rows = readCollection<ListingReport>(COLLECTION)
            const hourAgo = Date.now() - 60 * 60_000
            const recent = rows.filter((r) => r.reporterKey === key && Date.parse(r.createdAt) > hourAgo)
            if (recent.length >= MAX_REPORTS_PER_KEY_PER_HOUR) {
                return res.status(429).json({ message: 'You have sent several reports in a short time. Please try again later.' })
            }
            // The same person reporting the same listing for the same reason twice is one report.
            if (recent.some((r) => r.propertyId === id && r.reason === reason)) {
                return res.status(201).json({ ok: true, message: 'Thanks, we already have your report on this listing.' })
            }

            const report: ListingReport = {
                id: nextId(rows),
                propertyId: id,
                propertyTitle: cleanText(property.title, 120),
                reason,
                details,
                contact: cleanText(body.contact, MAX_CONTACT),
                reporterKey: key,
                createdAt: nowIso(),
                status: 'open',
            }
            rows.push(report)
            writeCollection(COLLECTION, rows)

            const openForListing = rows.filter((r) => r.propertyId === id && r.status === 'open').length
            const summary = `"${report.propertyTitle}" (listing #${id}) was reported: ${REPORT_REASONS[reason]}.${details ? ` "${details}"` : ''}${report.contact ? ` Reporter: ${report.contact}.` : ''} Open reports on this listing: ${openForListing}.`
            void notifyAdminsEverywhere({
                title: `Listing reported: ${report.propertyTitle}`,
                message: summary,
                html: `<p>${escapeHtml(summary)}</p>`,
                whatsappMessage: `🚩 ${summary}`,
                link: `/property/${id}`,
                data: { propertyId: id, reportId: report.id, reason },
            }).catch((err) => console.error('[gene/listing-trust] admin notification failed:', err))

            res.status(201).json({ ok: true, message: 'Thank you. Our team will look at this listing.' })
        } catch (err) {
            console.error('[gene/listing-trust] report failed:', err)
            res.status(500).json({ message: 'Could not send your report. Please try again.' })
        }
    })

    app.get('/api/admin/listing-reports', adminMiddleware, (req: Request, res: Response) => {
        const rows = readCollection<ListingReport>(COLLECTION)
        const status = req.query.status === 'reviewed' ? 'reviewed' : req.query.status === 'all' ? null : 'open'
        const reports = rows
            .filter((r) => (status ? r.status === status : true))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map(({ reporterKey: _key, ...rest }) => rest)
        res.json({ total: reports.length, reports })
    })

    app.post('/api/admin/listing-reports/:id/reviewed', adminMiddleware, (req: Request, res: Response) => {
        const rows = readCollection<ListingReport>(COLLECTION)
        const row = rows.find((r) => r.id === Number(req.params.id))
        if (!row) return res.status(404).json({ message: 'Report not found.' })
        row.status = 'reviewed'
        writeCollection(COLLECTION, rows)
        res.json({ ok: true })
    })
}
