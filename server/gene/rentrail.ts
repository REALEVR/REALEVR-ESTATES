/**
 * RentRail — pay any landlord's mobile money number, keep a UGX 100 service
 * fee, send the rest straight to the landlord. See the build brief this
 * implements: EFRIS receipts can only be issued by the registered taxpayer
 * against their own TIN (never by whoever processed the payment), so this
 * is deliberately Phase 1 / "Path A" only — no EFRIS/URA API integration:
 * the tenant is told to collect the receipt from the landlord directly, and
 * this module's own record of the payment (amount, date, who it went to)
 * is the tenant's proof of what they paid in the meantime.
 *
 * HONESTY NOTE (same posture as ./payments-core.ts): this module never
 * fakes a successful money movement. The collection leg (charging the
 * tenant) reuses the same Flutterwave verify-by-transaction_id pattern
 * already live in server/routes.ts's /api/pay-property-deposit. The payout
 * leg (splitting UGX 100 off and sending the rest to the landlord's own
 * number) is a NEW capability this app didn't have before — a real call to
 * Flutterwave's Transfers API — and it is asynchronous by nature: a
 * transfer can sit "pending" at Flutterwave for a few minutes before their
 * webhook confirms it landed. A payment is only ever marked `paid_out`
 * once Flutterwave itself confirms the transfer completed; if the payout
 * fails, the record says `payout_failed` with a real error message rather
 * than silently claiming success — this is the one place actual money
 * could be collected from a tenant but stuck on the way to a landlord, so
 * it has to fail loudly, not quietly.
 *
 * Uganda mobile-money transfer routing: Flutterwave requires an
 * `account_bank` code for the Transfers API, and that code is looked up
 * live from Flutterwave's own `GET /v3/banks/UG` (see
 * resolveUgandaMobileMoneyBankCode) rather than hardcoded here — this repo
 * has no way to verify that code from inside this environment, and a wrong
 * hardcoded value risks sending a real payout to the wrong rail. Set
 * FLUTTERWAVE_UG_MOBILEMONEY_BANK_CODE once it's been confirmed against
 * Flutterwave's UG bank list (or their support) to skip the lookup.
 *
 * Persistence: shared JSON-file collection store (./store.ts).
 */
import type { Express, Request, Response, RequestHandler } from 'express'
import crypto from 'crypto'
import { readCollection, writeCollection, nextId, nowIso } from './store'

const COLLECTION = 'rentrail_payments'
const SERVICE_FEE_UGX = 100

export type RentRailStatus =
    | 'pending_collection' // payment link created, tenant hasn't paid yet
    | 'collected' // Flutterwave confirms the tenant's charge succeeded
    | 'payout_pending' // transfer to the landlord was requested, awaiting Flutterwave's confirmation
    | 'paid_out' // landlord has been paid (net of the UGX 100 fee)
    | 'collection_failed'
    | 'payout_failed' // money was collected but the payout to the landlord did not go through — needs manual follow-up

export interface RentRailPayment {
    id: number
    txRef: string // our own unique reference, also Flutterwave's tx_ref
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
    flutterwaveTransactionId?: string
    flutterwaveTransferId?: number
    collectionError?: string
    payoutError?: string
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

/** The local "0XXXXXXXXX" form Flutterwave's Uganda mobile money endpoints expect
 * for `customer.phonenumber` / transfer `account_number`. */
function toLocalFormat(canonical256: string): string {
    return `0${canonical256.slice(3)}`
}

let cachedBankCode: { code: string; expiresAt: number } | null = null

/**
 * Resolves the Flutterwave `account_bank` code for Uganda mobile money
 * transfers. Prefers FLUTTERWAVE_UG_MOBILEMONEY_BANK_CODE if set (the
 * confirmed-correct value, once someone has actually verified it against
 * Flutterwave's UG bank list or their support); otherwise looks it up live
 * from GET /v3/banks/UG and caches the result for an hour. Throws — never
 * guesses — if it can't find exactly one unambiguous "mobile money" entry,
 * since sending a payout on the wrong code either fails or, worse, doesn't.
 */
async function resolveUgandaMobileMoneyBankCode(secretKey: string): Promise<string> {
    const override = process.env.FLUTTERWAVE_UG_MOBILEMONEY_BANK_CODE
    if (override) return override

    if (cachedBankCode && cachedBankCode.expiresAt > Date.now()) {
        return cachedBankCode.code
    }

    const response = await fetch('https://api.flutterwave.com/v3/banks/UG', {
        headers: { Authorization: `Bearer ${secretKey}` },
    })
    const data = (await response.json()) as { status: string; data?: Array<{ code: string; name: string }> }
    if (data.status !== 'success' || !Array.isArray(data.data)) {
        throw new Error('Could not fetch Uganda bank/transfer codes from Flutterwave.')
    }

    const matches = data.data.filter((b) => /mobile\s*money/i.test(b.name))
    if (matches.length !== 1) {
        throw new Error(
            matches.length === 0
                ? 'No "mobile money" entry found in Flutterwave\'s UG bank list — set FLUTTERWAVE_UG_MOBILEMONEY_BANK_CODE manually once you know the right code.'
                : `Flutterwave's UG bank list has ${matches.length} "mobile money" entries (${matches
                      .map((m) => `${m.name}=${m.code}`)
                      .join(', ')}) — ambiguous. Set FLUTTERWAVE_UG_MOBILEMONEY_BANK_CODE to the correct one.`
        )
    }

    cachedBankCode = { code: matches[0].code, expiresAt: Date.now() + 60 * 60 * 1000 }
    return matches[0].code
}

/**
 * Attempts the payout leg: transfer `payment.netPayout` to the landlord's
 * own number. Mutates and persists `payment`'s status in place. Never
 * throws — always resolves, leaving payment.status as either
 * 'payout_pending' (Flutterwave accepted the transfer request; a later
 * transfer.completed/transfer.failed webhook moves it to its final state)
 * or 'payout_failed' (with payoutError set).
 */
async function attemptPayout(payment: RentRailPayment, secretKey: string): Promise<void> {
    try {
        const bankCode = await resolveUgandaMobileMoneyBankCode(secretKey)
        const response = await fetch('https://api.flutterwave.com/v3/transfers', {
            method: 'POST',
            headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                account_bank: bankCode,
                account_number: toLocalFormat(payment.landlordPhone),
                amount: payment.netPayout,
                currency: payment.currency,
                narration: `RentRail rent payment${payment.propertyId ? ` (property #${payment.propertyId})` : ''} from ${payment.tenantName}`,
                reference: `rentrail-payout-${payment.txRef}`,
            }),
        })
        const data = (await response.json()) as { status: string; message?: string; data?: { id: number; status: string } }

        if (data.status !== 'success' || !data.data) {
            payment.status = 'payout_failed'
            payment.payoutError = data.message || 'Flutterwave rejected the transfer request.'
            return
        }

        payment.flutterwaveTransferId = data.data.id
        // Flutterwave transfers are asynchronous — NEW_TRANSFER/PENDING here just
        // means the request was accepted, not that the landlord has been paid yet.
        payment.status = 'payout_pending'
    } catch (err: any) {
        payment.status = 'payout_failed'
        payment.payoutError = err?.message || 'Unexpected error while requesting the payout.'
    }
}

/**
 * The one place that turns "tenant paid" into "landlord got paid, minus
 * UGX 100" — called from both the redirect callback (immediate UX) and the
 * webhook (source of truth if the tenant closes the tab before redirecting
 * back). Idempotent: a payment already past 'collected' is left alone.
 */
async function finalizeCollection(payment: RentRailPayment, transactionId: string, secretKey: string): Promise<RentRailPayment> {
    if (payment.status !== 'pending_collection') return payment // already handled

    const verifyRes = await fetch(`https://api.flutterwave.com/v3/transactions/${transactionId}/verify`, {
        headers: { Authorization: `Bearer ${secretKey}` },
    })
    const verify = (await verifyRes.json()) as {
        status: string
        data?: { status: string; amount: number; currency: string; tx_ref: string }
    }

    const ok =
        verify.status === 'success' &&
        verify.data?.status === 'successful' &&
        verify.data?.currency === payment.currency &&
        Math.abs((verify.data?.amount ?? 0) - payment.amount) < 1

    if (!ok) {
        payment.status = 'collection_failed'
        payment.collectionError = 'Payment verification with Flutterwave failed or amount/currency mismatch.'
        return payment
    }

    payment.flutterwaveTransactionId = transactionId
    payment.status = 'collected'
    await attemptPayout(payment, secretKey)
    return payment
}

export function registerRentRailRoutes(app: Express, requireStrictAdmin: RequestHandler): void {
    /**
     * [PUBLIC] Start a rent payment. Creates a pending record and returns a
     * Flutterwave hosted-checkout link to redirect the tenant to.
     */
    app.post('/api/gene/rentrail/pay', async (req: Request, res: Response) => {
        try {
            const secretKey = process.env.FLUTTERWAVE_SECRET_KEY
            if (!secretKey) {
                return res.status(503).json({
                    message: 'RentRail payments are not configured yet — set FLUTTERWAVE_SECRET_KEY to enable them.',
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

            const baseUrl = (process.env.BASE_URL || 'http://localhost:5000').replace(/\/$/, '')
            const chargeRes = await fetch('https://api.flutterwave.com/v3/payments', {
                method: 'POST',
                headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tx_ref: txRef,
                    amount: amountNum,
                    currency: 'UGX',
                    redirect_url: `${baseUrl}/rentrail/callback?ref=${txRef}`,
                    payment_options: 'mobilemoneyuganda,mobilemoney,card',
                    customer: {
                        phonenumber: toLocalFormat(normalizedTenantPhone),
                        name: tenantName.trim(),
                        email: `${normalizedTenantPhone}@rentrail.realevrestates.com`,
                    },
                    customizations: {
                        title: 'RentRail — Pay Rent',
                        description: payment.landlordName
                            ? `Rent payment to ${payment.landlordName}`
                            : 'Rent payment',
                    },
                    meta: { rentrailPaymentId: id },
                }),
            })
            const charge = (await chargeRes.json()) as { status: string; message?: string; data?: { link: string } }

            if (charge.status !== 'success' || !charge.data?.link) {
                rows[rows.findIndex((r) => r.id === id)] = { ...payment, status: 'collection_failed', collectionError: charge.message || 'Flutterwave could not start this payment.' }
                savePayments(rows)
                return res.status(502).json({ message: charge.message || 'Could not start the payment with Flutterwave.' })
            }

            res.status(201).json({ paymentLink: charge.data.link, txRef, id })
        } catch (error: any) {
            console.error('[gene/rentrail] pay error', error)
            res.status(500).json({ message: 'Failed to start payment', error: error?.message })
        }
    })

    /**
     * [PUBLIC] Polled by the callback page (and usable directly) to check a
     * payment's current state by its tx_ref — deliberately not by sequential
     * id, so one tenant can't page through another's payments.
     */
    app.get('/api/gene/rentrail/payments/by-ref/:txRef', async (req: Request, res: Response) => {
        const rows = loadPayments()
        const payment = rows.find((r) => r.txRef === req.params.txRef)
        if (!payment) return res.status(404).json({ message: 'Payment not found.' })
        res.json(payment)
    })

    /**
     * [PUBLIC] Flutterwave redirects the tenant's browser here after checkout.
     * Verifies + triggers the payout immediately, so the result page doesn't
     * have to wait on the webhook for the common case. Idempotent with the
     * webhook below — whichever fires first wins, the other is a no-op.
     */
    app.get('/api/gene/rentrail/verify', async (req: Request, res: Response) => {
        try {
            const secretKey = process.env.FLUTTERWAVE_SECRET_KEY
            if (!secretKey) return res.status(503).json({ message: 'RentRail payments are not configured.' })

            const txRef = String(req.query.tx_ref ?? req.query.ref ?? '')
            const transactionId = String(req.query.transaction_id ?? '')
            if (!txRef || !transactionId) {
                return res.status(400).json({ message: 'tx_ref and transaction_id are required.' })
            }

            const rows = loadPayments()
            const idx = rows.findIndex((r) => r.txRef === txRef)
            if (idx === -1) return res.status(404).json({ message: 'Payment not found.' })

            const updated = await finalizeCollection(rows[idx], transactionId, secretKey)
            updated.updatedAt = nowIso()
            rows[idx] = updated
            savePayments(rows)

            res.json(updated)
        } catch (error: any) {
            console.error('[gene/rentrail] verify error', error)
            res.status(500).json({ message: 'Failed to verify payment', error: error?.message })
        }
    })

    /**
     * [PUBLIC, signature-checked] Flutterwave webhook — source of truth for
     * both the collection (charge.completed) and payout (transfer.completed /
     * transfer.failed) legs, in case the tenant never makes it back to the
     * redirect_url. Verified via the `verif-hash` header Flutterwave sends,
     * matched against FLUTTERWAVE_WEBHOOK_SECRET_HASH (set the same string as
     * the "Secret Hash" in the Flutterwave dashboard's webhook settings).
     */
    app.post('/api/gene/rentrail/webhook', async (req: Request, res: Response) => {
        try {
            const secretKey = process.env.FLUTTERWAVE_SECRET_KEY
            const webhookSecret = process.env.FLUTTERWAVE_WEBHOOK_SECRET_HASH
            if (!secretKey) return res.status(503).json({ message: 'RentRail payments are not configured.' })
            if (webhookSecret && req.headers['verif-hash'] !== webhookSecret) {
                return res.status(401).json({ message: 'Invalid webhook signature.' })
            }

            const body = req.body ?? {}
            const event = body.event as string | undefined
            const rows = loadPayments()

            if (event === 'charge.completed') {
                const txRef = body.data?.tx_ref as string | undefined
                const transactionId = body.data?.id ? String(body.data.id) : undefined
                const idx = txRef ? rows.findIndex((r) => r.txRef === txRef) : -1
                if (idx !== -1 && transactionId) {
                    const updated = await finalizeCollection(rows[idx], transactionId, secretKey)
                    updated.updatedAt = nowIso()
                    rows[idx] = updated
                    savePayments(rows)
                }
            } else if (event === 'transfer.completed') {
                const transferId = body.data?.id as number | undefined
                const transferStatus = body.data?.status as string | undefined
                const idx = rows.findIndex((r) => r.flutterwaveTransferId === transferId)
                if (idx !== -1) {
                    rows[idx].status = transferStatus === 'SUCCESSFUL' ? 'paid_out' : 'payout_failed'
                    if (transferStatus !== 'SUCCESSFUL') {
                        rows[idx].payoutError = `Flutterwave transfer status: ${transferStatus}`
                    }
                    rows[idx].updatedAt = nowIso()
                    savePayments(rows)
                }
            }

            res.status(200).json({ received: true })
        } catch (error: any) {
            console.error('[gene/rentrail] webhook error', error)
            // Flutterwave retries on non-2xx — still ack so a bug here doesn't
            // pile up retries, but log loudly so it's visible in ops.
            res.status(200).json({ received: true, error: error?.message })
        }
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

    /** [STRICT ADMIN] Full ledger, for reconciliation — see the build brief's
     * "does UGX 100 actually cover it" question; this is where that gets
     * checked against real numbers instead of the brief's illustrative ones. */
    app.get('/api/gene/rentrail/admin/payments', requireStrictAdmin, (_req: Request, res: Response) => {
        const rows = loadPayments().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        res.json(rows)
    })
}
