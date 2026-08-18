/**
 * ============================================================================
 * GENE Platform — BTC receiving address, QR code generation, and best-effort
 * on-chain payment detection.
 *
 *  ⚠️  FINANCE SIGN-OFF REQUIRED BEFORE LAUNCH  ⚠️
 *  This module extends `server/gene/btc-payments.ts` (read that file's header
 *  first). The same volatility/tolerance caveats apply here: this file does
 *  not change any buffer/tolerance math, it only adds (a) a QR code for a
 *  quoted BTC payment, and (b) a way to check whether that payment has landed
 *  on-chain, using a real receiving address that MUST be supplied via the
 *  `GENE_BTC_RECEIVE_ADDRESS` env var by whoever controls the wallet. Nothing
 *  in this file invents or hardcodes a placeholder address.
 *
 * HONESTY NOTE ON SANDBOX LIMITS: this dev sandbox has no general internet
 * egress (DynamoDB and public HTTPS APIs are both unreachable from here), so
 * the on-chain detection route below (`POST /api/gene/btc/:quoteId/check-onchain`)
 * could NOT be live-tested against mempool.space in this environment. It is
 * written to their documented, keyless public API and should be verified
 * against the real API once this is deployed somewhere with normal internet
 * access.
 * ============================================================================
 */
import type { Express, RequestHandler } from 'express'
import QRCode from 'qrcode'
import { nowIso, readCollection, writeCollection } from './store'
import { isQuoteExpired, reconcileSettlement, type GeneBtcSettlement } from './btc-payments'

const COLLECTION = 'gene_btc_settlements'
const DEFAULT_TOLERANCE_PCT = 0.005 // 0.5% — matches btc-payments.ts placeholder pending finance sign-off

function loadSettlements(): GeneBtcSettlement[] {
    return readCollection<GeneBtcSettlement>(COLLECTION)
}

function saveSettlements(rows: GeneBtcSettlement[]): void {
    writeCollection(COLLECTION, rows)
}

function getReceiveAddress(): string | null {
    const addr = process.env.GENE_BTC_RECEIVE_ADDRESS
    return typeof addr === 'string' && addr.trim().length > 0 ? addr.trim() : null
}

interface MempoolVout {
    scriptpubkey_address?: string
    value?: number
}

interface MempoolTx {
    vout?: MempoolVout[]
    status?: { confirmed?: boolean }
}

export function registerBtcQrRoutes(app: Express, adminMiddleware: RequestHandler): void {
    /**
     * Public. Returns a BIP21 URI + QR code data URI for an already-locked
     * BTC quote, so a customer can scan-to-pay.
     */
    app.get('/api/gene/btc/:quoteId/qr', async (req, res) => {
        try {
            const address = getReceiveAddress()
            if (!address) {
                return res.status(501).json({
                    message:
                        'GENE_BTC_RECEIVE_ADDRESS is not configured — set it to your receiving wallet address before enabling BTC payments.',
                })
            }

            const quoteId = Number(req.params.quoteId)
            if (!Number.isFinite(quoteId)) {
                return res.status(400).json({ message: 'quoteId (number) is required' })
            }

            const rows = loadSettlements()
            const quote = rows.find((r) => r.id === quoteId)
            if (!quote) {
                return res.status(404).json({ message: 'Quote not found' })
            }

            if (isQuoteExpired(quote.expiresAt)) {
                return res.status(410).json({ message: 'This BTC quote has expired. Request a new quote and try again.' })
            }

            const uri =
                `bitcoin:${address}?amount=${quote.btcAmount}` +
                `&label=${encodeURIComponent('REALEVR Tour Pass')}` +
                `&message=${encodeURIComponent('Quote ' + quoteId)}`

            const qrCodeDataUri = await QRCode.toDataURL(uri)

            res.json({
                quoteId,
                address,
                btcAmount: quote.btcAmount,
                uri,
                qrCodeDataUri,
            })
        } catch (error: any) {
            console.error('[gene/btc-qr] qr error', error)
            res.status(500).json({ message: 'Failed to generate BTC payment QR code', error: error?.message })
        }
    })

    /**
     * Public. Best-effort on-chain payment detection via mempool.space's free,
     * keyless public API.
     *
     * NOT LIVE-TESTABLE in this sandbox (no internet egress) — verify against
     * mempool.space's real API once deployed. mempool.space requires no API
     * key for this endpoint.
     */
    app.post('/api/gene/btc/:quoteId/check-onchain', async (req, res) => {
        try {
            const quoteId = Number(req.params.quoteId)
            if (!Number.isFinite(quoteId)) {
                return res.status(400).json({ message: 'quoteId (number) is required' })
            }

            const rows = loadSettlements()
            const idx = rows.findIndex((r) => r.id === quoteId)
            if (idx === -1) {
                return res.status(404).json({ message: 'Quote not found' })
            }
            const quote = rows[idx]

            const address = getReceiveAddress()
            if (!address) {
                return res.status(501).json({
                    message:
                        'GENE_BTC_RECEIVE_ADDRESS is not configured — set it to your receiving wallet address before enabling BTC payments.',
                })
            }

            let txs: MempoolTx[]
            try {
                const response = await fetch(`https://mempool.space/api/address/${address}/txs`)
                if (!response.ok) {
                    throw new Error(`mempool.space returned HTTP ${response.status}`)
                }
                const parsed = await response.json()
                if (!Array.isArray(parsed)) {
                    throw new Error('mempool.space returned an unexpected payload shape')
                }
                txs = parsed as MempoolTx[]
            } catch (fetchError: any) {
                return res.status(200).json({
                    checked: true,
                    found: false,
                    error: 'Could not reach blockchain explorer — try again shortly.',
                })
            }

            const tolerancePct = DEFAULT_TOLERANCE_PCT
            const toleranceBtc = quote.btcAmount * tolerancePct

            let matchedBtc: number | null = null
            for (const tx of txs) {
                if (!tx.status?.confirmed) continue
                for (const vout of tx.vout ?? []) {
                    if (vout.scriptpubkey_address !== address) continue
                    if (typeof vout.value !== 'number') continue
                    const receivedBtc = vout.value / 100_000_000
                    if (Math.abs(receivedBtc - quote.btcAmount) <= toleranceBtc) {
                        matchedBtc = receivedBtc
                        break
                    }
                }
                if (matchedBtc !== null) break
            }

            if (matchedBtc === null) {
                return res.json({ checked: true, found: false })
            }

            const reconciliation = reconcileSettlement(
                { btcAmount: quote.btcAmount, lockedRate: quote.lockedRate },
                matchedBtc,
                tolerancePct,
            )

            rows[idx] = {
                ...quote,
                status: 'reconciled',
                actualReceivedBtc: matchedBtc,
                reconciled: reconciliation.reconciled,
                shortfallBtc: reconciliation.shortfallBtc,
                withinTolerance: reconciliation.withinTolerance,
                reconciledAt: nowIso(),
            }
            saveSettlements(rows)

            res.json({ checked: true, found: true, reconciliation })
        } catch (error: any) {
            console.error('[gene/btc-qr] check-onchain error', error)
            res.status(500).json({ message: 'Failed to check on-chain BTC payment status', error: error?.message })
        }
    })

    /**
     * [ADMIN] Reports whether GENE_BTC_RECEIVE_ADDRESS is configured, and its
     * value, so the admin UI can show setup status without reading env vars.
     */
    app.get('/api/gene/btc/receive-config', adminMiddleware, async (_req, res) => {
        try {
            const address = getReceiveAddress()
            res.json({ configured: address !== null, address })
        } catch (error: any) {
            console.error('[gene/btc-qr] receive-config error', error)
            res.status(500).json({ message: 'Failed to load BTC receive config', error: error?.message })
        }
    })
}
