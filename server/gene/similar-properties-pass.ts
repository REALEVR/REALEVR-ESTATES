/**
 * GENE Platform — Similar Properties Pass: "let someone be required to pay
 * a fee of 20,000 [UGX] to view similar properties in the person's budget."
 *
 * Distinct from server/gene/tour-access-pass.ts's existing "UGX 15,000 / 5
 * properties / 24 hours" pass, which unlocks viewing *tours* generally. This
 * one gates a different, narrower thing: the "Similar Properties in Your
 * Budget" recommendations section on a property page (see
 * client/src/components/property/SimilarProperties.tsx) — same
 * pay-once-unlock-for-24h shape, reusing the exact same IoTec payment
 * plumbing (client/src/lib/iotec-paymentpatch.ts's
 * PaymentSources.paymentSimilarProperties gets its own completion event, so
 * this doesn't touch the generic /api/payment/iotect/record route or the
 * existing tour-pass issuance it triggers).
 *
 * Deliberately does NOT touch server/routes.ts, shared/schema.ts, or
 * server/storage.ts for its own pass bookkeeping — persistence uses the
 * shared server/gene/store.ts JSON-file collection store, same as every
 * other GENE module. The payment itself IS still recorded through the
 * existing storage.recordTourPayment() (so it shows up in the admin
 * dashboard's real revenue numbers, same as every other IoTec payment) —
 * only the pass/unlock bookkeeping is GENE-local.
 */
import type { Express, Request, Response } from 'express'
import { nextId, nowIso, readCollection, writeCollection } from './store'
import { storage } from '../storage'
import { SIMILAR_PROPERTIES_PASS_PRICE_UGX } from '../../shared/pricing'

const COLLECTION = 'gene_similar_properties_passes'

export const SIMILAR_PROPERTIES_PASS_VALIDITY_HOURS = 24

export interface SimilarPropertiesPass {
    id: number
    userId: number
    amountPaid: number
    currency: string
    issuedAt: string
    expiresAt: string
    status: 'active' | 'expired'
}

function loadPasses(): SimilarPropertiesPass[] {
    return readCollection<SimilarPropertiesPass>(COLLECTION)
}

function savePasses(rows: SimilarPropertiesPass[]): void {
    writeCollection(COLLECTION, rows)
}

function issuePass(userId: number, amountPaid: number, currency: string): SimilarPropertiesPass {
    const rows = loadPasses()
    const issuedAt = nowIso()
    const row: SimilarPropertiesPass = {
        id: nextId(rows),
        userId,
        amountPaid,
        currency,
        issuedAt,
        expiresAt: new Date(Date.now() + SIMILAR_PROPERTIES_PASS_VALIDITY_HOURS * 60 * 60 * 1000).toISOString(),
        status: 'active',
    }
    rows.push(row)
    savePasses(rows)
    return row
}

/** Same lazy-expiry pattern as tour-access-pass.ts's getActivePass(). */
function getActivePass(userId: number): SimilarPropertiesPass | null {
    const rows = loadPasses()
    const mostRecent = rows
        .filter((r) => r.userId === userId)
        .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime())[0]

    if (!mostRecent || mostRecent.status !== 'active') return null

    if (new Date(mostRecent.expiresAt).getTime() <= Date.now()) {
        const idx = rows.findIndex((r) => r.id === mostRecent.id)
        if (idx !== -1) {
            rows[idx] = { ...rows[idx], status: 'expired' }
            savePasses(rows)
        }
        return null
    }
    return mostRecent
}

function getAuthedUserId(req: Request): number | null {
    if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) return null
    const user = req.user as any
    return typeof user.id === 'number' ? user.id : null
}

export function registerSimilarPropertiesPassRoutes(app: Express): void {
    /** Authenticated user: is the "Similar Properties" section unlocked right now? */
    app.get('/api/gene/similar-properties/status', (req: Request, res: Response) => {
        const userId = getAuthedUserId(req)
        if (!userId) return res.json({ active: false })
        res.json({ active: getActivePass(userId) !== null, priceUgx: SIMILAR_PROPERTIES_PASS_PRICE_UGX })
    })

    /**
     * Authenticated user: confirm a completed IoTec payment and issue the
     * unlock. Called directly from SimilarPropertiesPaymentModal.tsx's own
     * payment-completion handler — same pattern TourPaymentModal.tsx uses
     * for recordTourPayment(), not routed through the generic
     * /api/payment/iotect/record handler (which is specifically about
     * tour-view payments/passes).
     */
    app.post('/api/gene/similar-properties/confirm', async (req: Request, res: Response) => {
        const userId = getAuthedUserId(req)
        if (!userId) return res.status(401).json({ message: 'Sign in first.' })

        try {
            const { propertyId, transactionId, amount, currency } = req.body ?? {}
            const propId = Number(propertyId)
            const paidAmount = Number(amount)
            if (!Number.isFinite(propId) || typeof transactionId !== 'string' || !transactionId) {
                return res.status(400).json({ message: 'propertyId and transactionId are required.' })
            }

            // Still a real payment — record it the same way every other
            // IoTec payment is recorded, so it shows up in the admin
            // dashboard's real revenue numbers.
            await storage.recordTourPayment({
                transactionId,
                propertyId: propId,
                userId,
                amount: Number.isFinite(paidAmount) && paidAmount > 0 ? paidAmount : SIMILAR_PROPERTIES_PASS_PRICE_UGX,
                currency: typeof currency === 'string' && currency ? currency : 'UGX',
                timestamp: nowIso(),
            })

            const pass = issuePass(
                userId,
                Number.isFinite(paidAmount) && paidAmount > 0 ? paidAmount : SIMILAR_PROPERTIES_PASS_PRICE_UGX,
                typeof currency === 'string' && currency ? currency : 'UGX'
            )
            res.status(201).json(pass)
        } catch (err: any) {
            console.error('[gene/similar-properties-pass] confirm failed:', err)
            res.status(500).json({ message: 'Failed to confirm payment.' })
        }
    })
}
