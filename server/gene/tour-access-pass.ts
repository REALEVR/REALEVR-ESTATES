/**
 * GENE Platform — Tour Access Pass: real enforcement of the "UGX 15,000 /
 * 5 properties / 24 hours" tour-unlock rule.
 *
 * CONTEXT: `PaymentModal.tsx` / `TourPaymentModal.tsx` and the existing
 * `/api/payment/iotec/*` + `/api/payment/iotect/record` routes in
 * `server/routes.ts` implement the IoTec mobile-money payment UX and record
 * that a payment happened — but nothing on the server actually enforces the
 * "5 properties / 24 hours" cap; today it is UI copy only. This module is
 * that enforcement primitive: an additive, standalone collection + a small
 * set of functions any payment-confirmation code path (the existing IoTec
 * record route, a future BTC-payment module, an admin support action) can
 * call once a payment is confirmed, plus routes for the client to check
 * status and redeem a property view against the active pass.
 *
 * Deliberately does NOT touch `server/routes.ts`, `shared/schema.ts`, or
 * `server/storage.ts` — persistence uses the shared `server/gene/store.ts`
 * JSON-file collection store (see that file's docstring for the DynamoDB
 * migration path).
 */
import type { Express, RequestHandler } from 'express'
import { nextId, nowIso, readCollection, writeCollection } from './store'

const COLLECTION = 'gene_tour_passes'

/** UGX price of a single tour access pass. */
export const TOUR_PASS_PRICE_UGX = 15000
/** How many distinct properties a single pass unlocks. */
export const TOUR_PASS_MAX_PROPERTIES = 5
/** How many hours after issuance a pass remains usable. */
export const TOUR_PASS_VALIDITY_HOURS = 24

export type TourPassSource = 'iotec' | 'btc' | 'manual'
export type TourPassStatus = 'active' | 'expired' | 'exhausted'

export interface TourAccessPass {
    id: number
    userId: number
    source: TourPassSource
    amountPaid: number
    currency: string
    issuedAt: string
    expiresAt: string
    propertiesAllowed: number
    viewedPropertyIds: number[]
    status: TourPassStatus
}

export interface CanViewResult {
    allowed: boolean
    reason?: string
    pass: TourAccessPass | null
}

function loadPasses(): TourAccessPass[] {
    return readCollection<TourAccessPass>(COLLECTION)
}

function savePasses(rows: TourAccessPass[]): void {
    writeCollection(COLLECTION, rows)
}

/**
 * Creates and persists a new active tour pass for `userId`. Intended to be
 * called from OTHER code (the existing IoTec payment-recording route, a
 * future BTC-payment module, or an admin support action) once a payment has
 * actually been confirmed. Throws on invalid input (e.g. non-positive
 * `amountPaid`) — callers should catch.
 */
export function issuePass(
    userId: number,
    source: TourPassSource,
    amountPaid: number,
    currency: string,
): TourAccessPass {
    if (!Number.isFinite(userId) || userId <= 0) {
        throw new Error('issuePass: userId must be a positive number')
    }
    if (!Number.isFinite(amountPaid) || amountPaid <= 0) {
        throw new Error('issuePass: amountPaid must be a positive number')
    }
    if (!currency || typeof currency !== 'string') {
        throw new Error('issuePass: currency must be a non-empty string')
    }

    const rows = loadPasses()
    const id = nextId(rows)
    const issuedAt = nowIso()
    const expiresAt = new Date(Date.now() + TOUR_PASS_VALIDITY_HOURS * 60 * 60 * 1000).toISOString()

    const row: TourAccessPass = {
        id,
        userId,
        source,
        amountPaid,
        currency,
        issuedAt,
        expiresAt,
        propertiesAllowed: TOUR_PASS_MAX_PROPERTIES,
        viewedPropertyIds: [],
        status: 'active',
    }
    rows.push(row)
    savePasses(rows)
    return row
}

/**
 * Returns the user's most recent pass if it is `active` and not expired.
 * If the most recent pass is marked `active` in storage but its `expiresAt`
 * has passed, this lazily flips its stored status to `expired` (so the
 * collection stays accurate without a cron job) and returns `null`.
 */
export function getActivePass(userId: number): TourAccessPass | null {
    const rows = loadPasses()
    const userPasses = rows
        .filter((r) => r.userId === userId)
        .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime())

    const mostRecent = userPasses[0]
    if (!mostRecent || mostRecent.status !== 'active') {
        return null
    }

    const isExpired = new Date(mostRecent.expiresAt).getTime() <= Date.now()
    if (isExpired) {
        const idx = rows.findIndex((r) => r.id === mostRecent.id)
        if (idx !== -1) {
            rows[idx] = { ...rows[idx], status: 'expired' }
            savePasses(rows)
        }
        return null
    }

    return mostRecent
}

/**
 * Checks whether `userId` may view `propertyId` right now. Already-viewed
 * properties are always allowed (repeat views on an unlocked property are
 * free — that's the point of the pass); otherwise allowed only while under
 * `propertiesAllowed`.
 */
export function canViewProperty(userId: number, propertyId: number): CanViewResult {
    const pass = getActivePass(userId)
    if (!pass) {
        return {
            allowed: false,
            reason: 'No active tour pass. Pay UGX 15,000 to unlock up to 5 property tours for 24 hours.',
            pass: null,
        }
    }

    if (pass.viewedPropertyIds.includes(propertyId)) {
        return { allowed: true, pass }
    }

    if (pass.viewedPropertyIds.length < pass.propertiesAllowed) {
        return { allowed: true, pass }
    }

    return {
        allowed: false,
        reason: 'This pass has reached its 5-property limit. Purchase a new pass to view more.',
        pass,
    }
}

/**
 * Records that `userId` viewed `propertyId` against their active pass, if
 * allowed. Returns the (possibly updated) pass row, or `null` if the view is
 * not allowed — callers decide how to handle a denial.
 */
export function recordView(userId: number, propertyId: number): TourAccessPass | null {
    const result = canViewProperty(userId, propertyId)
    if (!result.allowed || !result.pass) {
        return null
    }

    if (result.pass.viewedPropertyIds.includes(propertyId)) {
        return result.pass
    }

    const rows = loadPasses()
    const idx = rows.findIndex((r) => r.id === result.pass!.id)
    if (idx === -1) {
        return result.pass
    }

    const viewedPropertyIds = [...rows[idx].viewedPropertyIds, propertyId]
    const status: TourPassStatus =
        viewedPropertyIds.length >= rows[idx].propertiesAllowed ? 'exhausted' : rows[idx].status
    rows[idx] = { ...rows[idx], viewedPropertyIds, status }
    savePasses(rows)
    return rows[idx]
}

export function registerTourAccessPassRoutes(app: Express, adminMiddleware: RequestHandler): void {
    /** Authenticated user: current tour-pass status. */
    app.get('/api/gene/tour-pass/status', async (req: any, res) => {
        try {
            if (!(typeof req.isAuthenticated === 'function' && req.isAuthenticated())) {
                return res.status(401).json({ message: 'Login required' })
            }
            const userId = req.user?.id
            if (!userId) {
                return res.status(401).json({ message: 'Login required' })
            }

            const pass = getActivePass(userId)
            if (!pass) {
                return res.json({ active: false })
            }
            res.json(pass)
        } catch (error: any) {
            console.error('[gene/tour-access-pass] status error', error)
            res.status(500).json({ message: 'Failed to load tour pass status', error: error?.message })
        }
    })

    /** Authenticated user: redeem a property view against the active pass. */
    app.post('/api/gene/tour-pass/redeem', async (req: any, res) => {
        try {
            if (!(typeof req.isAuthenticated === 'function' && req.isAuthenticated())) {
                return res.status(401).json({ message: 'Login required' })
            }
            const userId = req.user?.id
            if (!userId) {
                return res.status(401).json({ message: 'Login required' })
            }

            const propertyId = req.body?.propertyId
            if (typeof propertyId !== 'number' || !Number.isFinite(propertyId)) {
                return res.status(400).json({ message: 'propertyId (number) is required' })
            }

            const check = canViewProperty(userId, propertyId)
            if (!check.allowed) {
                return res.status(402).json({ message: check.reason, pass: check.pass })
            }

            const pass = recordView(userId, propertyId)
            res.json(pass)
        } catch (error: any) {
            console.error('[gene/tour-access-pass] redeem error', error)
            res.status(500).json({ message: 'Failed to redeem tour pass', error: error?.message })
        }
    })

    /** [ADMIN] Manual issuance escape hatch — e.g. supporting a customer. */
    app.post('/api/gene/tour-pass/issue', adminMiddleware, async (req, res) => {
        try {
            const { userId, source, amountPaid, currency } = req.body ?? {}
            if (typeof userId !== 'number' || !Number.isFinite(userId)) {
                return res.status(400).json({ message: 'userId (number) is required' })
            }

            const pass = issuePass(
                userId,
                (source as TourPassSource) ?? 'manual',
                typeof amountPaid === 'number' ? amountPaid : TOUR_PASS_PRICE_UGX,
                typeof currency === 'string' ? currency : 'UGX',
            )
            res.status(201).json(pass)
        } catch (error: any) {
            console.error('[gene/tour-access-pass] issue error', error)
            res.status(400).json({ message: error?.message ?? 'Failed to issue tour pass' })
        }
    })

    /** [ADMIN] List all passes, newest first, optional ?userId= filter. */
    app.get('/api/gene/tour-pass/all', adminMiddleware, async (req, res) => {
        try {
            const rows = loadPasses().sort(
                (a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime(),
            )
            const userId = req.query.userId ? Number(req.query.userId) : undefined
            const filtered = userId !== undefined ? rows.filter((r) => r.userId === userId) : rows
            res.json(filtered)
        } catch (error: any) {
            console.error('[gene/tour-access-pass] all error', error)
            res.status(500).json({ message: 'Failed to list tour passes', error: error?.message })
        }
    })
}
