/**
 * RentRail — pay any landlord's mobile money number, keep a UGX 1,000
 * service fee, send the rest to the landlord. See the build brief this
 * implements: EFRIS receipts can only be issued by the registered taxpayer
 * against their own TIN (never by whoever processed the payment), so this
 * is deliberately Phase 1 / "Path A" only — no EFRIS/URA API integration:
 * the tenant is told to collect the receipt from the landlord directly, and
 * this module's own record of the payment (amount, date, who it went to)
 * is the tenant's proof of what they paid in the meantime.
 *
 * PROVIDER: IoTec, not Flutterwave — reuses the exact collection flow
 * already live elsewhere in this app (client/src/lib/iotec-paymentpatch.ts
 * + client/src/components/payment/io-tech/layoutGate.tsx's IoTecGatewayLight
 * modal, and server/routes.ts's /api/payment/iotec/* routes): a tenant
 * types their mobile money number into that shared modal, gets a USSD
 * push, and the client tells this module once IoTec confirms success.
 *
 * HONESTY NOTE (same posture as ./payments-core.ts and
 * ./referral-rewards.ts): the collection leg above is real and verified —
 * it's the same IoTec Collections API this app already charges tour-view
 * and BnB-deposit payments through. The PAYOUT leg (sending the landlord
 * their share) is NOT automated here. IoTec does offer a disbursements/
 * withdrawal product, but its API shape isn't documented anywhere in this
 * codebase (nothing here has ever called it — every existing payout flow
 * in this app, e.g. ./referral-rewards.ts's agent payout requests, is
 * manual-admin-confirmed for the same reason), and iotec.io / pay.iotec.io
 * are both unreachable from this environment to verify it firsthand. Rather
 * than guess at an endpoint and request body for a call that moves real
 * money, this module marks a collected payment `payout_pending_manual` and
 * gives an admin a one-click "mark as paid out" once they've sent the
 * landlord their share by hand — exactly ./referral-rewards.ts's pattern.
 * Wiring up real IoTec disbursements later is a contained change: replace
 * the manual-confirm step in registerRentRailRoutes' admin route with an
 * automated call, once the real API details are available.
 *
 * Persistence: shared JSON-file collection store (./store.ts).
 */
import type { Express, Request, Response, RequestHandler } from 'express'
import crypto from 'crypto'
import { readCollection, writeCollection, nextId, nowIso } from './store'

const COLLECTION = 'rentrail_payments'
const SERVICE_FEE_UGX = 1000

export type RentRailStatus =
    | 'pending_collection' // record created, tenant hasn't paid yet
    | 'collected' // IoTec confirms the tenant's mobile money charge succeeded
    | 'payout_pending_manual' // collected; an admin needs to send the landlord their share by hand and confirm
    | 'paid_out' // an admin has confirmed the landlord was paid (net of the UGX 1,000 fee)
    | 'collection_failed'

export interface RentRailPayment {
    id: number
    txRef: string // opaque lookup token, not tied to any provider
    tenantUserId?: number
    tenantName: string
    tenantPhone: string // canonical 256XXXXXXXXX
    landlordName?: string
    landlordPhone: string // canonical 256XXXXXXXXX
    propertyId?: number
    amount: number
    currency: 'UGX'
    serviceFee: number
    netPayout: number
    status: RentRailStatus
    iotecTransactionId?: string
    collectionError?: string
    payoutConfirmedBy?: string
    payoutConfirmedAt?: string
    createdAt: string
    updatedAt: string
}

function loadPayments(): RentRailPayment[] {
    return readCollection<RentRailPayment>(COLLECTION)
}

function savePayments(rows: RentRailPayment[]): void {
    writeCollection(COLLECTION, rows)
}

/** Uganda numbers accepted as 07XXXXXXXX, 2567XXXXXXXX, or +2567XXXXXXXX — normalized
 * to the canonical 256XXXXXXXXX form used across this codebase (see WHATSAPP_NUMBERS
 * in client/src/lib/siteLinks.ts). Returns null if it doesn't look like a Uganda
 * mobile number at all. */
export function normalizeUgandaPhone(input: string): string | null {
    const digits = (input || '').replace(/[^\d]/g, '')
    if (digits.length === 10 && digits.startsWith('0')) return `256${digits.slice(1)}`
    if (digits.length === 12 && digits.startsWith('256')) return digits
    if (digits.length === 9 && digits.startsWith('7')) return `256${digits}`
    return null
}

/** The local "0XXXXXXXXX" form that's more natural for an ops person manually
 * sending a mobile money payout to read/dial than the 256-prefixed one. */
function toLocalFormat(canonical256: string): string {
    return `0${canonical256.slice(3)}`
}

/**
 * Mints a fresh IoTec OAuth token server-side, using this app's own
 * IOTEC_CLIENT_ID/IOTEC_CLIENT_SECRET — the same credentials
 * server/routes.ts's POST /api/payment/iotec/token already uses. Done here
 * independently (rather than trusting a token the client already holds) so
 * the collection-confirmation check below trusts only the transactionId a
 * client reports, never a client-supplied access token — same trust model
 * as /api/pay-property-deposit's Flutterwave verify.
 */
async function getIotecAccessToken(): Promise<string> {
    const clientId = process.env.IOTEC_CLIENT_ID
    const clientSecret = process.env.IOTEC_CLIENT_SECRET
    if (!clientId || !clientSecret) {
        throw new Error('IOTEC_CLIENT_ID / IOTEC_CLIENT_SECRET not configured.')
    }
    const response = await fetch('https://id.iotec.io/connect/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
    })
    const data = (await response.json()) as { access_token?: string }
    if (!data.access_token) throw new Error('IoTec did not return an access token.')
    return data.access_token
}

/** Same endpoint server/routes.ts's GET /api/payment/iotec/status proxies to —
 * called here directly (not through that route) so this module can verify
 * server-side without round-tripping through the client's token. */
async function getIotecCollectionStatus(accessToken: string, transactionId: string): Promise<string> {
    const response = await fetch(`https://pay.iotec.io/api/collections/status/${transactionId}`, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    })
    const data = (await response.json()) as { status?: string }
    if (!data.status) throw new Error('IoTec did not return a transaction status.')
    return data.status
}

export function registerRentRailRoutes(app: Express, requireStrictAdmin: RequestHandler): void {
    /**
     * [PUBLIC] Start a rent payment: creates the pending record. Collection
     * itself happens client-side through the shared IoTec gateway modal
     * (see client/src/pages/RentRail.tsx) — this endpoint doesn't call
     * IoTec at all, it just reserves the record the client reports back to.
     */
    app.post('/api/gene/rentrail/pay', async (req: Request, res: Response) => {
        try {
            if (!process.env.IOTEC_CLIENT_ID || !process.env.IOTEC_CLIENT_SECRET) {
                return res.status(503).json({
                    message: 'RentRail payments are not configured yet — IOTEC_CLIENT_ID/IOTEC_CLIENT_SECRET are not set.',
                })
            }

            const { landlordPhone, landlordName, tenantName, tenantPhone, amount, propertyId } = req.body ?? {}

            const normalizedLandlordPhone = normalizeUgandaPhone(String(landlordPhone ?? ''))
            const normalizedTenantPhone = normalizeUgandaPhone(String(tenantPhone ?? ''))
            const amountNum = Number(amount)

            if (!normalizedLandlordPhone) {
                return res.status(400).json({ message: "That doesn't look like a valid Uganda mobile money number for the landlord." })
            }
            if (!normalizedTenantPhone) {
                return res.status(400).json({ message: "That doesn't look like a valid Uganda mobile money number for you." })
            }
            if (!tenantName || typeof tenantName !== 'string' || !tenantName.trim()) {
                return res.status(400).json({ message: 'Your name is required.' })
            }
            if (!Number.isFinite(amountNum) || amountNum <= SERVICE_FEE_UGX) {
                return res.status(400).json({ message: `Amount must be a number greater than the ${SERVICE_FEE_UGX} UGX service fee.` })
            }

            const rows = loadPayments()
            const id = nextId(rows)
            const txRef = `rentrail-${id}-${crypto.randomBytes(4).toString('hex')}`
            const tenantUserId = req.isAuthenticated?.() && req.user ? (req.user as any).id : undefined

            const payment: RentRailPayment = {
                id,
                txRef,
                tenantUserId,
                tenantName: tenantName.trim(),
                tenantPhone: normalizedTenantPhone,
                landlordName: typeof landlordName === 'string' && landlordName.trim() ? landlordName.trim() : undefined,
                landlordPhone: normalizedLandlordPhone,
                propertyId: propertyId !== undefined && Number.isFinite(Number(propertyId)) ? Number(propertyId) : undefined,
                amount: amountNum,
                currency: 'UGX',
                serviceFee: SERVICE_FEE_UGX,
                netPayout: amountNum - SERVICE_FEE_UGX,
                status: 'pending_collection',
                createdAt: nowIso(),
                updatedAt: nowIso(),
            }
            rows.push(payment)
            savePayments(rows)

            res.status(201).json({ paymentId: id, txRef })
        } catch (error: any) {
            console.error('[gene/rentrail] pay error', error)
            res.status(500).json({ message: 'Failed to start payment', error: error?.message })
        }
    })

    /**
     * [PUBLIC] Called by the client once the shared IoTec gateway modal
     * reports a successful charge. Trusts only the transactionId — verifies
     * it independently against IoTec's own collections/status endpoint
     * before marking anything collected, the same way
     * /api/pay-property-deposit never trusts a client-reported "it worked."
     * Idempotent: a payment already past pending_collection is untouched.
     */
    app.post('/api/gene/rentrail/payments/:id/collected', async (req: Request, res: Response) => {
        try {
            const id = Number(req.params.id)
            const transactionId = String(req.body?.transactionId ?? '')
            if (!Number.isFinite(id) || !transactionId) {
                return res.status(400).json({ message: 'A valid payment id and transactionId are required.' })
            }

            const rows = loadPayments()
            const idx = rows.findIndex((r) => r.id === id)
            if (idx === -1) return res.status(404).json({ message: 'Payment not found.' })

            const payment = rows[idx]
            if (payment.status !== 'pending_collection') {
                return res.json(payment) // already handled — idempotent
            }

            const accessToken = await getIotecAccessToken()
            const status = await getIotecCollectionStatus(accessToken, transactionId)

            if (status === 'Success') {
                payment.iotecTransactionId = transactionId
                payment.status = 'payout_pending_manual'
            } else {
                payment.status = 'collection_failed'
                payment.collectionError = `IoTec reported status "${status}" for this transaction.`
            }
            payment.updatedAt = nowIso()
            rows[idx] = payment
            savePayments(rows)

            res.json(payment)
        } catch (error: any) {
            console.error('[gene/rentrail] collected error', error)
            res.status(500).json({ message: 'Failed to confirm payment', error: error?.message })
        }
    })

    /** [PUBLIC] Polled by the result page — by id, since there's no external
     * redirect party involved anymore (collection happens in-app). */
    app.get('/api/gene/rentrail/payments/:id', (req: Request, res: Response) => {
        const id = Number(req.params.id)
        if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid payment id.' })
        const payment = loadPayments().find((r) => r.id === id)
        if (!payment) return res.status(404).json({ message: 'Payment not found.' })
        res.json(payment)
    })

    /** [PUBLIC] A tenant's own payment history — needs to be signed in. */
    app.get('/api/gene/rentrail/my-payments', (req: Request, res: Response) => {
        if (!req.isAuthenticated?.() || !req.user) return res.status(401).json({ message: 'Sign in first.' })
        const userId = (req.user as any).id
        const rows = loadPayments()
            .filter((r) => r.tenantUserId === userId)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        res.json(rows)
    })

    /** [STRICT ADMIN] Full ledger, for reconciliation and for actually
     * working the payout_pending_manual queue — see the build brief's "does
     * the flat service fee actually cover the rail" question too; this is
     * where that gets checked against real numbers, not illustrative ones. */
    app.get('/api/gene/rentrail/admin/payments', requireStrictAdmin, (_req: Request, res: Response) => {
        const rows = loadPayments()
            .map((r) => ({ ...r, landlordPhoneLocal: toLocalFormat(r.landlordPhone) }))
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        res.json(rows)
    })

    /**
     * [STRICT ADMIN] An admin has sent the landlord their share (netPayout)
     * by hand — mobile money, bank transfer, whatever's actually available
     * today — and confirms it here. Mirrors ./referral-rewards.ts's
     * payout-requests/:id/approve exactly, same reasoning: no automated
     * disbursement rail is verified yet, so a human closes the loop.
     */
    app.post('/api/gene/rentrail/admin/payments/:id/mark-paid-out', requireStrictAdmin, (req: Request, res: Response) => {
        try {
            const id = Number(req.params.id)
            if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid payment id.' })

            const rows = loadPayments()
            const idx = rows.findIndex((r) => r.id === id)
            if (idx === -1) return res.status(404).json({ message: 'Payment not found.' })
            if (rows[idx].status !== 'payout_pending_manual') {
                return res.status(400).json({
                    message: `Cannot mark a payment in status "${rows[idx].status}" as paid out; only payout_pending_manual may be confirmed.`,
                })
            }

            const confirmedBy = (req.user as any)?.username ?? (req.user as any)?.email ?? 'unknown-admin'
            rows[idx] = {
                ...rows[idx],
                status: 'paid_out',
                payoutConfirmedBy: confirmedBy,
                payoutConfirmedAt: nowIso(),
                updatedAt: nowIso(),
            }
            savePayments(rows)

            res.json(rows[idx])
        } catch (error: any) {
            console.error('[gene/rentrail] mark-paid-out error', error)
            res.status(500).json({ message: 'Failed to confirm payout', error: error?.message })
        }
    })
}
