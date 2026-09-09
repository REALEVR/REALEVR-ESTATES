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
 * PAYMENT: same real IoTec mobile-money gateway used for BnB/viewing-fee
 * payments (client/src/components/payment/PaymentModal.tsx +
 * client/src/lib/iotec-paymentpatch.ts) — BoostPurchaseCard.tsx opens it
 * right after creating a purchase here, and on a real confirmed IoTec
 * transaction calls POST /api/gene/boost/:id/confirm-payment, which
 * activates the purchase itself (buyer-only, no admin involved) and is
 * what actually flips `isFeatured` on. `paymentMethod`/`transactionId`
 * record which path activated a purchase, for the admin queue's own
 * visibility into the mix.
 *
 * A purchase still starts life as `pending_manual_confirmation` and the
 * manual path (POST /api/gene/boost/:id/confirm, via the admin/agent
 * Boost Confirmations queue) still exists as a fallback for when IoTec
 * itself is unreachable or a buyer pays some other way (bank transfer,
 * cash) — same shared `adminMiddleware` (admin OR agent) as before, since
 * this is money coming IN with no payout conflict of interest.
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
    /** How this purchase actually got confirmed — 'iotec' for the real
     * automatic mobile-money gateway path (POST .../confirm-payment),
     * 'manual' for an admin/agent clicking "Confirm payment received" in
     * the Boost Confirmations queue. Unset while still pending. */
    paymentMethod?: 'iotec' | 'manual'
    /** IoTec transaction id, only set when paymentMethod === 'iotec'. */
    transactionId?: string
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
        paymentMethod: p.paymentMethod ?? null,
    }
}

/**
 * Shared activation logic — the one thing that actually turns a pending
 * purchase into a live boost (supersede any other active boost on the
 * same property, flip `isFeatured` on, notify the buyer). Used by both
 * the admin/agent manual-confirm route and the buyer-facing automatic
 * IoTec confirm-payment route below, so the two paths can never drift.
 * Caller must have already checked the purchase exists and is
 * `pending_manual_confirmation`.
 */
async function activatePurchase(
    id: number,
    opts: { confirmedBy: string; paymentMethod: 'iotec' | 'manual'; transactionId?: string }
): Promise<BoostPurchase> {
    const rows = readPurchases()
    const idx = rows.findIndex((r) => r.id === id)
    if (idx === -1) throw new Error('Boost purchase not found.')

    // Supersede any other still-active boost on the same property rather
    // than stacking two active rows for it.
    const propertyId = rows[idx].propertyId
    for (let i = 0; i < rows.length; i++) {
        if (rows[i].propertyId === propertyId && rows[i].status === 'active' && rows[i].id !== id) {
            rows[i] = { ...rows[i], status: 'superseded' }
        }
    }

    const startsAt = nowIso()
    const expiresAt = new Date(Date.now() + rows[idx].durationDays * 24 * 60 * 60 * 1000).toISOString()
    rows[idx] = {
        ...rows[idx],
        status: 'active',
        confirmedAt: nowIso(),
        confirmedBy: opts.confirmedBy,
        startsAt,
        expiresAt,
        paymentMethod: opts.paymentMethod,
        transactionId: opts.transactionId,
    }
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

    return rows[idx]
}

/**
 * Currently-active boosts, most-paid-first — drives which properties show
 * in the public "Featured"/favourite carousel and in what order (see
 * GET /api/properties/featured in server/routes.ts). Ties (same tier/
 * amount) break by most-recently-activated first. Deduped by property —
 * activatePurchase()'s supersede logic already keeps at most one 'active'
 * row per property, but this stays defensive rather than assuming that
 * invariant always holds.
 */
export async function getActiveBoostsSortedByAmount(): Promise<
    Array<{ propertyId: number; amountUgx: number; tier: BoostTier; tierLabel: string }>
> {
    await sweepExpiredBoosts()
    const byProperty = new Map<number, BoostPurchase>()
    for (const row of readPurchases()) {
        if (row.status !== 'active') continue
        const existing = byProperty.get(row.propertyId)
        if (!existing || row.amountUgx > existing.amountUgx) {
            byProperty.set(row.propertyId, row)
        }
    }
    return Array.from(byProperty.values())
        .sort((a, b) => {
            if (b.amountUgx !== a.amountUgx) return b.amountUgx - a.amountUgx
            return new Date(b.confirmedAt ?? b.requestedAt).getTime() - new Date(a.confirmedAt ?? a.requestedAt).getTime()
        })
        .map((r) => ({ propertyId: r.propertyId, amountUgx: r.amountUgx, tier: r.tier, tierLabel: BOOST_TIERS[r.tier].label }))
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

    // [ADMIN or AGENT] — manual fallback: confirm mobile money was received
    // some other way (IoTec unreachable, bank transfer, cash). Most
    // purchases now activate automatically via /confirm-payment below.
    app.post('/api/gene/boost/:id/confirm', adminMiddleware, async (req: Request, res: Response) => {
        try {
            const id = Number(req.params.id)
            const existing = readPurchases().find((r) => r.id === id)
            if (!existing) return res.status(404).json({ message: 'Boost purchase not found.' })
            if (existing.status !== 'pending_manual_confirmation') {
                return res.status(400).json({ message: `Cannot confirm a purchase in status "${existing.status}".` })
            }

            const confirmedBy = (req.user as any)?.username ?? (req.user as any)?.email ?? 'unknown-admin'
            const activated = await activatePurchase(id, { confirmedBy, paymentMethod: 'manual' })
            res.json(toPublicView(activated))
        } catch (err) {
            console.error('[gene/boost-placement] confirm failed:', err)
            res.status(500).json({ message: 'Failed to confirm boost purchase.' })
        }
    })

    // [AUTH, buyer-only] — the real payment path: called by
    // BoostPurchaseCard.tsx right after the IoTec mobile-money gateway
    // reports a successful transaction (same gateway/flow used for BnB
    // booking deposits and viewing fees). Activates the purchase
    // immediately — no admin involved — and records the payment in the
    // main payments table too, same as similar-properties-pass.ts does,
    // so Boost revenue shows up in the admin dashboard's real revenue
    // numbers alongside every other payment type.
    app.post('/api/gene/boost/:id/confirm-payment', async (req: Request, res: Response) => {
        try {
            if (!req.isAuthenticated?.() || !req.user) {
                return res.status(401).json({ message: 'Sign in first.' })
            }
            const id = Number(req.params.id)
            const transactionId = typeof req.body?.transactionId === 'string' ? req.body.transactionId : ''
            if (!Number.isFinite(id) || !transactionId) {
                return res.status(400).json({ message: 'id and transactionId are required.' })
            }

            const existing = readPurchases().find((r) => r.id === id)
            if (!existing) return res.status(404).json({ message: 'Boost purchase not found.' })

            const user = req.user as any
            if (existing.buyerUserId !== user.id) {
                return res.status(403).json({ message: 'This boost purchase belongs to a different account.' })
            }
            if (existing.status !== 'pending_manual_confirmation') {
                return res.status(400).json({ message: `Cannot confirm a purchase in status "${existing.status}".` })
            }

            const confirmedBy = user.username ?? user.email ?? `user-${user.id}`
            const activated = await activatePurchase(id, { confirmedBy, paymentMethod: 'iotec', transactionId })

            try {
                await storage.recordTourPayment({
                    transactionId,
                    propertyId: activated.propertyId,
                    userId: user.id,
                    amount: activated.amountUgx,
                    currency: 'UGX',
                    timestamp: new Date().toISOString(),
                })
            } catch (err) {
                console.error('[gene/boost-placement] failed to record payment for revenue reporting:', err)
            }

            res.json(toPublicView(activated))
        } catch (err) {
            console.error('[gene/boost-placement] confirm-payment failed:', err)
            res.status(500).json({ message: 'Failed to confirm your boost payment.' })
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
