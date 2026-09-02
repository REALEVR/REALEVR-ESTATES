/**
 * ============================================================================
 * GENE Platform — Bitcoin checkout with volatility buffer.
 *
 *  ⚠️  FINANCE SIGN-OFF REQUIRED BEFORE LAUNCH  ⚠️
 *  This module is explicitly flagged in the product plan as needing finance
 *  sign-off before it is used for a real settlement. Accepting BTC exposes
 *  the business to exchange-rate volatility between quote-lock and on-chain
 *  confirmation, and the buffer/tolerance percentages below are placeholders
 *  — they must be reviewed and approved by finance (and likely legal/compliance
 *  for AML/KYC on crypto receipts) before this is wired to a live BTC wallet.
 * ============================================================================
 *
 * HONESTY NOTE: there is no live BTC/USD exchange-rate feed credential wired
 * up in this environment, and no real BTC settlement gateway. This module
 * does NOT call out to any exchange-rate API with a hardcoded/fake key, and
 * does NOT invent a fake rate. The `/api/gene/btc/quote` route requires the
 * caller to supply `?btcUsdRate=` today; if it's missing, the route 400s
 * with a clear message rather than pretending to know the rate.
 *
 * REAL INTEGRATION POINT (do this before launch, not here):
 *   Replace the "supply btcUsdRate yourself" flow with a live rate feed —
 *   e.g. CoinGecko's public `/simple/price` endpoint, which needs no API key
 *   on their free tier — fetched via a real HTTP call once network access to
 *   that host is confirmed available from this deployment. Do not hardcode a
 *   snapshot rate as if it were live.
 */
import type { Express, RequestHandler } from 'express'
import { storage } from '../storage'
import { nextId, nowIso, readCollection, writeCollection } from './store'

const COLLECTION = 'gene_btc_settlements'

export type BtcSettlementStatus = 'quoted' | 'reconciled' | 'expired'

export interface GeneBtcSettlement {
    id: number
    propertyId: number
    localAmount: number
    localCurrency: string
    btcUsdRate: number
    usdToLocalRate: number
    bufferPct: number
    btcAmount: number
    lockedRate: number
    expiresAt: string
    createdAt: string
    status: BtcSettlementStatus
    actualReceivedBtc?: number
    reconciled?: boolean
    shortfallBtc?: number
    withinTolerance?: boolean
    reconciledAt?: string
}

/**
 * Pure, unit-testable quote logic — no I/O.
 *
 * Computes how much BTC the buyer must send to cover `localAmount` of
 * `localCurrency`, inflated by `bufferPct` to absorb price movement between
 * quote-lock and on-chain confirmation, and locks that quote for a short
 * window (default handled by caller; this function always uses `Date.now()`
 * as "now" since it's a runtime function, not a workflow/build script).
 *
 * @param localAmount     amount in local currency major units (e.g. 500000 UGX)
 * @param localCurrency   ISO-ish currency code, e.g. "UGX"
 * @param btcUsdRate      USD price of 1 BTC (must be supplied by caller — see file header)
 * @param usdToLocalRate  how many units of localCurrency equal 1 USD
 * @param bufferPct       volatility buffer, e.g. 0.02 for 2%
 */
export function lockQuote(
    localAmount: number,
    localCurrency: string,
    btcUsdRate: number,
    usdToLocalRate: number,
    bufferPct: number,
): { btcAmount: number; lockedRate: number; expiresAt: string; bufferPct: number } {
    if (localAmount <= 0) throw new Error('localAmount must be positive')
    if (btcUsdRate <= 0) throw new Error('btcUsdRate must be positive')
    if (usdToLocalRate <= 0) throw new Error('usdToLocalRate must be positive')
    if (bufferPct < 0) throw new Error('bufferPct must be >= 0')

    const usdAmount = localAmount / usdToLocalRate
    const rawBtcAmount = usdAmount / btcUsdRate
    const btcAmount = rawBtcAmount * (1 + bufferPct)

    // Effective locked rate: local-currency value of 1 BTC implied by this quote,
    // i.e. what the buyer is effectively being asked to accept per BTC once the
    // buffer is folded in. Kept for audit/reconciliation purposes.
    const lockedRate = localAmount / btcAmount

    const QUOTE_WINDOW_MS = 15 * 60 * 1000 // 15 minutes
    const expiresAt = new Date(Date.now() + QUOTE_WINDOW_MS).toISOString()

    return { btcAmount, lockedRate, expiresAt, bufferPct }
}

/** Pure — no I/O. Whether a previously locked quote has expired. */
export function isQuoteExpired(expiresAt: string): boolean {
    const t = Date.parse(expiresAt)
    if (Number.isNaN(t)) return true
    return Date.now() > t
}

/**
 * Pure, unit-testable reconciliation logic — no I/O.
 * Compares what was actually received on-chain against the locked quote.
 */
export function reconcileSettlement(
    quoted: { btcAmount: number; lockedRate: number },
    actualReceivedBtc: number,
    tolerancePct: number,
): { reconciled: boolean; shortfallBtc: number; withinTolerance: boolean } {
    const shortfallBtc = quoted.btcAmount - actualReceivedBtc
    const toleranceBtc = quoted.btcAmount * tolerancePct
    const withinTolerance = Math.abs(shortfallBtc) <= toleranceBtc
    // "reconciled" means we're treating this settlement as settled: either the
    // full amount (or more) was received, or the shortfall is within the
    // finance-approved tolerance band.
    const reconciled = shortfallBtc <= 0 || withinTolerance
    return { reconciled, shortfallBtc, withinTolerance }
}

function loadSettlements(): GeneBtcSettlement[] {
    return readCollection<GeneBtcSettlement>(COLLECTION)
}

function saveSettlements(rows: GeneBtcSettlement[]): void {
    writeCollection(COLLECTION, rows)
}

const DEFAULT_BUFFER_PCT = 0.02 // 2% — placeholder, pending finance sign-off
const DEFAULT_TOLERANCE_PCT = 0.005 // 0.5% — placeholder, pending finance sign-off

export function registerBtcPaymentsRoutes(app: Express, adminMiddleware: RequestHandler): void {
    /**
     * Public. Locks a BTC quote for a property purchase amount.
     * `btcUsdRate` and `usdToLocalRate` must be supplied by the caller today
     * (see file header for why) — this route does not invent a rate.
     */
    app.get('/api/gene/btc/quote', async (req, res) => {
        try {
            const propertyId = Number(req.query.propertyId)
            const amountLocal = Number(req.query.amountLocal)
            const currency = typeof req.query.currency === 'string' ? req.query.currency : undefined
            const btcUsdRate = req.query.btcUsdRate ? Number(req.query.btcUsdRate) : undefined
            const usdToLocalRate = req.query.usdToLocalRate ? Number(req.query.usdToLocalRate) : undefined
            const bufferPct = req.query.bufferPct ? Number(req.query.bufferPct) : DEFAULT_BUFFER_PCT

            if (!Number.isFinite(propertyId)) {
                return res.status(400).json({ message: 'propertyId (number) is required' })
            }
            if (!Number.isFinite(amountLocal) || amountLocal <= 0) {
                return res.status(400).json({ message: 'amountLocal (positive number) is required' })
            }
            if (!currency) {
                return res.status(400).json({ message: 'currency (string, e.g. "UGX") is required' })
            }
            if (btcUsdRate === undefined || !Number.isFinite(btcUsdRate) || btcUsdRate <= 0) {
                return res.status(400).json({
                    message:
                        'No live BTC/USD rate feed is configured yet. Supply ?btcUsdRate= explicitly for now. ' +
                        'Before launch, replace this with a live rate feed (e.g. CoinGecko\'s free public API) — see file header comment in server/gene/btc-payments.ts.',
                })
            }
            if (usdToLocalRate === undefined || !Number.isFinite(usdToLocalRate) || usdToLocalRate <= 0) {
                return res.status(400).json({
                    message: 'No USD-to-local exchange rate configured yet. Supply ?usdToLocalRate= explicitly for now.',
                })
            }

            const property = await storage.getProperty(propertyId)
            if (!property) {
                return res.status(404).json({ message: 'Property not found' })
            }

            const quote = lockQuote(amountLocal, currency, btcUsdRate, usdToLocalRate, bufferPct)

            const rows = loadSettlements()
            const id = nextId(rows)
            const row: GeneBtcSettlement = {
                id,
                propertyId,
                localAmount: amountLocal,
                localCurrency: currency,
                btcUsdRate,
                usdToLocalRate,
                bufferPct: quote.bufferPct,
                btcAmount: quote.btcAmount,
                lockedRate: quote.lockedRate,
                expiresAt: quote.expiresAt,
                createdAt: nowIso(),
                status: 'quoted',
            }
            rows.push(row)
            saveSettlements(rows)

            res.status(201).json(row)
        } catch (error: any) {
            console.error('[gene/btc-payments] quote error', error)
            res.status(500).json({ message: 'Failed to lock BTC quote', error: error?.message })
        }
    })

    /**
     * [ADMIN] Given a quote id + actual BTC received on-chain, reconciles the
     * settlement and persists the result.
     * FINANCE SIGN-OFF REQUIRED before this endpoint is used to close out a
     * real transaction — see file header.
     */
    app.post('/api/gene/btc/settle', adminMiddleware, async (req, res) => {
        try {
            const { id, actualReceivedBtc, tolerancePct } = req.body ?? {}
            const settlementId = Number(id)
            if (!Number.isFinite(settlementId)) {
                return res.status(400).json({ message: 'id (number) is required' })
            }
            if (typeof actualReceivedBtc !== 'number' || actualReceivedBtc < 0) {
                return res.status(400).json({ message: 'actualReceivedBtc (number >= 0) is required' })
            }

            const rows = loadSettlements()
            const idx = rows.findIndex((r) => r.id === settlementId)
            if (idx === -1) {
                return res.status(404).json({ message: 'Settlement/quote not found' })
            }

            const row = rows[idx]
            if (isQuoteExpired(row.expiresAt) && row.status === 'quoted') {
                row.status = 'expired'
            }

            const tolerance = typeof tolerancePct === 'number' ? tolerancePct : DEFAULT_TOLERANCE_PCT
            const result = reconcileSettlement(
                { btcAmount: row.btcAmount, lockedRate: row.lockedRate },
                actualReceivedBtc,
                tolerance,
            )

            rows[idx] = {
                ...row,
                status: 'reconciled',
                actualReceivedBtc,
                reconciled: result.reconciled,
                shortfallBtc: result.shortfallBtc,
                withinTolerance: result.withinTolerance,
                reconciledAt: nowIso(),
            }
            saveSettlements(rows)

            res.json(rows[idx])
        } catch (error: any) {
            console.error('[gene/btc-payments] settle error', error)
            res.status(500).json({ message: 'Failed to reconcile BTC settlement', error: error?.message })
        }
    })
}
