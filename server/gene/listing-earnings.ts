/**
 * GENE Platform — Listing earnings: agents earn real money for the
 * properties they add through the normal (authenticated) upload flow,
 * redeemable once their accrued balance crosses 10,000 UGX.
 *
 * "add the amount someone makes by adding a property and someone can only
 * claim the money after making 10,000" — distinct from two other,
 * pre-existing "agent gets paid" mechanisms that must NOT be conflated
 * with this one:
 *   - server/gene/self-serve-listing.ts: an anonymous, non-account
 *     referral flow (submit a property you don't manage, landlord
 *     verifies by WhatsApp OTP, flat 1,000 UGX paid out per listing,
 *     individually, immediately). recordListingEarning() below is never
 *     called from that flow.
 *   - server/gene/referral-rewards.ts: points for *sharing* listings
 *     (1 share = 1 point = 10 UGX), unrelated to who uploaded them.
 * This module is specifically: signed-in agent/admin uploads a property
 * via the normal dashboard form (POST /api/properties/create) -> a fixed
 * per-listing amount (LISTING_EARNING_UGX) accrues to their balance ->
 * once the balance is >= MIN_PAYOUT_UGX (10,000) they can request a
 * payout, reviewed the same way as referral-rewards.ts's payouts.
 *
 * HONESTY NOTE, same policy as payments-core.ts and referral-rewards.ts:
 * approval never means money has actually moved. It only flips a request
 * to `approved_manual_payout_required` — a human still sends the money
 * out-of-band and calls the mark-paid endpoint.
 *
 * Persistence: shared JSON-file collection store (see ./store.ts).
 */
import type { Express, Request, Response, NextFunction, RequestHandler } from 'express'
import { readCollection, writeCollection, nextId, nowIso } from './store'
import { createNotification } from '../models/Notification'

const EARNING_COLLECTION = 'gene_listing_earnings'
const PAYOUT_COLLECTION = 'gene_listing_payout_requests'

// Flat amount credited per property successfully listed through the
// authenticated dashboard upload flow. Adjustable without touching the
// payout-threshold logic below.
export const LISTING_EARNING_UGX = 500
export const MIN_PAYOUT_UGX = 10000 // "can only claim the money after making 10,000"

export interface ListingEarning {
    id: number
    userId: number
    propertyId: number
    propertyTitle: string
    amountUgx: number
    createdAt: string
}

export type ListingPayoutStatus = 'pending_review' | 'approved_manual_payout_required' | 'paid' | 'rejected'

export interface ListingPayoutRequest {
    id: number
    userId: number
    ugxAmount: number
    mobileMoneyNumber: string
    provider: string
    status: ListingPayoutStatus
    createdAt: string
    decidedAt?: string
    decidedBy?: string
    note?: string
}

function requireUser(req: Request, res: Response, next: NextFunction) {
    if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: 'Sign in to view your listing earnings.' })
    }
    next()
}

const PHONE_SANITY_RE = /^\+?[0-9]{6,20}$/

function loadEarnings(userId: number): ListingEarning[] {
    return readCollection<ListingEarning>(EARNING_COLLECTION).filter((e) => e.userId === userId)
}

function loadPayouts(userId?: number): ListingPayoutRequest[] {
    const rows = readCollection<ListingPayoutRequest>(PAYOUT_COLLECTION)
    return userId === undefined ? rows : rows.filter((r) => r.userId === userId)
}

function committedUgx(userId: number): number {
    return loadPayouts(userId)
        .filter((r) => r.status !== 'rejected')
        .reduce((sum, r) => sum + r.ugxAmount, 0)
}

function computeBalance(userId: number) {
    const earnings = loadEarnings(userId)
    const totalListings = earnings.length
    const totalUgx = earnings.reduce((sum, e) => sum + e.amountUgx, 0)
    const committed = committedUgx(userId)
    const availableUgx = Math.max(0, totalUgx - committed)
    return {
        totalListings,
        totalUgx,
        availableUgx,
        minPayoutUgx: MIN_PAYOUT_UGX,
        canRequestPayout: availableUgx >= MIN_PAYOUT_UGX,
    }
}

/**
 * Credit a user for successfully listing a property through the normal
 * authenticated dashboard flow. Call this from POST /api/properties/create
 * only — never from self-serve-listing.ts's submission path, which has its
 * own separate, immediate 1,000 UGX referral payout per listing.
 *
 * Fires a one-time "you can claim your reward" notification the moment
 * this listing pushes the user's available balance from below 10,000 UGX
 * to at/above it, same threshold-crossing pattern as referral-rewards.ts.
 */
export async function recordListingEarning(userId: number, propertyId: number, propertyTitle: string): Promise<void> {
    try {
        if (!Number.isFinite(userId) || !Number.isFinite(propertyId)) return
        const rows = readCollection<ListingEarning>(EARNING_COLLECTION)
        const balanceBefore = computeBalance(userId)

        const entry: ListingEarning = {
            id: nextId(rows),
            userId,
            propertyId,
            propertyTitle: propertyTitle || `Property #${propertyId}`,
            amountUgx: LISTING_EARNING_UGX,
            createdAt: nowIso(),
        }
        rows.push(entry)
        writeCollection(EARNING_COLLECTION, rows)

        const balance = computeBalance(userId)
        if (balance.canRequestPayout && !balanceBefore.canRequestPayout) {
            await createNotification({
                userId: String(userId),
                title: 'You can claim your listing earnings!',
                message: `You've earned ${balance.availableUgx} UGX for the properties you've listed — request your payout now.`,
                type: 'payment',
                link: '/dashboard?tab=rewards',
            }).catch((err) => console.error('[gene/listing-earnings] threshold notification failed:', err))
        }
    } catch (err) {
        console.error('[gene/listing-earnings] recordListingEarning failed:', err)
    }
}

export function registerListingEarningsRoutes(app: Express, adminMiddleware: RequestHandler): void {
    // GET /api/gene/listing-earnings/balance — [AUTH]
    app.get('/api/gene/listing-earnings/balance', requireUser, (req, res) => {
        const userId = (req.user as any).id
        res.json(computeBalance(userId))
    })

    // GET /api/gene/listing-earnings/history — [AUTH]
    app.get('/api/gene/listing-earnings/history', requireUser, (req, res) => {
        const userId = (req.user as any).id
        const rows = loadEarnings(userId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        res.json(rows)
    })

    // POST /api/gene/listing-earnings/payout-request — [AUTH] { mobileMoneyNumber, provider }
    app.post('/api/gene/listing-earnings/payout-request', requireUser, (req, res) => {
        try {
            const userId = (req.user as any).id
            const { mobileMoneyNumber, provider } = req.body ?? {}
            if (typeof mobileMoneyNumber !== 'string' || !PHONE_SANITY_RE.test(mobileMoneyNumber.trim())) {
                return res.status(400).json({ message: 'A valid mobileMoneyNumber (digits, optional leading +) is required.' })
            }
            if (typeof provider !== 'string' || !provider.trim()) {
                return res.status(400).json({ message: 'provider (e.g. "MTN" or "Airtel") is required.' })
            }

            const balance = computeBalance(userId)
            if (balance.availableUgx < MIN_PAYOUT_UGX) {
                return res.status(400).json({
                    message: `You need at least ${MIN_PAYOUT_UGX} UGX in listing earnings to request a payout. You have ${balance.availableUgx} available.`,
                })
            }

            const rows = readCollection<ListingPayoutRequest>(PAYOUT_COLLECTION)
            const request: ListingPayoutRequest = {
                id: nextId(rows),
                userId,
                ugxAmount: balance.availableUgx,
                mobileMoneyNumber: mobileMoneyNumber.trim(),
                provider: provider.trim(),
                status: 'pending_review',
                createdAt: nowIso(),
            }
            rows.push(request)
            writeCollection(PAYOUT_COLLECTION, rows)

            res.status(201).json({ request, balance: computeBalance(userId) })
        } catch (err) {
            console.error('[gene/listing-earnings] POST /api/gene/listing-earnings/payout-request failed:', err)
            res.status(500).json({ message: 'Failed to submit your payout request.' })
        }
    })

    // GET /api/gene/listing-earnings/payout-requests/me — [AUTH]
    app.get('/api/gene/listing-earnings/payout-requests/me', requireUser, (req, res) => {
        const userId = (req.user as any).id
        const rows = loadPayouts(userId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        res.json(rows)
    })

    // GET /api/gene/listing-earnings/payout-requests — [ADMIN] optional ?status=
    app.get('/api/gene/listing-earnings/payout-requests', adminMiddleware, (req: Request, res: Response) => {
        try {
            const status = typeof req.query.status === 'string' ? req.query.status : undefined
            let rows = loadPayouts()
            if (status) rows = rows.filter((r) => r.status === status)
            rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            res.json(rows)
        } catch (err) {
            console.error('[gene/listing-earnings] GET payout-requests failed:', err)
            res.status(500).json({ message: 'Failed to load payout requests.' })
        }
    })

    // POST /api/gene/listing-earnings/payout-requests/:id/approve — [ADMIN]
    app.post('/api/gene/listing-earnings/payout-requests/:id/approve', adminMiddleware, (req: Request, res: Response) => {
        try {
            const rows = readCollection<ListingPayoutRequest>(PAYOUT_COLLECTION)
            const idx = rows.findIndex((r) => String(r.id) === req.params.id)
            if (idx === -1) return res.status(404).json({ message: 'Payout request not found.' })
            if (rows[idx].status !== 'pending_review') {
                return res.status(400).json({ message: `Cannot approve a request in status "${rows[idx].status}".` })
            }

            const mobileMoneyConfigured = !!process.env.MOBILE_MONEY_API_KEY
            const decidedBy = (req.user as any)?.username ?? (req.user as any)?.email ?? 'unknown-admin'

            rows[idx] = {
                ...rows[idx],
                status: 'approved_manual_payout_required',
                decidedAt: nowIso(),
                decidedBy,
                note: mobileMoneyConfigured
                    ? 'Approved — send via your mobile money provider, then mark as paid.'
                    : 'Approved — MOBILE_MONEY_API_KEY not set, so this must be sent manually, then marked as paid.',
            }
            writeCollection(PAYOUT_COLLECTION, rows)
            res.json(rows[idx])
        } catch (err) {
            console.error('[gene/listing-earnings] approve failed:', err)
            res.status(500).json({ message: 'Failed to approve payout request.' })
        }
    })

    // POST /api/gene/listing-earnings/payout-requests/:id/mark-paid — [ADMIN]
    app.post('/api/gene/listing-earnings/payout-requests/:id/mark-paid', adminMiddleware, (req: Request, res: Response) => {
        try {
            const rows = readCollection<ListingPayoutRequest>(PAYOUT_COLLECTION)
            const idx = rows.findIndex((r) => String(r.id) === req.params.id)
            if (idx === -1) return res.status(404).json({ message: 'Payout request not found.' })
            if (rows[idx].status !== 'approved_manual_payout_required') {
                return res.status(400).json({ message: `Cannot mark paid a request in status "${rows[idx].status}".` })
            }
            rows[idx] = { ...rows[idx], status: 'paid', decidedAt: nowIso() }
            writeCollection(PAYOUT_COLLECTION, rows)
            res.json(rows[idx])
        } catch (err) {
            console.error('[gene/listing-earnings] mark-paid failed:', err)
            res.status(500).json({ message: 'Failed to mark payout request as paid.' })
        }
    })

    // POST /api/gene/listing-earnings/payout-requests/:id/reject — [ADMIN] { reason }
    app.post('/api/gene/listing-earnings/payout-requests/:id/reject', adminMiddleware, (req: Request, res: Response) => {
        try {
            const rows = readCollection<ListingPayoutRequest>(PAYOUT_COLLECTION)
            const idx = rows.findIndex((r) => String(r.id) === req.params.id)
            if (idx === -1) return res.status(404).json({ message: 'Payout request not found.' })
            if (rows[idx].status !== 'pending_review') {
                return res.status(400).json({ message: `Cannot reject a request in status "${rows[idx].status}".` })
            }
            const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined
            rows[idx] = {
                ...rows[idx],
                status: 'rejected',
                decidedAt: nowIso(),
                decidedBy: (req.user as any)?.username ?? (req.user as any)?.email ?? 'unknown-admin',
                note: reason,
            }
            writeCollection(PAYOUT_COLLECTION, rows)
            res.json(rows[idx])
        } catch (err) {
            console.error('[gene/listing-earnings] reject failed:', err)
            res.status(500).json({ message: 'Failed to reject payout request.' })
        }
    })
}
