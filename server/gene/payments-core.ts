/**
 * GENE Platform — Commerce & Investor Layer: standard payment rails.
 *
 * HONESTY NOTE: there is no live mobile-money or card gateway credential
 * available in this environment. This module does NOT fake a successful
 * money movement. The only provider that actually "works" today is
 * `ManualPaymentProvider`, which records a charge as
 * `pending_manual_confirmation` — i.e. a human (admin/ops) later confirms
 * that cash/bank transfer/mobile-money-outside-the-app was actually
 * received, via `POST /api/gene/payments/:id/confirm`. `mobile_money` and
 * `card` are wired as real interface implementations that throw a clear,
 * actionable error until real credentials exist — see `NotConfiguredProvider`.
 *
 * Persistence uses the shared `server/gene/store.ts` JSON-file collection
 * store (see that file's docstring for the DynamoDB migration path) — no
 * new DB tables, no new npm deps.
 */
import type { Express, RequestHandler } from 'express'
import { nextId, nowIso, readCollection, writeCollection } from './store'

const COLLECTION = 'gene_transactions'

export type PaymentStatus = 'pending_manual_confirmation' | 'confirmed' | 'failed' | 'refunded'

export interface GeneTransaction {
    id: number
    propertyId: number
    buyerUserId?: number
    provider: string
    amountMinor: number
    currency: string
    status: PaymentStatus
    reference: string
    createdAt: string
    confirmedAt?: string
    confirmedBy?: string
}

export interface ChargeInput {
    amountMinor: number
    currency: string
    reference: string
}

export interface ChargeResult {
    success: boolean
    providerTxnId?: string
    error?: string
    /** The ledger status this charge attempt should be persisted with. */
    status: PaymentStatus
}

/**
 * Every payment rail (manual, mobile money, card, ...) implements this.
 * Swapping in a real gateway later is a one-file change: implement this
 * interface and register the provider in `PROVIDERS` below.
 */
export interface PaymentProvider {
    name: string
    charge(input: ChargeInput): Promise<ChargeResult>
}

/**
 * The one REAL, working provider today. It does not move any money — it
 * honestly records that a human still needs to confirm the transfer/cash
 * receipt. This is deliberate: better to be a clear manual workflow than a
 * fake "success" that implies money moved when it didn't.
 */
export class ManualPaymentProvider implements PaymentProvider {
    name = 'manual'

    async charge(input: ChargeInput): Promise<ChargeResult> {
        return {
            success: true,
            status: 'pending_manual_confirmation',
        }
    }
}

/**
 * Stub for any not-yet-configured rail (mobile money, card, ...). Throws a
 * clear, actionable error instead of pretending to charge anything. Once a
 * real gateway/SDK + credentials are available, replace this with a real
 * implementation of `PaymentProvider` — the route layer below doesn't need
 * to change.
 */
export class NotConfiguredProvider implements PaymentProvider {
    constructor(
        public name: string,
        private readonly envHint: string,
    ) {}

    async charge(_input: ChargeInput): Promise<ChargeResult> {
        throw new Error(
            `Payment provider "${this.name}" is not configured. Set ${this.envHint} to enable it before accepting live charges.`,
        )
    }
}

const PROVIDERS: Record<string, PaymentProvider> = {
    manual: new ManualPaymentProvider(),
    mobile_money: new NotConfiguredProvider('mobile_money', 'MOBILE_MONEY_API_KEY'),
    card: new NotConfiguredProvider('card', 'STRIPE_SECRET_KEY'),
}

function loadTransactions(): GeneTransaction[] {
    return readCollection<GeneTransaction>(COLLECTION)
}

function saveTransactions(rows: GeneTransaction[]): void {
    writeCollection(COLLECTION, rows)
}

export function registerPaymentsCoreRoutes(app: Express, adminMiddleware: RequestHandler): void {
    /**
     * Public, buyer-initiated. Creates a ledger row via the chosen provider.
     * NOTE: for `mobile_money` / `card` this will currently 400 with a clear
     * "not configured" error rather than a fake success — see class docs above.
     */
    app.post('/api/gene/payments/charge', async (req, res) => {
        try {
            const { propertyId, amountMinor, currency, provider } = req.body ?? {}

            if (!propertyId || typeof propertyId !== 'number') {
                return res.status(400).json({ message: 'propertyId (number) is required' })
            }
            if (!amountMinor || typeof amountMinor !== 'number' || amountMinor <= 0) {
                return res.status(400).json({ message: 'amountMinor (positive integer, smallest currency unit) is required' })
            }
            if (!currency || typeof currency !== 'string') {
                return res.status(400).json({ message: 'currency (string, e.g. "UGX") is required' })
            }
            const providerName = typeof provider === 'string' ? provider : 'manual'
            const impl = PROVIDERS[providerName]
            if (!impl) {
                return res.status(400).json({
                    message: `Unknown provider "${providerName}". Valid values: ${Object.keys(PROVIDERS).join(', ')}`,
                })
            }

            const rows = loadTransactions()
            const id = nextId(rows)
            const reference = `gene-txn-${id}-${Date.now()}`

            let result: ChargeResult
            try {
                result = await impl.charge({ amountMinor, currency, reference })
            } catch (err: any) {
                return res.status(400).json({ message: err?.message ?? 'Provider charge failed' })
            }

            const buyerUserId = req.isAuthenticated?.() && req.user ? (req.user as any).id : undefined

            const row: GeneTransaction = {
                id,
                propertyId,
                buyerUserId,
                provider: providerName,
                amountMinor,
                currency,
                status: result.status,
                reference,
                createdAt: nowIso(),
            }
            rows.push(row)
            saveTransactions(rows)

            res.status(201).json(row)
        } catch (error: any) {
            console.error('[gene/payments-core] charge error', error)
            res.status(500).json({ message: 'Failed to create charge', error: error?.message })
        }
    })

    /**
     * [ADMIN] A human confirms a pending manual payment (they verified the
     * cash/bank transfer/mobile-money receipt out of band).
     */
    app.post('/api/gene/payments/:id/confirm', adminMiddleware, async (req, res) => {
        try {
            const id = Number(req.params.id)
            if (!Number.isFinite(id)) {
                return res.status(400).json({ message: 'Invalid transaction id' })
            }

            const rows = loadTransactions()
            const idx = rows.findIndex((r) => r.id === id)
            if (idx === -1) {
                return res.status(404).json({ message: 'Transaction not found' })
            }
            if (rows[idx].status !== 'pending_manual_confirmation') {
                return res.status(400).json({
                    message: `Cannot confirm a transaction in status "${rows[idx].status}"; only pending_manual_confirmation may be confirmed.`,
                })
            }

            const confirmedBy = (req.user as any)?.username ?? (req.user as any)?.email ?? 'unknown-admin'
            rows[idx] = {
                ...rows[idx],
                status: 'confirmed',
                confirmedAt: nowIso(),
                confirmedBy,
            }
            saveTransactions(rows)

            res.json(rows[idx])
        } catch (error: any) {
            console.error('[gene/payments-core] confirm error', error)
            res.status(500).json({ message: 'Failed to confirm transaction', error: error?.message })
        }
    })

    /** [ADMIN] List the ledger, optionally filtered by propertyId. */
    app.get('/api/gene/payments/ledger', adminMiddleware, async (req, res) => {
        try {
            const rows = loadTransactions()
            const propertyId = req.query.propertyId ? Number(req.query.propertyId) : undefined
            const filtered =
                propertyId !== undefined ? rows.filter((r) => r.propertyId === propertyId) : rows
            res.json(filtered)
        } catch (error: any) {
            console.error('[gene/payments-core] ledger error', error)
            res.status(500).json({ message: 'Failed to load ledger', error: error?.message })
        }
    })
}
