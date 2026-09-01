/**
 * GENE Platform — tenant payment-history consent capture SCAFFOLD.
 *
 * WHAT THIS IS: per the monetization playbook (2026-08-29), Section 5, the
 * tenant rent-payment/credit-history product is explicitly "a near-term
 * pilot, not a near-term revenue pillar" — it needs a licensed payment
 * partner (Bank of Uganda National Payment Systems Act) before any real
 * rent money can move through the platform, and a real credit-bureau
 * partnership (Compuscan/Metropol) before payment history is worth
 * anything to a lender. NEITHER EXISTS YET. This module is only the
 * consent-capture half of the 90-day action list's item 6: "Add consent
 * capture to tenant-payment pilot onboarding now, ahead of the pilot
 * itself" — so that once a real pilot launches, lawful-basis consent under
 * Uganda's Data Protection and Privacy Act 2019 is already in place rather
 * than retrofitted.
 *
 * WHAT THIS IS NOT: no money moves here. No payment is processed, no rent
 * is collected, no credit bureau is contacted, no tax claim is made. This
 * is a form that records what a tenant agreed to, nothing else — same
 * "never fabricate a mechanism that doesn't exist" policy applied
 * everywhere else in this codebase.
 *
 * Persistence: shared JSON-file collection store (see ./store.ts), collection
 * `gene_tenant_payment_consents`.
 */
import type { Express, Request, Response } from 'express'
import { readCollection, writeCollection, nextId, nowIso } from './store'

const COLLECTION = 'gene_tenant_payment_consents'

/** Bump this if the consent language materially changes — old records keep
 * the version they actually agreed to. */
const CONSENT_VERSION = 'v1-2026-08'

export interface TenantPaymentConsent {
    id: number
    userId: number
    /** Agreeing to have RealEVR route future rent/deposit payments and record them. */
    consentToPaymentTracking: boolean
    /** Agreeing that, once a real bureau partnership exists, that payment history MAY be shared with it. Explicitly separate from the tracking consent — a tenant can want their own record without opting into third-party sharing yet. */
    consentToFutureCreditBureauSharing: boolean
    consentVersion: string
    createdAt: string
    updatedAt: string
}

function readConsents(): TenantPaymentConsent[] {
    return readCollection<TenantPaymentConsent>(COLLECTION)
}
function writeConsents(rows: TenantPaymentConsent[]): void {
    writeCollection(COLLECTION, rows)
}

export function registerTenantConsentRoutes(app: Express): void {
    // Authenticated — record/update the caller's own consent choices.
    app.post('/api/gene/tenant-consent', (req: Request, res: Response) => {
        try {
            if (!req.isAuthenticated?.() || !req.user) return res.status(401).json({ message: 'Sign in first.' })
            const consentToPaymentTracking = Boolean(req.body?.consentToPaymentTracking)
            const consentToFutureCreditBureauSharing = Boolean(req.body?.consentToFutureCreditBureauSharing)

            const user = req.user as any
            const rows = readConsents()
            const idx = rows.findIndex((r) => r.userId === user.id)
            const now = nowIso()

            if (idx === -1) {
                const record: TenantPaymentConsent = {
                    id: nextId(rows),
                    userId: user.id,
                    consentToPaymentTracking,
                    consentToFutureCreditBureauSharing,
                    consentVersion: CONSENT_VERSION,
                    createdAt: now,
                    updatedAt: now,
                }
                rows.push(record)
                writeConsents(rows)
                return res.status(201).json(record)
            }

            rows[idx] = {
                ...rows[idx],
                consentToPaymentTracking,
                consentToFutureCreditBureauSharing,
                consentVersion: CONSENT_VERSION,
                updatedAt: now,
            }
            writeConsents(rows)
            res.json(rows[idx])
        } catch (err) {
            console.error('[gene/tenant-consent] save failed:', err)
            res.status(500).json({ message: 'Failed to save consent.' })
        }
    })

    // Authenticated — the caller's own current consent status.
    app.get('/api/gene/tenant-consent/mine', (req: Request, res: Response) => {
        if (!req.isAuthenticated?.() || !req.user) return res.status(401).json({ message: 'Sign in first.' })
        const user = req.user as any
        const record = readConsents().find((r) => r.userId === user.id)
        res.json(record ?? { userId: user.id, consentToPaymentTracking: false, consentToFutureCreditBureauSharing: false, consentVersion: null })
    })
}
