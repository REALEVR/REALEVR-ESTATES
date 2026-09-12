/**
 * GENE Platform — Featured/Boost Placement, the #1 revenue lever from the
 * monetization playbook (delivered 2026-08-29, "REALEVR Estates —
 * Monetization Playbook", Section 2 stream #1): a paid, tiered ranking boost
 * for a listing, directly analogous to Jiji.ug's proven "Boost" product and
 * the ~75%-of-portals global standard for premium placement.
 *
 * HOW IT ACTUALLY PROMOTES A LISTING: rather than inventing a new "boosted"
 * concept the rest of the app doesn't know about, an active boost sets the
 * REAL `properties.isFeatured` column (shared/schema.ts) via the existing
 * `storage.updateProperty()` — the same column FeaturedPropertiesPage.tsx
 * and the admin Property Manager already read/write. When the boost expires
 * it's restored to whatever `isFeatured` was before the boost started, not
 * force-set to false — so it never stomps a value an admin set by hand
 * (e.g. via PropertyManager's own Featured toggle). Purchases persist in
 * their own collection so pricing/tiers/expiry/take-rate tracking don't
 * depend on that one boolean column.
 *
 * HONESTY NOTE — payment: same manual-confirmation policy as
 * payments-core.ts. There is no live mobile-money charge credential in this
 * environment, so a purchase starts `pending_manual_confirmation`; a human
 * (admin/ops) confirms the mobile money was actually received via
 * POST /api/gene/boost/:id/confirm, which is what actually flips
 * `isFeatured` on. Confirm/cancel use the shared `adminMiddleware`
 * (admin OR agent) — this is money coming IN with no payout conflict of
 * interest, same reasoning as payments-core.ts's own /confirm route; it is
 * NOT a strict-admin route like the referral payout approvals.
 *
 * TAKE-RATE INSTRUMENTATION: the playbook's Section 4 flags the take-rate of
 * Boost specifically among AGENT-REFERRED listings (via
 * self-serve-listing.ts's `getLiveReferredPropertyIds()`) as the single
 * highest-leverage number the whole revenue model depends on, and computes
 * a ~5.6% breakeven take-rate for that cohort against the referral payout's
 * true cost. GET /api/gene/boost/take-rate reports the REAL measured
 * take-rate (referred vs. all-listings) against that breakeven, with an
 * explicit small-sample warning rather than false confidence on thin data.
 *
 * Persistence: shared JSON-file collection store (see ./store.ts), collection
 * `gene_boost_purchases`. No DynamoDB, no new deps, no schema change.
 */
import type { Express, Request, Response, RequestHandler } from 'express'
import { readCollection, writeCollection, nextId, nowIso } from './store'
import { storage } from '../storage'
import { sendWhatsAppMessage } from './whatsapp'
import { getLiveReferredPropertyIds } from './self-serve-listing'

const COLLECTION = 'gene_boost_purchases'

export type BoostTier = 'bronze' | 'silver' | 'gold'

export const BOOST_TIERS: Record<BoostTier, { priceUgx: number; durationDays: number; label: string }> = {
    bronze: { priceUgx: 10000, durationDays: 7, label: 'Bronze — 7 days' },
    silver: { priceUgx: 25000, durationDays: 14, label: 'Silver — 14 days' },
    gold: { priceUgx: 50000, durationDays: 30, label: 'Gold — 30 days (top of search + badge)' },
}

/** From the monetization playbook, Section 4: the take-rate a boosted,
 * agent-referred listing needs to clear for the referral program (true cost
 * ~1,400 UGX incl. mobile money disbursement) to be self-funding off Boost
 * revenue alone. Referenced, not re-derived, so this module and the
 * playbook never drift apart on the number. */
export const REFERRED_TAKE_RATE_BREAKEVEN_PCT = 5.6
const MIN_SAMPLE_FOR_CONFIDENT_TAKE_RATE = 20

export type BoostStatus = 'pending_manual_confirmation' | 'active' | 'expired' | 'cancelled' | 'superseded'

export interface BoostPurchase {
    id: number
    propertyId: number
    buyerUserId: number
    tier: BoostTier
    amountUgx: number
    durationDays: number
    status: BoostStatus
    /** Whether this property came through the agent-referral flow — snapshotted
     * at purchase time so take-rate reporting doesn't need to re-join every read. */
    referredListing: boolean
    /** What `isFeatured` was immediately before THIS BOOST CHAIN started —
     * carried forward from the prior purchase on renewal/re-boost so a
     * multi-boost chain restores correctly when the whole chain ends, not
     * just the most recent link. */
    wasFeaturedBeforeChain: boolean
    requestedAt: string
    confirmedAt?: string
    confirmedBy?: string
    startsAt?: string
    expiresAt?: string
    decidedNote?: string
}

function readPurchases(): BoostPurchase[] {
    return readCollection<BoostPurchase>(COLLECTION)
}
function writePurchases(rows: BoostPurchase[]): void {
    writeCollection(COLLECTION, rows)
}

/** Lazy expiry — same pattern as tour-access-pass.ts's getActivePass: no
 * cron job, just reconcile on read. Restores `isFeatured` to what it was
 * before the boost chain started (see wasFeaturedBeforeChain doc above),
 * never force-false. Best-effort: a storage failure here logs and moves on
 * rather than breaking the read path that triggered the sweep. */
async function sweepExpiredBoosts(): Promise<void> {
    const rows = readPurchases()
    const now = Date.now()
    let changed = false

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        if (row.status !== 'active' || !row.expiresAt) continue
        if (new Date(row.expiresAt).getTime() > now) continue

        rows[i] = { ...row, status: 'expired' }
        changed = true

        // Only restore isFeatured if nothing else currently active is
        // covering this property (e.g. a race with a brand-new boost).
        const stillActiveForProperty = rows.some(
            (r) => r.propertyId === row.propertyId && r.status === 'active' && r.id !== row.id
        )
        if (!stillActiveForProperty) {
            try {
                await storage.updateProperty(row.propertyId, { isFeatured: row.wasFeaturedBeforeChain } as any)
            } catch (err) {
                console.error(`[gene/boost-placement] failed to restore isFeatured for property ${row.propertyId}:`, err)
            }
        }
    }

    if (changed) writePurchases(rows)
}

function toPublicView(p: BoostPurchase) {
    return {
        id: p.id,
        propertyId: p.propertyId,
        tier: p.tier,
        tierLabel: BOOST_TIERS[p.tier].label,
        amountUgx: p.amountUgx,
        durationDays: p.durationDays,
        status: p.status,
        requestedAt: p.requestedAt,
        confirmedAt: p.confirmedAt ?? null,
        startsAt: p.startsAt ?? null,
        expiresAt: p.expiresAt ?? null,
    }
}

export function registerBoostPlacementRoutes(app: Express, adminMiddleware: RequestHandler): void {
    // Public — tiers/pricing for the purchase UI.
    app.get('/api/gene/boost/tiers', (_req: Request, res: Response) => {
        res.json({ tiers: BOOST_TIERS, currency: 'UGX' })
    })

    // Authenticated — the property's owner (or an admin) requests a boost.
    app.post('/api/gene/boost/:propertyId/purchase', async (req: Request, res: Response) => {
        try {
            if (!req.isAuthenticated?.() || !req.user) {
                return res.status(401).json({ message: 'Sign in first — boosts are tied to the property owner\'s account.' })
            }
            const propertyId = Number(req.params.propertyId)
            if (!Number.isFinite(propertyId)) return res.status(400).json({ message: 'Invalid property id.' })

            const tier = req.body?.tier as BoostTier
            if (!tier || !(tier in BOOST_TIERS)) {
                return res.status(400).json({ message: `tier must be one of: ${Object.keys(BOOST_TIERS).join(', ')}` })
            }

            const property = await storage.getProperty(propertyId)
            if (!property) return res.status(404).json({ message: 'Property not found.' })

            const user = req.user as any
            const isOwner = property.ownerId != null && property.ownerId === user.id
            if (!isOwner && user.role !== 'admin') {
                return res.status(403).json({ message: 'Only this listing\'s owner (or an admin) can boost it.' })
            }

            // Existing pending request for the same property? Don't stack —
            // point them at it instead of creating a duplicate charge.
            const existingPending = readPurchases().find(
                (r) => r.propertyId === propertyId && r.status === 'pending_manual_confirmation'
            )
            if (existingPending) {
                return res.status(409).json({
                    message: 'There is already a boost purchase awaiting payment confirmation for this listing.',
                    purchase: toPublicView(existingPending),
                })
            }

            // Chain the pre-boost isFeatured state through any currently
            // active boost, so a renewal doesn't lose the original value.
            const activeForProperty = readPurchases().find((r) => r.propertyId === propertyId && r.status === 'active')
            const wasFeaturedBeforeChain = activeForProperty ? activeForProperty.wasFeaturedBeforeChain : Boolean(property.isFeatured)

            const tierDef = BOOST_TIERS[tier]
            const rows = readPurchases()
            const purchase: BoostPurchase = {
                id: nextId(rows),
                propertyId,
                buyerUserId: user.id,
                tier,
                amountUgx: tierDef.priceUgx,
                durationDays: tierDef.durationDays,
                status: 'pending_manual_confirmation',
                referredListing: getLiveReferredPropertyIds().includes(propertyId),
                wasFeaturedBeforeChain,
                requestedAt: nowIso(),
            }
            rows.push(purchase)
            writePurchases(rows)

            res.status(201).json({
                purchase: toPublicView(purchase),
                message: `Boost requested: ${tierDef.label} for ${tierDef.priceUgx.toLocaleString()} UGX. Pay via mobile money and our team will confirm and activate it — message us on WhatsApp with your listing name to speed this up.`,
            })
        } catch (err) {
            console.error('[gene/boost-placement] purchase failed:', err)
            res.status(500).json({ message: 'Could not start a boost purchase.' })
        }
    })

    // Authenticated — the buyer's own boost history.
    app.get('/api/gene/boost/mine', async (req: Request, res: Response) => {
        if (!req.isAuthenticated?.() || !req.user) return res.status(401).json({ message: 'Sign in first.' })
        await sweepExpiredBoosts()
        const user = req.user as any
        const rows = readPurchases()
            .filter((r) => r.buyerUserId === user.id)
            .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())
        res.json(rows.map(toPublicView))
    })

    // Public — which properties are currently boosted (for badges/sort on listing pages).
    app.get('/api/gene/boost/active-property-ids', async (_req: Request, res: Response) => {
        try {
            await sweepExpiredBoosts()
            const ids = Array.from(new Set(readPurchases().filter((r) => r.status === 'active').map((r) => r.propertyId)))
            res.json({ propertyIds: ids })
        } catch (err) {
            console.error('[gene/boost-placement] active-property-ids failed:', err)
            res.status(500).json({ message: 'Failed to load active boosts.' })
        }
    })

    // Public — boost status for one property.
    app.get('/api/gene/boost/status/:propertyId', async (req: Request, res: Response) => {
        try {
            const propertyId = Number(req.params.propertyId)
            if (!Number.isFinite(propertyId)) return res.status(400).json({ message: 'Invalid property id.' })
            await sweepExpiredBoosts()
            const active = readPurchases()
                .filter((r) => r.propertyId === propertyId && r.status === 'active')
                .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())[0]
            if (!active) return res.json({ boosted: false })
            res.json({ boosted: true, tier: active.tier, tierLabel: BOOST_TIERS[active.tier].label, expiresAt: active.expiresAt })
        } catch (err) {
            console.error('[gene/boost-placement] status failed:', err)
            res.status(500).json({ message: 'Failed to load boost status.' })
        }
    })

    // [ADMIN or AGENT] — list purchases, optional ?status=.
    app.get('/api/gene/boost/purchases', adminMiddleware, async (req: Request, res: Response) => {
        try {
            await sweepExpiredBoosts()
            const status = typeof req.query.status === 'string' ? req.query.status : undefined
            let rows = readPurchases()
            if (status) rows = rows.filter((r) => r.status === status)
            rows.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())
            res.json(rows)
        } catch (err) {
            console.error('[gene/boost-placement] list purchases failed:', err)
            res.status(500).json({ message: 'Failed to load boost purchases.' })
        }
    })

    // [ADMIN or AGENT] — confirm mobile money was received; this is what
    // actually activates the boost (flips isFeatured on).
    app.post('/api/gene/boost/:id/confirm', adminMiddleware, async (req: Request, res: Response) => {
        try {
            const id = Number(req.params.id)
            const rows = readPurchases()
            const idx = rows.findIndex((r) => r.id === id)
            if (idx === -1) return res.status(404).json({ message: 'Boost purchase not found.' })
            if (rows[idx].status !== 'pending_manual_confirmation') {
                return res.status(400).json({ message: `Cannot confirm a purchase in status "${rows[idx].status}".` })
            }

            // Supersede any other still-active boost on the same property
            // rather than stacking two active rows for it.
            const propertyId = rows[idx].propertyId
            for (let i = 0; i < rows.length; i++) {
                if (rows[i].propertyId === propertyId && rows[i].status === 'active' && rows[i].id !== id) {
                    rows[i] = { ...rows[i], status: 'superseded' }
                }
            }

            const confirmedBy = (req.user as any)?.username ?? (req.user as any)?.email ?? 'unknown-admin'
            const startsAt = nowIso()
            const expiresAt = new Date(Date.now() + rows[idx].durationDays * 24 * 60 * 60 * 1000).toISOString()
            rows[idx] = { ...rows[idx], status: 'active', confirmedAt: nowIso(), confirmedBy, startsAt, expiresAt }
            writePurchases(rows)

            try {
                await storage.updateProperty(propertyId, { isFeatured: true } as any)
            } catch (err) {
                console.error(`[gene/boost-placement] failed to set isFeatured for property ${propertyId}:`, err)
            }

            try {
                const buyer = await storage.getUser(rows[idx].buyerUserId)
                if (buyer?.phoneNumber) {
                    await sendWhatsAppMessage(
                        buyer.phoneNumber,
                        `🚀 Your ${BOOST_TIERS[rows[idx].tier].label} boost is live! Your listing will show as featured until ${new Date(expiresAt).toLocaleDateString()}.`
                    )
                }
            } catch (err) {
                console.error('[gene/boost-placement] buyer notification failed:', err)
            }

            res.json(toPublicView(rows[idx]))
        } catch (err) {
            console.error('[gene/boost-placement] confirm failed:', err)
            res.status(500).json({ message: 'Failed to confirm boost purchase.' })
        }
    })

    // [ADMIN or AGENT] — cancel a still-pending purchase (payment never came in, etc).
    app.post('/api/gene/boost/:id/cancel', adminMiddleware, (req: Request, res: Response) => {
        try {
            const id = Number(req.params.id)
            const rows = readPurchases()
            const idx = rows.findIndex((r) => r.id === id)
            if (idx === -1) return res.status(404).json({ message: 'Boost purchase not found.' })
            if (rows[idx].status !== 'pending_manual_confirmation') {
                return res.status(400).json({ message: `Cannot cancel a purchase in status "${rows[idx].status}".` })
            }
            const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined
            rows[idx] = { ...rows[idx], status: 'cancelled', decidedNote: reason }
            writePurchases(rows)
            res.json(toPublicView(rows[idx]))
        } catch (err) {
            console.error('[gene/boost-placement] cancel failed:', err)
            res.status(500).json({ message: 'Failed to cancel boost purchase.' })
        }
    })

    // [ADMIN or AGENT] — the take-rate instrumentation the playbook calls
    // the single highest-leverage number in the whole revenue model.
    app.get('/api/gene/boost/take-rate', adminMiddleware, async (_req: Request, res: Response) => {
        try {
            await sweepExpiredBoosts()
            const allProperties = await storage.getAllProperties()
            const allPropertyIds = allProperties.map((p) => p.id)
            const referredPropertyIds = getLiveReferredPropertyIds()

            // "Converted" = a purchase that was actually confirmed/paid at
            // some point (active or expired) — pending/cancelled never converted.
            const everBoostedPropertyIds = new Set(
                readPurchases().filter((r) => r.status === 'active' || r.status === 'expired').map((r) => r.propertyId)
            )

            const referredBoosted = referredPropertyIds.filter((id) => everBoostedPropertyIds.has(id))
            const allBoosted = allPropertyIds.filter((id) => everBoostedPropertyIds.has(id))

            const referredTakeRatePct =
                referredPropertyIds.length > 0 ? Math.round((referredBoosted.length / referredPropertyIds.length) * 1000) / 10 : null
            const allTakeRatePct = allPropertyIds.length > 0 ? Math.round((allBoosted.length / allPropertyIds.length) * 1000) / 10 : null

            const sampleWarning =
                referredPropertyIds.length < MIN_SAMPLE_FOR_CONFIDENT_TAKE_RATE
                    ? `Only ${referredPropertyIds.length} agent-referred listing(s) exist so far — below the ${MIN_SAMPLE_FOR_CONFIDENT_TAKE_RATE} needed for this rate to be statistically meaningful. Treat it as a directional signal, not a decision-grade number yet.`
                    : null

            res.json({
                referred: {
                    listingsCount: referredPropertyIds.length,
                    boostedCount: referredBoosted.length,
                    takeRatePct: referredTakeRatePct,
                },
                allListings: {
                    listingsCount: allPropertyIds.length,
                    boostedCount: allBoosted.length,
                    takeRatePct: allTakeRatePct,
                },
                breakevenTakeRatePctForReferredCohort: REFERRED_TAKE_RATE_BREAKEVEN_PCT,
                referredCohortAboveBreakeven:
                    referredTakeRatePct === null ? null : referredTakeRatePct >= REFERRED_TAKE_RATE_BREAKEVEN_PCT,
                sampleWarning,
                note: 'Source: monetization playbook (2026-08-29) Section 4 — the referral program is self-funding off Boost revenue once the referred-listing take-rate clears the breakeven line above.',
            })
        } catch (err) {
            console.error('[gene/boost-placement] take-rate failed:', err)
            res.status(500).json({ message: 'Failed to compute boost take-rate.' })
        }
    })
}
