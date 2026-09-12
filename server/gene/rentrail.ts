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
 * ./referral-rewards.ts): both legs are now real and verified against
 * IoTec's own OpenAPI spec (ioTec Pay v1) — collection via
 * POST /api/collections/collect (as before) and payout via
 * POST /api/disbursements/disburse, both confirmed the same way: never
 * trust the initiating call's own response as proof money moved, always
 * independently check GET .../status/{id} against IoTec's own truth
 * (getIotecCollectionStatus / getIotecDisbursementStatus below) before
 * this module ever says so to a tenant or landlord.
 *
 * attemptAutoDisbursement fires the instant a collection is confirmed
 * (see POST /payments/:id/collected). IoTec's RequestStatus enum has nine
 * values, not just Success/Failed — a disbursement can land in
 * AwaitingApproval (the wallet has a checker/maker approval workflow
 * enabled in the IoTec portal), Pending, SentToVendor, or Scheduled before
 * ever reaching a terminal state, so a payment that isn't done yet moves to
 * `payout_processing`, not straight to `paid_out`. There's no cron/worker
 * in this app's lightweight JSON-file-store architecture, so resolving
 * `payout_processing` is done lazily instead: checkAndUpdateDisbursementStatus
 * re-polls IoTec every time a payout_processing payment is read (the
 * result page's poll, either dashboard, or the admin ledger) and finalizes
 * it the moment IoTec reports a terminal status. (IoTec also supports
 * webhook callbacks for this instead of polling — see the "Callback
 * Notifications" section of its docs — but that requires configuring a
 * callback URL by hand in the IoTec portal, which isn't something this
 * module can do for you; the polling approach needs zero extra setup and
 * mirrors the collection side's already-proven pattern exactly.)
 *
 * If the disburse call itself fails outright (network error, bad request,
 * IoTec reports Failed/Rejected/Cancelled/RolledBack, or
 * IOTEC_CLIENT_ID/SECRET/WALLET_ID aren't configured), the payment falls
 * back to exactly the pre-existing manual flow: `payout_pending_manual`,
 * with an admin completing it by hand via the "mark as paid out" button
 * (still here, unchanged, as the safety net) — see disbursementError on
 * the row for why. An admin can also force a stuck `payout_processing`
 * payment back to manual (POST .../retry-manual) if IoTec's own approval
 * queue never clears it.
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
    | 'payout_pending_manual' // an admin needs to send the landlord their share by hand and confirm — either automatic disbursement wasn't attempted/configured, or it failed outright
    | 'payout_processing' // automatic IoTec disbursement was initiated and hasn't reached a terminal status yet (Pending/SentToVendor/AwaitingApproval/Scheduled) — resolved lazily, see checkAndUpdateDisbursementStatus
    | 'paid_out' // IoTec confirmed the disbursement succeeded (automatic), or an admin confirmed it by hand (manual)
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
    // Automatic disbursement (POST /api/disbursements/disburse) — see this
    // file's top doc comment. iotecDisbursementId is the id IoTec assigns
    // to the payout transaction (used to poll its status); disbursementStatus
    // is the raw IoTec RequestStatus string as of the last check, for admin
    // visibility; disbursementError is set only when the automatic attempt
    // itself failed outright and this fell back to the manual flow.
    iotecDisbursementId?: string
    disbursementStatus?: string
    disbursementError?: string
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

/** The disbursement-side twin of getIotecCollectionStatus above — same
 * shape, same trust model, different path (GET /api/disbursements/status/{id},
 * per IoTec's ioTec Pay v1 OpenAPI spec). */
async function getIotecDisbursementStatus(accessToken: string, transactionId: string): Promise<string> {
    const response = await fetch(`https://pay.iotec.io/api/disbursements/status/${transactionId}`, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    })
    const data = (await response.json()) as { status?: string }
    if (!data.status) throw new Error('IoTec did not return a disbursement status.')
    return data.status
}

// Terminal RequestStatus values (per IoTec's spec) that mean "this will
// never become Success on its own" — a disbursement stuck at one of these
// falls back to the manual queue rather than being left in limbo forever.
const DISBURSEMENT_FAILURE_STATUSES = new Set(['Failed', 'Rejected', 'Cancelled', 'RolledBack'])

/**
 * Fires the instant a collection is confirmed (see POST /payments/:id/collected)
 * — attempts to send the landlord their share automatically via IoTec's
 * disbursements API. Mutates `payment` in place and always leaves it in a
 * valid, well-defined status; never throws (a failure here falls back to
 * the pre-existing manual flow, it never blocks the collection from being
 * recorded). See this file's top doc comment for the full reasoning.
 */
async function attemptAutoDisbursement(payment: RentRailPayment): Promise<void> {
    const walletId = process.env.IOTEC_WALLET_ID
    if (!walletId) {
        // Not configured — this is expected until the env var is set, not
        // an error. Falls back to the manual queue exactly as before.
        payment.status = 'payout_pending_manual'
        payment.disbursementError = 'IOTEC_WALLET_ID not configured; automatic disbursement skipped.'
        return
    }

    try {
        const accessToken = await getIotecAccessToken()
        const response = await fetch('https://pay.iotec.io/api/disbursements/disburse', {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                category: 'MobileMoney',
                currency: 'UGX', // this app's own currency (see RentRailPayment.currency), not IoTec's docs-example test currency "ITX"
                walletId,
                externalId: `rentrail-payout-${payment.id}`,
                payeeName: payment.landlordName || undefined,
                payee: toLocalFormat(payment.landlordPhone), // MSISDN — same local "0XXXXXXXXX" form IoTec's own example uses
                amount: payment.netPayout,
                payerNote: `RentRail rent payout — ${payment.txRef}`,
                payeeNote: `Rent payment from ${payment.tenantName}`,
            }),
        })
        const data = (await response.json().catch(() => ({}))) as { id?: string; status?: string; message?: string }

        if (!response.ok || !data.id) {
            payment.status = 'payout_pending_manual'
            payment.disbursementError = data.message || `IoTec returned ${response.status} initiating the disbursement.`
            return
        }

        payment.iotecDisbursementId = data.id
        payment.disbursementStatus = data.status
        finalizeDisbursementStatus(payment, data.status || 'Pending')
    } catch (err: any) {
        payment.status = 'payout_pending_manual'
        payment.disbursementError = err?.message || 'Unexpected error initiating the disbursement.'
    }
}

/** Shared by attemptAutoDisbursement (initial status) and
 * checkAndUpdateDisbursementStatus (re-polled status) — maps an IoTec
 * RequestStatus onto this payment's own status, never leaving it anywhere
 * but paid_out / payout_pending_manual / payout_processing. */
function finalizeDisbursementStatus(payment: RentRailPayment, iotecStatus: string): void {
    payment.disbursementStatus = iotecStatus
    if (iotecStatus === 'Success') {
        payment.status = 'paid_out'
        payment.payoutConfirmedBy = 'RentRail (automatic via IoTec)'
        payment.payoutConfirmedAt = nowIso()
    } else if (DISBURSEMENT_FAILURE_STATUSES.has(iotecStatus)) {
        payment.status = 'payout_pending_manual'
        payment.disbursementError = `IoTec disbursement ${iotecStatus.toLowerCase()} — send the landlord their share by hand instead.`
    } else {
        payment.status = 'payout_processing'
    }
}

/**
 * Re-checks a `payout_processing` payment against IoTec's own status
 * endpoint and finalizes it if it has reached a terminal state — called
 * lazily every time such a payment is read (see the GET routes below),
 * since this app has no cron/background worker. Returns true if the
 * payment's status changed (caller is responsible for persisting it).
 * Never throws: a transient failure here just leaves the payment
 * unchanged for the next read to try again.
 */
async function checkAndUpdateDisbursementStatus(payment: RentRailPayment): Promise<boolean> {
    if (payment.status !== 'payout_processing' || !payment.iotecDisbursementId) return false
    try {
        const accessToken = await getIotecAccessToken()
        const iotecStatus = await getIotecDisbursementStatus(accessToken, payment.iotecDisbursementId)
        if (iotecStatus === payment.disbursementStatus) return false // unchanged, still in-flight
        finalizeDisbursementStatus(payment, iotecStatus)
        // TS still narrows payment.status to 'payout_processing' (the early
        // return above) across the mutating call — (as RentRailStatus)
        // widens it back since finalizeDisbursementStatus really can change it.
        if ((payment.status as RentRailStatus) === 'paid_out') {
            await deliverReceipt(payment)
        }
        return true
    } catch (err) {
        console.error('[gene/rentrail] checkAndUpdateDisbursementStatus failed:', err)
        return false
    }
}

/** Runs checkAndUpdateDisbursementStatus over every row that might need
 * it and persists the collection once if anything changed — the shared
 * "refresh on read" step behind every GET route below. */
async function refreshProcessingPayouts(rows: RentRailPayment[]): Promise<void> {
    let changed = false
    for (const row of rows) {
        if (await checkAndUpdateDisbursementStatus(row)) {
            row.updatedAt = nowIso()
            changed = true
        }
    }
    if (changed) savePayments(rows)
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
                payment.status = 'payout_pending_manual' // attemptAutoDisbursement below may move this straight to paid_out or payout_processing
                await attemptAutoDisbursement(payment)
                // (as RentRailStatus): see checkAndUpdateDisbursementStatus's
                // comment on the same pattern — TS narrows across the call.
                if ((payment.status as RentRailStatus) === 'paid_out') {
                    await deliverReceipt(payment)
                }
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
     * redirect party involved anymore (collection happens in-app). Refreshes
     * a payout_processing payment against IoTec on every read (see
     * checkAndUpdateDisbursementStatus) so the tenant sees it flip to
     * "paid out" live without any separate background job. */
    app.get('/api/gene/rentrail/payments/:id', async (req: Request, res: Response) => {
        const id = Number(req.params.id)
        if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid payment id.' })
        const rows = loadPayments()
        const payment = rows.find((r) => r.id === id)
        if (!payment) return res.status(404).json({ message: 'Payment not found.' })
        if (await checkAndUpdateDisbursementStatus(payment)) {
            payment.updatedAt = nowIso()
            savePayments(rows)
        }
        res.json(payment)
    })

    /** [PUBLIC] A tenant's own payment history — needs to be signed in. */
    app.get('/api/gene/rentrail/my-payments', async (req: Request, res: Response) => {
        if (!req.isAuthenticated?.() || !req.user) return res.status(401).json({ message: 'Sign in first.' })
        const userId = (req.user as any).id
        // refreshProcessingPayouts must run (and save) against the FULL
        // collection, never a filtered subset — savePayments/writeCollection
        // overwrites the whole file, so saving only this tenant's rows would
        // silently delete every other payment in the system.
        const allRows = loadPayments()
        await refreshProcessingPayouts(allRows)
        const rows = allRows
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
        const allRows = loadPayments()
        await refreshProcessingPayouts(allRows) // full collection — see the my-payments route's comment on why
        const rows = allRows
            .filter((r) => r.landlordPhone === normalizedPhone)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        res.json({ phoneNumberRequired: false, payments: rows })
    })

    /** [STRICT ADMIN] Full ledger, for reconciliation and for actually
     * working the payout_pending_manual queue — see the build brief's "does
     * the flat service fee actually cover the rail" question too; this is
     * where that gets checked against real numbers, not illustrative ones. */
    app.get('/api/gene/rentrail/admin/payments', requireStrictAdmin, async (_req: Request, res: Response) => {
        const allRows = loadPayments()
        await refreshProcessingPayouts(allRows)
        const rows = allRows
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

    /**
     * [STRICT ADMIN] Escape hatch for a `payout_processing` payment that
     * never reaches a terminal IoTec status — e.g. the wallet's
     * checker/maker approval workflow is stuck in AwaitingApproval inside
     * the IoTec portal itself, somewhere this app has no visibility into or
     * control over. Falls it back to the ordinary manual queue so an admin
     * can still get the landlord paid by hand instead of it being wedged
     * indefinitely; the automatic-disbursement audit trail (iotecDisbursementId
     * etc.) is kept on the row, not erased.
     */
    app.post('/api/gene/rentrail/admin/payments/:id/retry-manual', requireStrictAdmin, (req: Request, res: Response) => {
        try {
            const id = Number(req.params.id)
            if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid payment id.' })

            const rows = loadPayments()
            const idx = rows.findIndex((r) => r.id === id)
            if (idx === -1) return res.status(404).json({ message: 'Payment not found.' })
            if (rows[idx].status !== 'payout_processing') {
                return res.status(400).json({
                    message: `Cannot switch a payment in status "${rows[idx].status}" to manual; only payout_processing may be switched.`,
                })
            }

            rows[idx] = {
                ...rows[idx],
                status: 'payout_pending_manual',
                disbursementError: 'Switched to manual by an admin — automatic disbursement did not complete in time.',
                updatedAt: nowIso(),
            }
            savePayments(rows)
            res.json(rows[idx])
        } catch (error: any) {
            console.error('[gene/rentrail] retry-manual error', error)
            res.status(500).json({ message: 'Failed to switch to manual', error: error?.message })
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
