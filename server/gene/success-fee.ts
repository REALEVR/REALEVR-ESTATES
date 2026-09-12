/**
 * GENE Platform — narrow, payment-choke-point-only success fee.
 *
 * SCOPE, PER THE MONETIZATION PLAYBOOK (2026-08-29, Section 2 stream #7 and
 * Section 8's 90-day action list, item 5): "Build the narrow
 * payment-choke-point success-fee flow — dual-confirmation only where a real
 * payment event exists. Do not build the broader, unenforceable
 * 'invoice-at-closing' version." There is no live platform-routed rent
 * payment yet (that's tenant-consent.ts's future pilot, gated on a licensed
 * payment partner per the playbook's Section 5) — so THIS module only
 * covers the other real choke point that already exists today: a
 * bank-documented property SALE, where a bank reference number is
 * independently verifiable evidence a deal actually closed. It deliberately
 * does NOT let anyone self-report an ordinary rental introduction as
 * fee-eligible — the playbook's Skeptic persona flagged that as the exact
 * mistake that killed pay-to-view: charging against something with no real
 * enforcement mechanism.
 *
 * DUAL CONFIRMATION: (1) the agent/admin who submits the claim, and (2) a
 * STRICT admin (see admin-guard.ts) who independently verifies the bank
 * reference before any fee is considered due. This is the same
 * conflict-of-interest logic as self-serve-listing.ts's payout approvals,
 * just pointed the other way: this is money OWED TO RealEVR, not money
 * RealEVR owes out.
 *
 * HONESTY NOTE: this module tracks a RECEIVABLE — it never auto-charges
 * anyone. "fee_due" means RealEVR should invoice/request the fee from the
 * agent; "collected" is set by a human once that money has actually been
 * received. No live collection gateway is wired here, same policy as every
 * other GENE payments module.
 *
 * Fee math matches the playbook's own worked example exactly: sale value ×
 * SALE_COMMISSION_PCT (Uganda's stated 5-10% agent-commission convention,
 * using the conservative 5% end) × REALEVR_SALE_CUT_PCT (RealEVR's cut of
 * that commission, 5%) — i.e. a 0.25% effective rate on sale value.
 *
 * Persistence: shared JSON-file collection store (see ./store.ts), collection
 * `gene_success_fee_claims`. No schema change, no new table.
 */
import type { Express, Request, Response, RequestHandler } from 'express'
import { readCollection, writeCollection, nextId, nowIso } from './store'
import { storage } from '../storage'
import { requireStrictAdmin } from './admin-guard'

const COLLECTION = 'gene_success_fee_claims'

/** Matches the playbook's own worked example (Section 2, stream #7). */
export const SALE_COMMISSION_PCT = 0.05
export const REALEVR_SALE_CUT_PCT = 0.05

export type SuccessFeeStatus = 'pending_review' | 'fee_due' | 'collected' | 'disputed' | 'rejected'

export interface SuccessFeeClaim {
    id: number
    propertyId: number
    propertyTitle: string
    claimedByUserId: number
    claimedByName: string
    saleValueUgx: number
    bankReferenceNumber: string
    buyerName: string
    closedAt: string
    status: SuccessFeeStatus
    feeUgx?: number // set only once a strict admin verifies — see /verify
    createdAt: string
    verifiedAt?: string
    verifiedBy?: string
    collectedAt?: string
    note?: string
}

function readClaims(): SuccessFeeClaim[] {
    return readCollection<SuccessFeeClaim>(COLLECTION)
}
function writeClaims(rows: SuccessFeeClaim[]): void {
    writeCollection(COLLECTION, rows)
}

export function registerSuccessFeeRoutes(app: Express, adminMiddleware: RequestHandler): void {
    // [ADMIN or AGENT] — submit a claim. Property must exist and be
    // category 'for_sale' — this is the payment-choke-point restriction,
    // enforced server-side so it can't be worked around from the client.
    app.post('/api/gene/success-fee/claims', adminMiddleware, async (req: Request, res: Response) => {
        try {
            const propertyId = Number(req.body?.propertyId)
            if (!Number.isFinite(propertyId)) return res.status(400).json({ message: 'propertyId (number) is required.' })

            const property = await storage.getProperty(propertyId)
            if (!property) return res.status(404).json({ message: 'Property not found.' })
            if (property.category !== 'for_sale') {
                return res.status(400).json({
                    message: 'Success fees only apply to bank-documented sales (category "for_sale") — not rental introductions. See server/gene/success-fee.ts for why.',
                })
            }

            const saleValueUgx = Number(req.body?.saleValueUgx)
            const bankReferenceNumber = String(req.body?.bankReferenceNumber ?? '').trim()
            const buyerName = String(req.body?.buyerName ?? '').trim()
            const closedAt = typeof req.body?.closedAt === 'string' && req.body.closedAt ? req.body.closedAt : nowIso()

            if (!Number.isFinite(saleValueUgx) || saleValueUgx <= 0) {
                return res.status(400).json({ message: 'saleValueUgx must be a positive number.' })
            }
            if (!bankReferenceNumber) {
                return res.status(400).json({ message: 'bankReferenceNumber is required — this is the verifiable evidence the sale closed.' })
            }
            if (!buyerName) return res.status(400).json({ message: 'buyerName is required.' })

            // One open claim per property at a time — avoids duplicate/conflicting claims.
            const existingOpen = readClaims().find(
                (c) => c.propertyId === propertyId && (c.status === 'pending_review' || c.status === 'fee_due')
            )
            if (existingOpen) {
                return res.status(409).json({ message: 'An open success-fee claim already exists for this property.', claim: existingOpen })
            }

            const user = req.user as any
            const rows = readClaims()
            const claim: SuccessFeeClaim = {
                id: nextId(rows),
                propertyId,
                propertyTitle: property.title,
                claimedByUserId: user.id,
                claimedByName: user.username ?? user.email ?? 'unknown',
                saleValueUgx,
                bankReferenceNumber,
                buyerName,
                closedAt,
                status: 'pending_review',
                createdAt: nowIso(),
            }
            rows.push(claim)
            writeClaims(rows)
            res.status(201).json(claim)
        } catch (err) {
            console.error('[gene/success-fee] create claim failed:', err)
            res.status(500).json({ message: 'Failed to submit success-fee claim.' })
        }
    })

    // [STRICT ADMIN] — independently verify the bank reference and compute
    // the fee. This is confirmation #2 in the dual-confirmation model.
    app.post('/api/gene/success-fee/claims/:id/verify', requireStrictAdmin, (req: Request, res: Response) => {
        try {
            const id = Number(req.params.id)
            const rows = readClaims()
            const idx = rows.findIndex((c) => c.id === id)
            if (idx === -1) return res.status(404).json({ message: 'Claim not found.' })
            if (rows[idx].status !== 'pending_review') {
                return res.status(400).json({ message: `Cannot verify a claim in status "${rows[idx].status}".` })
            }

            // Admin may correct the sale value if the claimed figure doesn't
            // match what they independently confirmed with the bank.
            const confirmedSaleValueUgx = Number.isFinite(Number(req.body?.confirmedSaleValueUgx))
                ? Number(req.body.confirmedSaleValueUgx)
                : rows[idx].saleValueUgx
            const feeUgx = Math.round(confirmedSaleValueUgx * SALE_COMMISSION_PCT * REALEVR_SALE_CUT_PCT)

            const verifiedBy = (req.user as any)?.username ?? (req.user as any)?.email ?? 'unknown-admin'
            rows[idx] = {
                ...rows[idx],
                saleValueUgx: confirmedSaleValueUgx,
                feeUgx,
                status: 'fee_due',
                verifiedAt: nowIso(),
                verifiedBy,
            }
            writeClaims(rows)
            res.json(rows[idx])
        } catch (err) {
            console.error('[gene/success-fee] verify failed:', err)
            res.status(500).json({ message: 'Failed to verify claim.' })
        }
    })

    // [STRICT ADMIN] — reject a claim that doesn't check out.
    app.post('/api/gene/success-fee/claims/:id/reject', requireStrictAdmin, (req: Request, res: Response) => {
        try {
            const id = Number(req.params.id)
            const rows = readClaims()
            const idx = rows.findIndex((c) => c.id === id)
            if (idx === -1) return res.status(404).json({ message: 'Claim not found.' })
            if (rows[idx].status !== 'pending_review') {
                return res.status(400).json({ message: `Cannot reject a claim in status "${rows[idx].status}".` })
            }
            const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined
            rows[idx] = { ...rows[idx], status: 'rejected', note: reason, verifiedAt: nowIso(), verifiedBy: (req.user as any)?.username }
            writeClaims(rows)
            res.json(rows[idx])
        } catch (err) {
            console.error('[gene/success-fee] reject failed:', err)
            res.status(500).json({ message: 'Failed to reject claim.' })
        }
    })

    // [STRICT ADMIN] — mark a verified fee as actually collected.
    app.post('/api/gene/success-fee/claims/:id/mark-collected', requireStrictAdmin, (req: Request, res: Response) => {
        try {
            const id = Number(req.params.id)
            const rows = readClaims()
            const idx = rows.findIndex((c) => c.id === id)
            if (idx === -1) return res.status(404).json({ message: 'Claim not found.' })
            if (rows[idx].status !== 'fee_due') {
                return res.status(400).json({ message: `Cannot mark collected a claim in status "${rows[idx].status}".` })
            }
            rows[idx] = { ...rows[idx], status: 'collected', collectedAt: nowIso() }
            writeClaims(rows)
            res.json(rows[idx])
        } catch (err) {
            console.error('[gene/success-fee] mark-collected failed:', err)
            res.status(500).json({ message: 'Failed to mark claim collected.' })
        }
    })

    // [STRICT ADMIN] — dispute a fee post-verification (e.g. agent pushes back).
    app.post('/api/gene/success-fee/claims/:id/dispute', requireStrictAdmin, (req: Request, res: Response) => {
        try {
            const id = Number(req.params.id)
            const rows = readClaims()
            const idx = rows.findIndex((c) => c.id === id)
            if (idx === -1) return res.status(404).json({ message: 'Claim not found.' })
            if (rows[idx].status !== 'fee_due') {
                return res.status(400).json({ message: `Cannot dispute a claim in status "${rows[idx].status}".` })
            }
            const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined
            rows[idx] = { ...rows[idx], status: 'disputed', note: reason }
            writeClaims(rows)
            res.json(rows[idx])
        } catch (err) {
            console.error('[gene/success-fee] dispute failed:', err)
            res.status(500).json({ message: 'Failed to dispute claim.' })
        }
    })

    // [STRICT ADMIN] — list, optional ?status=.
    app.get('/api/gene/success-fee/claims', requireStrictAdmin, (req: Request, res: Response) => {
        try {
            const status = typeof req.query.status === 'string' ? req.query.status : undefined
            let rows = readClaims()
            if (status) rows = rows.filter((c) => c.status === status)
            rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            res.json(rows)
        } catch (err) {
            console.error('[gene/success-fee] list failed:', err)
            res.status(500).json({ message: 'Failed to load claims.' })
        }
    })
}
