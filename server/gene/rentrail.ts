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
 * DASHBOARDS + NOTIFICATIONS: a payment is attributed to a landlord's
 * dashboard (client/src/pages/AgentDashboard.tsx's Rent Pay tab) live, by
 * matching that landlord's own account phone number against the payment's
 * landlordPhone (see findLandlordUserIdByPhone below) — there's no separate
 * "link your account" step. This is why every account's phone number is
 * now compulsory at signup (server/auth.ts's POST /api/register): without
 * it, a landlord who pays through RealEVR has no way for a rent payment
 * sent to their number to ever surface in their own dashboard. The tenant
 * side needs no matching at all — every payment already carries
 * tenantUserId when the payer was signed in (GET /my-payments below).
 * deliverReceipt below fires the in-app notification (bell icon,
 * server/models/Notification.ts) to both sides the instant a payout is
 * confirmed, alongside the existing WhatsApp message.
 *
 * Persistence: shared JSON-file collection store (./store.ts).
 */
import type { Express, Request, Response, RequestHandler } from 'express'
import crypto from 'crypto'
import { readCollection, writeCollection, nextId, nowIso } from './store'
import { storage } from '../storage'

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
    // Legal/dispute protection: the tenant must affirmatively declare, at the
    // moment of payment, that the amount is the full rent due (RentRail has
    // no lease record to check it against — this is the honest ceiling on
    // what "ensure full payment" can mean here) and accept RentRail's terms
    // (client/src/pages/RefundPolicy.tsx section 4). Both are required to
    // create a payment (see POST /pay below) and timestamped, so there's a
    // real record if a landlord later disputes the amount paid.
    confirmedFullAmount: boolean
    policyAcceptedAt: string
    // Set once the WhatsApp payment-confirmation message (NOT an EFRIS
    // receipt — see finalizePayout below) has been sent to the tenant.
    receiptSent: boolean
    receiptSentAt?: string
    receiptDeliveryError?: string
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
 * Finds the registered agent (landlord) account whose own profile phone
 * number matches a RentRail payment's landlordPhone — this is how a
 * payment gets attributed to that landlord's dashboard/notifications with
 * no separate "link your account" step, and why the phone number is now
 * compulsory at signup (see server/auth.ts's POST /api/register): the
 * match is done live, by phone, every time, so a landlord who adds their
 * number *after* a payment already exists still picks it up automatically.
 * Scoped to role === 'agent' since that's this app's landlord dashboard
 * (AgentDashboard.tsx) — a tenant's phone happening to match doesn't
 * misroute a receipt into a stranger's account. Returns undefined (not an
 * error) when nobody matches, which is the common case for a landlord who
 * isn't a RealEVR user at all.
 */
async function findLandlordUserIdByPhone(landlordPhone256: string): Promise<number | undefined> {
    try {
        const users = await storage.getAllUsers()
        const match = users.find(
            (u) => u.role === 'agent' && u.phoneNumber && normalizeUgandaPhone(u.phoneNumber) === landlordPhone256
        )
        return match?.id
    } catch (err) {
        console.error('[gene/rentrail] findLandlordUserIdByPhone failed:', err)
        return undefined
    }
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

            const { landlordPhone, landlordName, tenantName, tenantPhone, amount, propertyId, confirmedFullAmount, acceptedPolicy } =
                req.body ?? {}

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
            // RentRail has no lease record to check the amount against — the
            // most this can honestly enforce is requiring (and permanently
            // recording, with a timestamp below) the tenant's own affirmative
            // statement that this is the full rent due and that they've read
            // the terms, not a computed check. See RefundPolicy.tsx section 4.
            if (confirmedFullAmount !== true) {
                return res.status(400).json({
                    message: 'Confirm this is your full rent payment (not a partial payment) before continuing.',
                })
            }
            if (acceptedPolicy !== true) {
                return res.status(400).json({ message: "You must agree to RentRail's payment terms before continuing." })
            }

            const rows = loadPayments()
            const id = nextId(rows)
            const txRef = `rentrail-${id}-${crypto.randomBytes(4).toString('hex')}`
            const tenantUserId = req.isAuthenticated?.() && req.user ? (req.user as any).id : undefined
            const now = nowIso()

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
                confirmedFullAmount: true,
                policyAcceptedAt: now,
                receiptSent: false,
                createdAt: now,
                updatedAt: now,
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

    /**
     * [AUTH, agent role] A landlord's own received-rent history — matched
     * live by their account's own phone number against payments'
     * landlordPhone (see findLandlordUserIdByPhone above), not by any
     * stored link. If they haven't added a phone number yet, this can't
     * match anything — returns phoneNumberRequired: true instead of an
     * empty list so the dashboard can show the actual reason, not just
     * "no payments yet."
     */
    app.get('/api/gene/rentrail/landlord-payments', async (req: Request, res: Response) => {
        if (!req.isAuthenticated?.() || !req.user) return res.status(401).json({ message: 'Sign in first.' })
        const user = req.user as any
        if (user.role !== 'agent') {
            return res.status(403).json({ message: 'Only landlord/agent accounts receive RentRail payments.' })
        }
        const normalizedPhone = user.phoneNumber ? normalizeUgandaPhone(String(user.phoneNumber)) : null
        if (!normalizedPhone) {
            return res.json({ phoneNumberRequired: true, payments: [] })
        }
        const rows = loadPayments()
            .filter((r) => r.landlordPhone === normalizedPhone)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        res.json({ phoneNumberRequired: false, payments: rows })
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
    app.post('/api/gene/rentrail/admin/payments/:id/mark-paid-out', requireStrictAdmin, async (req: Request, res: Response) => {
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

            // Deliver the tenant's payment confirmation the instant the
            // payout is confirmed — this is what the UGX 1,000 fee is
            // described as covering (see RefundPolicy.tsx section 4). Never
            // blocks or fails this request: a delivery failure is recorded
            // on the row (visible in the admin queue) rather than left
            // silent, but the payout confirmation itself already happened
            // and shouldn't be undone by a messaging hiccup.
            await deliverReceipt(rows[idx])
            savePayments(rows)

            res.json(rows[idx])
        } catch (error: any) {
            console.error('[gene/rentrail] mark-paid-out error', error)
            res.status(500).json({ message: 'Failed to confirm payout', error: error?.message })
        }
    })
}

/**
 * Fires the instant the payout is confirmed — three independent channels,
 * each in its own try/catch so one failing (e.g. WhatsApp not configured)
 * never blocks the others or the payout confirmation itself:
 *
 *  1. WhatsApp message to the tenant (the original channel this shipped
 *     with) — same as before, deliberately NOT called an EFRIS receipt
 *     anywhere in its text; see this file's top doc comment and
 *     RefundPolicy.tsx section 4 for why that distinction matters here.
 *  2. An in-app notification to the tenant (if they were signed in when
 *     they paid — see tenantUserId), so it shows up in the bell icon and
 *     their dashboard's Rent Pay tab even if the WhatsApp send fails.
 *  3. An in-app notification to the landlord, IF their own account's phone
 *     number matches this payment's landlordPhone (findLandlordUserIdByPhone
 *     above) — most landlords paid through RentRail aren't RealEVR users at
 *     all, so this is best-effort, not assumed.
 *
 * Mutates `payment`'s receipt fields in place (WhatsApp delivery only —
 * that's the field the admin queue and result page show); never throws.
 */
async function deliverReceipt(payment: RentRailPayment): Promise<void> {
    try {
        const { sendWhatsAppMessage } = await import('./whatsapp')
        const message = [
            `RentRail payment confirmation`,
            ``,
            `Amount paid: ${payment.amount.toLocaleString()} ${payment.currency}`,
            `Sent to: ${payment.landlordName || 'your landlord'} (${toLocalFormat(payment.landlordPhone)})`,
            `Service fee: ${payment.serviceFee.toLocaleString()} ${payment.currency}`,
            `Reference: ${payment.txRef}`,
            ``,
            `This confirms your rent was sent to your landlord. This is NOT a tax receipt — Ugandan law requires your landlord, not RentRail, to issue your EFRIS receipt. Please request it from them directly.`,
        ].join('\n')

        const result = await sendWhatsAppMessage(payment.tenantPhone, message)
        payment.receiptSent = result.sent
        payment.receiptSentAt = result.sent ? nowIso() : undefined
        payment.receiptDeliveryError = result.sent ? undefined : result.reason
    } catch (err: any) {
        payment.receiptSent = false
        payment.receiptDeliveryError = err?.message || 'Unexpected error sending the receipt.'
    }

    if (payment.tenantUserId) {
        try {
            const { createNotification } = await import('../models/Notification')
            await createNotification({
                userId: String(payment.tenantUserId),
                title: 'Rent payment sent',
                message: `Your ${payment.amount.toLocaleString()} ${payment.currency} rent payment has been sent to ${payment.landlordName || 'your landlord'}. Your receipt is ready.`,
                type: 'payment',
                link: `/rentrail/callback?paymentId=${payment.id}`,
                data: { paymentId: payment.id, txRef: payment.txRef },
            })
        } catch (err) {
            console.error('[gene/rentrail] failed to notify tenant in-app:', err)
        }
    }

    try {
        const landlordUserId = await findLandlordUserIdByPhone(payment.landlordPhone)
        if (landlordUserId) {
            const { createNotification } = await import('../models/Notification')
            await createNotification({
                userId: String(landlordUserId),
                title: 'Rent payment received',
                message: `You received ${payment.netPayout.toLocaleString()} ${payment.currency} via RentRail from ${payment.tenantName} (service fee already deducted).`,
                type: 'payment',
                link: `/agent/dashboard?tab=rentpay`,
                data: { paymentId: payment.id, txRef: payment.txRef },
            })
        }
    } catch (err) {
        console.error('[gene/rentrail] failed to notify landlord in-app:', err)
    }
}
