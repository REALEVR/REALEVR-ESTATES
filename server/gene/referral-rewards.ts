/**
 * GENE Platform — Share-for-rewards: users earn points by sharing property
 * listings, redeemable for real mobile money once they cross a minimum
 * threshold.
 *
 * Conversion (as specified): 1 share = 1 point, 1,000 points = 10,000 UGX
 * → 1 point = 10 UGX. Minimum redeemable balance is 100 points (1,000 UGX)
 * so a payout request is worth the manual review overhead.
 *
 * HONESTY NOTE, same policy as payments-core.ts: this module never claims
 * to move real money. Every payout request is created in `pending_review`
 * and only an admin's explicit approval moves it forward — and even then,
 * unless a real mobile money provider is configured (MOBILE_MONEY_API_KEY,
 * same env var payments-core.ts already documents), approval marks the
 * request `approved_manual_payout_required` rather than `paid`, so a human
 * still has to actually send the money and mark it paid. This is the
 * "accrue points, user requests payout, admin approves" flow the user
 * explicitly chose over instant automatic payout.
 *
 * Anti-abuse: a share only counts once per (user, property) per
 * SHARE_COOLDOWN_MS — repeatedly tapping "share" on the same property
 * doesn't multiply points. This is a basic guard, not fraud-proofing;
 * flagged as a known limitation in docs/GENE_PLATFORM.md.
 *
 * Persistence: shared JSON-file collection store (see ./store.ts).
 */
import type { Express, Request, Response, NextFunction, RequestHandler } from 'express'
import { readCollection, writeCollection, nextId, nowIso } from './store'

const SHARE_COLLECTION = 'gene_share_events'
const PAYOUT_COLLECTION = 'gene_payout_requests'

export const POINTS_PER_SHARE = 1
export const UGX_PER_POINT = 10
export const MIN_PAYOUT_POINTS = 100 // = 1,000 UGX
const SHARE_COOLDOWN_MS = 10 * 60 * 1000 // 10 minutes per (user, property)

export interface ShareEvent {
    id: number
    userId: number
    propertyId: number
    channel: string // 'native_share' | 'copy_link' | 'whatsapp' | 'facebook' | 'twitter' | 'email' | ...
    counted: boolean // false if it fell inside the cooldown window (logged, but no points)
    createdAt: string
}

export type PayoutStatus = 'pending_review' | 'approved_manual_payout_required' | 'paid' | 'rejected'

export interface PayoutRequest {
    id: number
    userId: number
    pointsRequested: number
    ugxAmount: number
    mobileMoneyNumber: string
    provider: string // e.g. 'MTN' | 'Airtel'
    status: PayoutStatus
    createdAt: string
    decidedAt?: string
    decidedBy?: string
    note?: string
}

function requireUser(req: Request, res: Response, next: NextFunction) {
    if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: 'Sign in to share and earn rewards.' })
    }
    next()
}

const PHONE_SANITY_RE = /^\+?[0-9]{6,20}$/

function loadShares(userId: number): ShareEvent[] {
    return readCollection<ShareEvent>(SHARE_COLLECTION).filter((s) => s.userId === userId)
}

function loadPayouts(userId?: number): PayoutRequest[] {
    const rows = readCollection<PayoutRequest>(PAYOUT_COLLECTION)
    return userId === undefined ? rows : rows.filter((r) => r.userId === userId)
}

/** Points already spoken for by a non-rejected payout request. */
function committedPoints(userId: number): number {
    return loadPayouts(userId)
        .filter((r) => r.status !== 'rejected')
        .reduce((sum, r) => sum + r.pointsRequested, 0)
}

function computeBalance(userId: number) {
    const shares = loadShares(userId)
    const totalShares = shares.filter((s) => s.counted).length
    const totalPoints = totalShares * POINTS_PER_SHARE
    const committed = committedPoints(userId)
    const availablePoints = Math.max(0, totalPoints - committed)
    return {
        totalShares,
        totalPoints,
        ugxValue: totalPoints * UGX_PER_POINT,
        availablePoints,
        availableUgx: availablePoints * UGX_PER_POINT,
        minPayoutPoints: MIN_PAYOUT_POINTS,
        minPayoutUgx: MIN_PAYOUT_POINTS * UGX_PER_POINT,
        canRequestPayout: availablePoints >= MIN_PAYOUT_POINTS,
    }
}

export function registerReferralRewardsRoutes(app: Express, adminMiddleware: RequestHandler): void {
    // POST /api/gene/rewards/share — [AUTH] { propertyId, channel } -> updated balance
    app.post('/api/gene/rewards/share', requireUser, (req, res) => {
        try {
            const userId = (req.user as any).id
            const propertyId = Number(req.body?.propertyId)
            const channel = typeof req.body?.channel === 'string' ? req.body.channel : 'unknown'
            if (!Number.isFinite(propertyId)) {
                return res.status(400).json({ message: 'propertyId (number) is required.' })
            }

            const rows = readCollection<ShareEvent>(SHARE_COLLECTION)
            const recentSame = rows
                .filter((s) => s.userId === userId && s.propertyId === propertyId && s.counted)
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
            const withinCooldown = recentSame && Date.now() - new Date(recentSame.createdAt).getTime() < SHARE_COOLDOWN_MS

            const event: ShareEvent = {
                id: nextId(rows),
                userId,
                propertyId,
                channel,
                counted: !withinCooldown,
                createdAt: nowIso(),
            }
            rows.push(event)
            writeCollection(SHARE_COLLECTION, rows)

            res.status(201).json({
                counted: event.counted,
                message: event.counted ? undefined : "You already earned points sharing this property recently — try again later, or share a different one!",
                balance: computeBalance(userId),
            })
        } catch (err) {
            console.error('[gene/referral-rewards] POST /api/gene/rewards/share failed:', err)
            res.status(500).json({ message: 'Failed to record your share.' })
        }
    })

    // GET /api/gene/rewards/balance — [AUTH]
    app.get('/api/gene/rewards/balance', requireUser, (req, res) => {
        const userId = (req.user as any).id
        res.json(computeBalance(userId))
    })

    // POST /api/gene/rewards/payout-request — [AUTH] { pointsToRedeem?, mobileMoneyNumber, provider }
    app.post('/api/gene/rewards/payout-request', requireUser, (req, res) => {
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
            const requestedRaw = Number(req.body?.pointsToRedeem)
            const pointsRequested = Number.isFinite(requestedRaw) && requestedRaw > 0 ? Math.floor(requestedRaw) : balance.availablePoints

            if (pointsRequested < MIN_PAYOUT_POINTS) {
                return res.status(400).json({
                    message: `You need at least ${MIN_PAYOUT_POINTS} points (${MIN_PAYOUT_POINTS * UGX_PER_POINT} UGX) to request a payout. You have ${balance.availablePoints} available.`,
                })
            }
            if (pointsRequested > balance.availablePoints) {
                return res.status(400).json({
                    message: `You only have ${balance.availablePoints} points available to redeem.`,
                })
            }

            const rows = readCollection<PayoutRequest>(PAYOUT_COLLECTION)
            const request: PayoutRequest = {
                id: nextId(rows),
                userId,
                pointsRequested,
                ugxAmount: pointsRequested * UGX_PER_POINT,
                mobileMoneyNumber: mobileMoneyNumber.trim(),
                provider: provider.trim(),
                status: 'pending_review',
                createdAt: nowIso(),
            }
            rows.push(request)
            writeCollection(PAYOUT_COLLECTION, rows)

            res.status(201).json({ request, balance: computeBalance(userId) })
        } catch (err) {
            console.error('[gene/referral-rewards] POST /api/gene/rewards/payout-request failed:', err)
            res.status(500).json({ message: 'Failed to submit your payout request.' })
        }
    })

    // GET /api/gene/rewards/payout-requests/me — [AUTH]
    app.get('/api/gene/rewards/payout-requests/me', requireUser, (req, res) => {
        const userId = (req.user as any).id
        const rows = loadPayouts(userId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        res.json(rows)
    })

    // GET /api/gene/rewards/payout-requests — [ADMIN] optional ?status=
    app.get('/api/gene/rewards/payout-requests', adminMiddleware, (req: Request, res: Response) => {
        try {
            const status = typeof req.query.status === 'string' ? req.query.status : undefined
            let rows = loadPayouts()
            if (status) rows = rows.filter((r) => r.status === status)
            rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            res.json(rows)
        } catch (err) {
            console.error('[gene/referral-rewards] GET /api/gene/rewards/payout-requests failed:', err)
            res.status(500).json({ message: 'Failed to load payout requests.' })
        }
    })

    // POST /api/gene/rewards/payout-requests/:id/approve — [ADMIN]
    app.post('/api/gene/rewards/payout-requests/:id/approve', adminMiddleware, (req: Request, res: Response) => {
        try {
            const rows = readCollection<PayoutRequest>(PAYOUT_COLLECTION)
            const idx = rows.findIndex((r) => String(r.id) === req.params.id)
            if (idx === -1) return res.status(404).json({ message: 'Payout request not found.' })
            if (rows[idx].status !== 'pending_review') {
                return res.status(400).json({ message: `Cannot approve a request in status "${rows[idx].status}".` })
            }

            const mobileMoneyConfigured = !!process.env.MOBILE_MONEY_API_KEY
            const decidedBy = (req.user as any)?.username ?? (req.user as any)?.email ?? 'unknown-admin'

            rows[idx] = {
                ...rows[idx],
                // Honest per payments-core.ts's ManualPaymentProvider policy: no
                // real mobile money gateway is wired up here even when the key
                // exists (that's payments-core.ts's job) — always require a
                // human to actually send the money and mark it paid below.
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
            console.error('[gene/referral-rewards] approve failed:', err)
            res.status(500).json({ message: 'Failed to approve payout request.' })
        }
    })

    // POST /api/gene/rewards/payout-requests/:id/mark-paid — [ADMIN]
    app.post('/api/gene/rewards/payout-requests/:id/mark-paid', adminMiddleware, (req: Request, res: Response) => {
        try {
            const rows = readCollection<PayoutRequest>(PAYOUT_COLLECTION)
            const idx = rows.findIndex((r) => String(r.id) === req.params.id)
            if (idx === -1) return res.status(404).json({ message: 'Payout request not found.' })
            if (rows[idx].status !== 'approved_manual_payout_required') {
                return res.status(400).json({ message: `Cannot mark paid a request in status "${rows[idx].status}".` })
            }
            rows[idx] = { ...rows[idx], status: 'paid', decidedAt: nowIso() }
            writeCollection(PAYOUT_COLLECTION, rows)
            res.json(rows[idx])
        } catch (err) {
            console.error('[gene/referral-rewards] mark-paid failed:', err)
            res.status(500).json({ message: 'Failed to mark payout request as paid.' })
        }
    })

    // POST /api/gene/rewards/payout-requests/:id/reject — [ADMIN] { reason }
    app.post('/api/gene/rewards/payout-requests/:id/reject', adminMiddleware, (req: Request, res: Response) => {
        try {
            const rows = readCollection<PayoutRequest>(PAYOUT_COLLECTION)
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
            console.error('[gene/referral-rewards] reject failed:', err)
            res.status(500).json({ message: 'Failed to reject payout request.' })
        }
    })
}
