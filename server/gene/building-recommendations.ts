/**
 * Occupant recommendations: tell us about a building that is not on RealEVR
 * yet, earn points, redeem 100 points for 10,000 UGX.
 *
 * This replaces paying people to upload (see paid-uploads.ts). The rules:
 *
 *   - Only an OCCUPANT of the building may notify us of it. The person says
 *     they live there, gives their unit and a phone number the team can call,
 *     and the app records where they were (optional device location) for the
 *     reviewer. Nothing here can PROVE occupancy; that is what the review is
 *     for: the team checks the unit and phone before approving.
 *   - A building that is already listed, or already recommended by someone
 *     else, is turned away at once, so the same place cannot be farmed.
 *   - A recommendation earns nothing until a strict admin approves it.
 *     One approved recommendation = one point.
 *   - 100 points can be redeemed for 10,000 UGX (always in whole blocks of 100;
 *     nothing is paid below that). A redemption is a request: an admin approves
 *     it and a human sends the money out of band, then marks it paid. Same
 *     honesty policy as referral-rewards.ts and listing-earnings.ts: approval
 *     never means money has moved on its own.
 *
 * Persistence: shared JSON-file collection store (see ./store.ts).
 */
import type { Express, Request, Response, NextFunction } from 'express'
import { readCollection, writeCollection, nextId, nowIso } from './store'
import { storage } from '../storage'
import { createNotification } from '../models/Notification'
import { notifyAdminsEverywhere } from './admin-notify'
import { requireStrictAdmin } from './admin-guard'

const REC_COLLECTION = 'gene_building_recommendations'
const PAYOUT_COLLECTION = 'gene_recommendation_payouts'

export const POINTS_PER_BLOCK = 100
export const UGX_PER_BLOCK = 10_000
const MAX_PENDING_PER_USER = 5
const MAX_PER_DAY_PER_USER = 5

export type RecommendationStatus = 'pending_review' | 'approved' | 'rejected' | 'duplicate'
export type RecommendationCategory = 'rental_units' | 'for_sale' | 'furnished_houses'

export interface BuildingRecommendation {
    id: number
    userId: number
    userName: string
    buildingName: string
    location: string
    unit: string
    category: RecommendationCategory
    /** A phone the team can call to confirm the person lives there. */
    contactPhone: string
    landlordName?: string
    landlordPhone?: string
    notes?: string
    /** Where the device was when they sent it (optional, for the reviewer only). */
    lat?: number
    lng?: number
    key: string
    status: RecommendationStatus
    note?: string
    propertyId?: number
    createdAt: string
    decidedAt?: string
    decidedBy?: string
}

export type RecommendationPayoutStatus = 'pending_review' | 'approved_manual_payout_required' | 'paid' | 'rejected'

export interface RecommendationPayout {
    id: number
    userId: number
    points: number
    ugxAmount: number
    mobileMoneyNumber: string
    provider: string
    status: RecommendationPayoutStatus
    createdAt: string
    decidedAt?: string
    decidedBy?: string
    note?: string
}

const PHONE_RE = /^\+?[0-9]{9,15}$/
const CATEGORIES: RecommendationCategory[] = ['rental_units', 'for_sale', 'furnished_houses']
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g

const clean = (value: unknown, max: number): string =>
    typeof value === 'string' ? value.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : ''

const normalise = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

/** The same building, however it is typed: name and area with punctuation and case removed. */
export function buildingKey(buildingName: string, location: string): string {
    return `${normalise(buildingName)}|${normalise(location)}`
}

const rows = () => readCollection<BuildingRecommendation>(REC_COLLECTION)
const payouts = () => readCollection<RecommendationPayout>(PAYOUT_COLLECTION)

/** Points the user has earned (approved recommendations), spent (non-rejected redemptions) and has left. */
export function pointsFor(userId: number) {
    const earned = rows().filter((r) => r.userId === userId && r.status === 'approved').length
    const spent = payouts()
        .filter((p) => p.userId === userId && p.status !== 'rejected')
        .reduce((sum, p) => sum + p.points, 0)
    const available = Math.max(0, earned - spent)
    return {
        earned,
        available,
        pending: rows().filter((r) => r.userId === userId && r.status === 'pending_review').length,
        pointsPerBlock: POINTS_PER_BLOCK,
        ugxPerBlock: UGX_PER_BLOCK,
        redeemableBlocks: Math.floor(available / POINTS_PER_BLOCK),
        redeemableUgx: Math.floor(available / POINTS_PER_BLOCK) * UGX_PER_BLOCK,
        canRedeem: available >= POINTS_PER_BLOCK,
    }
}

function requireUser(req: Request, res: Response, next: NextFunction) {
    if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: 'Sign in to recommend a building.' })
    }
    next()
}

/** Is a building by this name already on the platform? Compared on name and area, ignoring case and punctuation. */
export async function isAlreadyListed(buildingName: string, location: string): Promise<boolean> {
    const name = normalise(buildingName)
    if (name.length < 4) return false
    const area = normalise(location)
    const all = await storage.getAllProperties()
    return all.some((p: any) => {
        const title = normalise(String(p.title ?? ''))
        const where = normalise(String(p.location ?? ''))
        // The building's name shows up in a listing's title, and the listing is in the same area (or names no area).
        return (title.includes(name) || where.includes(name)) && (!area || !where || where.includes(area) || area.includes(where) || title.includes(area))
    })
}

export type Validated = { ok: true; value: Omit<BuildingRecommendation, 'id' | 'userId' | 'userName' | 'status' | 'createdAt' | 'key'> } | { ok: false; message: string }

/** Reduce the request body to what is allowed, or say what is wrong in words fit to show. */
export function validateRecommendation(body: any): Validated {
    if (body?.occupant !== true) {
        return { ok: false, message: 'Only people who live in the building can recommend it. Please confirm that you do.' }
    }
    const buildingName = clean(body?.buildingName, 80)
    const location = clean(body?.location, 120)
    const unit = clean(body?.unit, 30)
    const contactPhone = clean(body?.contactPhone, 20).replace(/[\s()-]/g, '')
    if (buildingName.length < 3) return { ok: false, message: 'Enter the name of the building.' }
    if (location.length < 3) return { ok: false, message: 'Enter the area or address of the building.' }
    if (!unit) return { ok: false, message: 'Enter your flat or house number in the building, so we can check you live there.' }
    if (!PHONE_RE.test(contactPhone)) return { ok: false, message: 'Enter a phone number we can call to confirm you live there.' }
    const category = CATEGORIES.includes(body?.category) ? (body.category as RecommendationCategory) : 'rental_units'
    const landlordPhone = clean(body?.landlordPhone, 20).replace(/[\s()-]/g, '')
    if (landlordPhone && !PHONE_RE.test(landlordPhone)) return { ok: false, message: "The landlord or caretaker's phone number does not look right." }
    const lat = Number(body?.lat)
    const lng = Number(body?.lng)
    const hasPoint = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    return {
        ok: true,
        value: {
            buildingName,
            location,
            unit,
            category,
            contactPhone,
            ...(clean(body?.landlordName, 80) ? { landlordName: clean(body?.landlordName, 80) } : {}),
            ...(landlordPhone ? { landlordPhone } : {}),
            ...(clean(body?.notes, 400) ? { notes: clean(body?.notes, 400) } : {}),
            ...(hasPoint ? { lat, lng } : {}),
        },
    }
}

export function registerBuildingRecommendationRoutes(app: Express): void {
    // POST /api/gene/recommendations — [AUTH] an occupant tells us about their building.
    app.post('/api/gene/recommendations', requireUser, async (req, res) => {
        try {
            const user = req.user as any
            const checked = validateRecommendation(req.body)
            if (!checked.ok) return res.status(400).json({ message: checked.message })
            const v = checked.value
            const key = buildingKey(v.buildingName, v.location)
            const all = rows()

            const mine = all.filter((r) => r.userId === user.id)
            if (mine.filter((r) => r.status === 'pending_review').length >= MAX_PENDING_PER_USER) {
                return res.status(429).json({ message: 'You have several recommendations waiting for review. We will look at them first, then you can send more.' })
            }
            const dayAgo = Date.now() - 24 * 60 * 60 * 1000
            if (mine.filter((r) => new Date(r.createdAt).getTime() > dayAgo).length >= MAX_PER_DAY_PER_USER) {
                return res.status(429).json({ message: 'That is enough for today. Please come back tomorrow.' })
            }
            if (all.some((r) => r.key === key && r.status !== 'rejected')) {
                return res.status(409).json({ message: 'This building has already been recommended. Thank you, we are on it.' })
            }
            if (await isAlreadyListed(v.buildingName, v.location)) {
                return res.status(409).json({ message: 'This building is already on RealEVR Estates.' })
            }

            const rec: BuildingRecommendation = {
                id: nextId(all),
                userId: user.id,
                userName: user.fullName || user.username || 'A member',
                ...v,
                key,
                status: 'pending_review',
                createdAt: nowIso(),
            }
            all.push(rec)
            writeCollection(REC_COLLECTION, all)

            notifyAdminsEverywhere({
                title: `Building recommended: ${rec.buildingName}`,
                message: `${rec.userName} says they live at ${rec.buildingName}, ${rec.location} (unit ${rec.unit}). Call ${rec.contactPhone} to confirm, then approve.`,
                whatsappMessage: `🏢 Building recommended\n${rec.buildingName}, ${rec.location}\nBy ${rec.userName}, unit ${rec.unit}\nPhone ${rec.contactPhone}\n\nCall to confirm they live there, then approve in Admin > Recommendations.`,
                link: '/admin/recommendations',
                data: { recommendationId: rec.id },
            }).catch((err) => console.error('[gene/recommendations] admin notification failed:', err))

            res.status(201).json({ recommendation: rec, points: pointsFor(user.id) })
        } catch (err) {
            console.error('[gene/recommendations] POST failed:', err)
            res.status(500).json({ message: 'Could not send your recommendation. Please try again.' })
        }
    })

    // GET /api/gene/recommendations/me — [AUTH] my recommendations, points and redemptions.
    app.get('/api/gene/recommendations/me', requireUser, (req, res) => {
        const userId = (req.user as any).id
        res.json({
            points: pointsFor(userId),
            recommendations: rows()
                .filter((r) => r.userId === userId)
                .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
                .map(({ contactPhone: _p, landlordPhone: _l, lat: _a, lng: _o, key: _k, ...safe }) => safe),
            redemptions: payouts()
                .filter((p) => p.userId === userId)
                .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
        })
    })

    // POST /api/gene/recommendations/redeem — [AUTH] { mobileMoneyNumber, provider }: all whole blocks of 100 points.
    app.post('/api/gene/recommendations/redeem', requireUser, (req, res) => {
        try {
            const userId = (req.user as any).id
            const number = clean(req.body?.mobileMoneyNumber, 20).replace(/[\s()-]/g, '')
            const provider = clean(req.body?.provider, 30)
            if (!PHONE_RE.test(number)) return res.status(400).json({ message: 'Enter the mobile money number to pay.' })
            if (!provider) return res.status(400).json({ message: 'Enter the provider, for example MTN or Airtel.' })

            const balance = pointsFor(userId)
            if (!balance.canRedeem) {
                return res.status(400).json({
                    message: `You need ${POINTS_PER_BLOCK} points to redeem (${UGX_PER_BLOCK.toLocaleString()} UGX). You have ${balance.available}.`,
                })
            }
            const points = balance.redeemableBlocks * POINTS_PER_BLOCK
            const all = payouts()
            const request: RecommendationPayout = {
                id: nextId(all),
                userId,
                points,
                ugxAmount: balance.redeemableBlocks * UGX_PER_BLOCK,
                mobileMoneyNumber: number,
                provider,
                status: 'pending_review',
                createdAt: nowIso(),
            }
            all.push(request)
            writeCollection(PAYOUT_COLLECTION, all)

            notifyAdminsEverywhere({
                title: 'Recommendation points redeemed',
                message: `A member redeemed ${points} points for ${request.ugxAmount.toLocaleString()} UGX to ${provider} ${number}.`,
                whatsappMessage: `🎁 Points redeemed\n${points} points = ${request.ugxAmount.toLocaleString()} UGX\n${provider} ${number}\n\nNeeds your approval in Admin > Recommendations.`,
                link: '/admin/recommendations',
                data: { recommendationPayoutId: request.id, userId },
            }).catch((err) => console.error('[gene/recommendations] admin notification failed:', err))

            res.status(201).json({ request, points: pointsFor(userId) })
        } catch (err) {
            console.error('[gene/recommendations] redeem failed:', err)
            res.status(500).json({ message: 'Could not submit your redemption.' })
        }
    })

    // ---- Admin (strict: it is money and personal phone numbers) ----

    // GET /api/admin/recommendations?status= — the review queue, with the details a reviewer needs to call.
    app.get('/api/admin/recommendations', requireStrictAdmin, (req, res) => {
        const status = typeof req.query.status === 'string' ? req.query.status : undefined
        const list = rows()
            .filter((r) => !status || r.status === status)
            .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        res.json(list)
    })

    const decide = (status: Exclude<RecommendationStatus, 'pending_review'>) => async (req: Request, res: Response) => {
        try {
            const all = rows()
            const i = all.findIndex((r) => String(r.id) === req.params.id)
            if (i === -1) return res.status(404).json({ message: 'Recommendation not found.' })
            if (all[i].status !== 'pending_review') return res.status(400).json({ message: `Already ${all[i].status}.` })
            const note = clean(req.body?.note, 300) || undefined
            const propertyId = Number(req.body?.propertyId)
            all[i] = {
                ...all[i],
                status,
                note,
                ...(status === 'approved' && Number.isSafeInteger(propertyId) && propertyId > 0 ? { propertyId } : {}),
                decidedAt: nowIso(),
                decidedBy: (req.user as any)?.username ?? (req.user as any)?.email ?? 'admin',
            }
            writeCollection(REC_COLLECTION, all)
            const rec = all[i]
            const points = pointsFor(rec.userId)
            await createNotification({
                userId: String(rec.userId),
                title: status === 'approved' ? 'Your recommendation was approved' : 'About your recommendation',
                message:
                    status === 'approved'
                        ? `Thank you! ${rec.buildingName} earned you a point. You have ${points.available} of ${POINTS_PER_BLOCK} needed to redeem ${UGX_PER_BLOCK.toLocaleString()} UGX.`
                        : `We could not use ${rec.buildingName}${note ? `: ${note}` : '.'}`,
                type: 'system',
                link: '/recommend-a-place',
            }).catch((err) => console.error('[gene/recommendations] user notification failed:', err))
            res.json(rec)
        } catch (err) {
            console.error('[gene/recommendations] decide failed:', err)
            res.status(500).json({ message: 'Could not save the decision.' })
        }
    }
    app.post('/api/admin/recommendations/:id/approve', requireStrictAdmin, decide('approved'))
    app.post('/api/admin/recommendations/:id/reject', requireStrictAdmin, decide('rejected'))
    app.post('/api/admin/recommendations/:id/duplicate', requireStrictAdmin, decide('duplicate'))

    // GET /api/admin/recommendation-payouts
    app.get('/api/admin/recommendation-payouts', requireStrictAdmin, (_req, res) => {
        res.json(payouts().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)))
    })

    const moveRedemption = (from: RecommendationPayoutStatus, to: RecommendationPayoutStatus, note?: (req: Request) => string | undefined) =>
        (req: Request, res: Response) => {
            try {
                const all = payouts()
                const i = all.findIndex((p) => String(p.id) === req.params.id)
                if (i === -1) return res.status(404).json({ message: 'Redemption not found.' })
                if (all[i].status !== from) return res.status(400).json({ message: `Cannot do that to a redemption in status "${all[i].status}".` })
                all[i] = {
                    ...all[i],
                    status: to,
                    decidedAt: nowIso(),
                    decidedBy: (req.user as any)?.username ?? (req.user as any)?.email ?? 'admin',
                    note: note?.(req) ?? all[i].note,
                }
                writeCollection(PAYOUT_COLLECTION, all)
                res.json(all[i])
            } catch (err) {
                console.error('[gene/recommendations] redemption update failed:', err)
                res.status(500).json({ message: 'Could not update the redemption.' })
            }
        }
    app.post(
        '/api/admin/recommendation-payouts/:id/approve',
        requireStrictAdmin,
        moveRedemption('pending_review', 'approved_manual_payout_required', () => 'Approved. Send the money by mobile money, then mark it paid.'),
    )
    app.post('/api/admin/recommendation-payouts/:id/mark-paid', requireStrictAdmin, moveRedemption('approved_manual_payout_required', 'paid'))
    // Rejecting hands the points back (a rejected redemption no longer counts as spent).
    app.post('/api/admin/recommendation-payouts/:id/reject', requireStrictAdmin, moveRedemption('pending_review', 'rejected', (req) => clean(req.body?.reason, 300) || undefined))
}
