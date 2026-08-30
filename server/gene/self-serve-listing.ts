/**
 * GENE Platform — agent-submitted property listings, paid as a referral fee.
 *
 * FILENAME NOTE: this module started life as a "landlord pays to list"
 * flow, hence the filename. The actual product ask (corrected mid-build) is
 * the other way round: an AGENT (anyone — doesn't need an existing account)
 * submits a property, the LANDLORD/MANAGER verifies it's real over a
 * WhatsApp OTP sent to *their* number, and RealEVR then owes the AGENT a
 * flat 1,000 UGX referral fee for the listing — pending admin approval.
 * Kept the filename (and the /api/gene/self-serve/* route prefix, and the
 * /list-your-property page path) to avoid an unnecessary cross-file rename;
 * everything inside now reflects the real flow.
 *
 * THE FLOW:
 *   1. Agent fills in the property + their own contact info (who gets paid)
 *      and the landlord/manager's contact info (who must vouch for it).
 *   2. Agent uploads one cover photo.
 *   3. We text a 6-digit OTP to the LANDLORD's WhatsApp number — not the
 *      agent's — asking them to confirm this agent has permission to list
 *      their property. This is the actual verification step; nothing here
 *      verifies the agent is who they say they are, only that a real
 *      landlord/manager vouched for this specific listing.
 *   4. On correct OTP: the property goes live immediately, owned by an
 *      auto-created (or reused) 'agent'-role account for the AGENT's phone
 *      number, and a 1,000 UGX payout request is created in
 *      `gene_listing_payout_requests`, status `pending_admin_review`.
 *   5. The two admin WhatsApp numbers (see ADMIN_WHATSAPP_NUMBERS below)
 *      are notified immediately so approval doesn't require polling a
 *      dashboard — see server/gene/admin-guard.ts for why approval itself
 *      is a strict admin-only action, not the looser admin-or-agent check
 *      most GENE routes use.
 *   6. The agent gets a WhatsApp message with a magic-login link into their
 *      new Agent Dashboard (server/gene/magic-login.ts, same as before) —
 *      that's also where the EXISTING guided tour-capture flow
 *      (server/room-capture.ts) lives, for adding photos/a 360 tour.
 *   7. The landlord gets a short confirmation text too, naming the agent,
 *      so they have a record of who they vouched for.
 *
 * HONESTY NOTE — payouts: this module never claims to move real money on
 * its own. A payout request is created `pending_admin_review` and only
 * moves forward once a strict admin approves it via
 * POST /api/gene/self-serve/payout-requests/:id/approve — and even then,
 * same policy as server/gene/referral-rewards.ts and payments-core.ts, it
 * becomes `approved_manual_payout_required` (not `paid`) because no live
 * mobile-money *disbursement* credential exists in this environment (IoTec
 * as integrated elsewhere in this codebase is a *collections* API — it
 * takes money in, it doesn't send it out). A human sends the 1,000 UGX and
 * marks it paid via .../mark-paid.
 *
 * HONESTY NOTE — verification: the WhatsApp OTP proves the person who
 * received it controls that WhatsApp number, and that they were willing to
 * type the code back in to confirm this specific listing. It does not
 * cryptographically prove they are the legal owner/manager of the
 * property — same trust model as most low-friction marketplace
 * verification. Flagged here, not hidden.
 *
 * UGANDA-SPECIFIC PHONE HANDLING: unchanged from the original draft — see
 * `ugandaDigitsCore()` below.
 *
 * Persistence: shared JSON-file collection store (see ./store.ts).
 */
import type { Express, Request, Response } from 'express'
import { nanoid } from 'nanoid'
import { readCollection, writeCollection, nextId, nowIso } from './store'
import { storage } from '../storage'
import { hashPassword } from '../auth'
import { sendWhatsAppMessage } from './whatsapp'
import { normalizePhone, findLinkByPhone, linkPhoneToUser } from './whatsapp-concierge'
import { issueMagicLoginLink } from './magic-login'
import { requireStrictAdmin } from './admin-guard'
import { randomBytes } from 'crypto'

const COLLECTION = 'gene_selfserve_submissions'
const PAYOUT_COLLECTION = 'gene_listing_payout_requests'
const PAYOUT_AMOUNT_UGX = 1000
const OTP_LIFETIME_MS = 10 * 60 * 1000 // 10 minutes
const OTP_RESEND_COOLDOWN_MS = 45 * 1000
const MAX_OTP_ATTEMPTS = 5
const SELF_SERVE_CATEGORIES = new Set(['rental_units', 'furnished_houses', 'for_sale'])

/**
 * Who gets WhatsApp-notified for approval, and who's allowed to approve
 * (that's enforced separately, by role==='admin', in requireStrictAdmin —
 * this list is only about *notification*, not authorization). Overridable
 * via ADMIN_WHATSAPP_NUMBERS (comma-separated) without a code change if the
 * platform owner's numbers ever change.
 */
const DEFAULT_ADMIN_WHATSAPP_NUMBERS = ['256771891323', '256702742333']
function getAdminWhatsappNumbers(): string[] {
    const raw = process.env.ADMIN_WHATSAPP_NUMBERS
    if (!raw) return DEFAULT_ADMIN_WHATSAPP_NUMBERS
    const parsed = raw.split(',').map((n) => normalizePhone(n.trim())).filter(Boolean)
    return parsed.length ? parsed : DEFAULT_ADMIN_WHATSAPP_NUMBERS
}

type SubmissionStatus = 'draft' | 'otp_sent' | 'live' | 'expired'

interface PropertyDraft {
    title: string
    location: string
    price: number
    description: string
    bedrooms: number
    bathrooms: number
    squareMeters: number
    propertyType: string
    category: string
    amenities?: string[]
}

interface SelfServeSubmission {
    id: number
    token: string // caller must present this on every follow-up call — not guessable, not sequential
    status: SubmissionStatus
    draft: PropertyDraft

    // The agent — submits the listing, gets paid.
    agentName: string
    agentPhoneWhatsapp: string // normalized 256XXXXXXXXX
    agentEmail?: string
    agentUserId?: number // set once we authenticated them as a logged-in session, if any

    // The landlord/manager — verifies via OTP, gets nothing paid, gets a courtesy confirmation text.
    landlordName: string
    landlordPhoneWhatsapp: string // normalized 256XXXXXXXXX — this is where the OTP goes

    coverImageUrl?: string
    payoutAmount: number
    payoutCurrency: 'UGX'
    otpCode?: string
    otpExpiresAt?: string
    otpLastSentAt?: string
    otpAttempts: number
    createdUserId?: number // the agent's account id, once created
    createdPropertyId?: number
    createdAt: string
    updatedAt: string
}

export type ListingPayoutStatus = 'pending_admin_review' | 'approved_manual_payout_required' | 'paid' | 'rejected'

export interface ListingPayoutRequest {
    id: number
    submissionId: number
    agentUserId: number
    propertyId: number
    amountUgx: number
    status: ListingPayoutStatus
    // Denormalized for a readable admin list without joining three collections:
    propertyTitle: string
    agentName: string
    agentPhone: string
    landlordName: string
    landlordPhone: string
    createdAt: string
    decidedAt?: string
    decidedBy?: string
    note?: string
}

function readSubmissions(): SelfServeSubmission[] {
    return readCollection<SelfServeSubmission>(COLLECTION)
}
function writeSubmissions(rows: SelfServeSubmission[]): void {
    writeCollection(COLLECTION, rows)
}
function findByIdAndToken(id: number, token: string): SelfServeSubmission | undefined {
    return readSubmissions().find((r) => r.id === id && r.token === token)
}
function saveSubmission(updated: SelfServeSubmission): void {
    const rows = readSubmissions()
    const idx = rows.findIndex((r) => r.id === updated.id)
    updated.updatedAt = nowIso()
    if (idx === -1) rows.push(updated)
    else rows[idx] = updated
    writeSubmissions(rows)
}

function readPayouts(): ListingPayoutRequest[] {
    return readCollection<ListingPayoutRequest>(PAYOUT_COLLECTION)
}
function writePayouts(rows: ListingPayoutRequest[]): void {
    writeCollection(PAYOUT_COLLECTION, rows)
}

/** Public, safe-to-return view of a submission — never leaks the OTP code. */
function toPublicView(s: SelfServeSubmission) {
    return {
        id: s.id,
        status: s.status,
        draft: s.draft,
        coverImageUrl: s.coverImageUrl ?? null,
        payoutAmount: s.payoutAmount,
        payoutCurrency: s.payoutCurrency,
        landlordPhoneMasked: maskPhone(s.landlordPhoneWhatsapp),
        createdPropertyId: s.createdPropertyId ?? null,
    }
}

function maskPhone(phone: string): string {
    return phone.length > 4 ? `${'•'.repeat(phone.length - 4)}${phone.slice(-4)}` : phone
}

// ---------------------------------------------------------------------------
// Uganda phone handling — unchanged from the original draft.
// ---------------------------------------------------------------------------

function ugandaDigitsCore(raw: string): string | null {
    const digits = raw.replace(/\D/g, '')
    let core = digits
    if (core.startsWith('256')) core = core.slice(3)
    else if (core.startsWith('0')) core = core.slice(1)
    if (!/^\d{9}$/.test(core)) return null
    return core
}
function toWhatsappFormat(raw: string): string | null {
    const core = ugandaDigitsCore(raw)
    return core ? `256${core}` : null
}

// ---------------------------------------------------------------------------
// Draft validation
// ---------------------------------------------------------------------------

function validateDraft(body: any): { draft: PropertyDraft } | { error: string } {
    const title = String(body?.title ?? '').trim()
    const location = String(body?.location ?? '').trim()
    const description = String(body?.description ?? '').trim()
    const propertyType = String(body?.propertyType ?? '').trim()
    const category = String(body?.category ?? '').trim()
    const price = Number(body?.price)
    const bedrooms = Number(body?.bedrooms)
    const bathrooms = Number(body?.bathrooms)
    const squareMeters = Number(body?.squareMeters)
    const amenities = Array.isArray(body?.amenities) ? body.amenities.filter((a: any) => typeof a === 'string') : undefined

    if (!title) return { error: 'Title is required.' }
    if (!location) return { error: 'Location is required.' }
    if (!description) return { error: 'A short description is required.' }
    if (!propertyType) return { error: 'Property type is required.' }
    if (!SELF_SERVE_CATEGORIES.has(category)) {
        return { error: 'Category must be one of: rental_units, furnished_houses, for_sale. (Bank auction listings go through our team.)' }
    }
    if (!Number.isFinite(price) || price <= 0) return { error: 'Price must be a positive number.' }
    if (!Number.isFinite(bedrooms) || bedrooms < 0) return { error: 'Bedrooms must be 0 or more.' }
    if (!Number.isFinite(bathrooms) || bathrooms < 0) return { error: 'Bathrooms must be 0 or more.' }
    if (!Number.isFinite(squareMeters) || squareMeters <= 0) return { error: 'Size (sq m) must be a positive number.' }

    return { draft: { title, location, description, propertyType, category, price, bedrooms, bathrooms, squareMeters, amenities } }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function registerSelfServeListingRoutes(app: Express): void {
    // Step 1 — property details + agent contact + landlord/manager contact.
    app.post('/api/gene/self-serve/start', (req: Request, res: Response) => {
        try {
            const validated = validateDraft(req.body)
            if ('error' in validated) return res.status(400).json({ message: validated.error })

            const agentName = String(req.body?.agentName ?? '').trim()
            const agentPhoneRaw = String(req.body?.agentPhone ?? '').trim()
            const agentEmail = typeof req.body?.agentEmail === 'string' ? req.body.agentEmail.trim() : undefined
            const landlordName = String(req.body?.landlordName ?? '').trim()
            const landlordPhoneRaw = String(req.body?.landlordPhone ?? '').trim()

            if (!agentName) return res.status(400).json({ message: 'Your name is required.' })
            const agentPhoneWhatsapp = toWhatsappFormat(agentPhoneRaw)
            if (!agentPhoneWhatsapp) {
                return res.status(400).json({ message: 'Enter a valid Uganda phone number for yourself, e.g. 0770000000 — this is where your payout confirmation and dashboard link go.' })
            }
            if (!landlordName) return res.status(400).json({ message: "The landlord/manager's name is required." })
            const landlordPhoneWhatsapp = toWhatsappFormat(landlordPhoneRaw)
            if (!landlordPhoneWhatsapp) {
                return res.status(400).json({ message: "Enter a valid Uganda phone number for the landlord/manager, e.g. 0770000000 — we'll text them a code to confirm this listing." })
            }

            // If the submitter is logged in, remember their account so we can
            // credit the payout to it instead of auto-creating a duplicate —
            // this is optional; an anonymous visitor can still submit.
            const agentUserId = req.isAuthenticated?.() && req.user ? (req.user as any).id : undefined

            const rows = readSubmissions()
            const submission: SelfServeSubmission = {
                id: nextId(rows),
                token: nanoid(24),
                status: 'draft',
                draft: validated.draft,
                agentName,
                agentPhoneWhatsapp,
                agentEmail: agentEmail || undefined,
                agentUserId,
                landlordName,
                landlordPhoneWhatsapp,
                payoutAmount: PAYOUT_AMOUNT_UGX,
                payoutCurrency: 'UGX',
                otpAttempts: 0,
                createdAt: nowIso(),
                updatedAt: nowIso(),
            }
            saveSubmission(submission)
            res.status(201).json({ submissionId: submission.id, token: submission.token, payoutAmount: PAYOUT_AMOUNT_UGX, payoutCurrency: 'UGX' })
        } catch (err) {
            console.error('[gene/self-serve] start failed:', err)
            res.status(500).json({ message: 'Could not start your listing. Please try again.' })
        }
    })

    // Step 2 — cover photo. Reuses the exact same multer+S3 upload chain the
    // existing (auth-gated) /api/upload/property-image route uses.
    app.post('/api/gene/self-serve/:id/cover-photo', async (req: Request, res: Response) => {
        const id = Number(req.params.id)
        const token = String(req.query.token ?? req.body?.token ?? '')
        const submission = findByIdAndToken(id, token)
        if (!submission) return res.status(404).json({ message: 'Listing draft not found.' })
        if (submission.status !== 'draft') return res.status(409).json({ message: 'This listing has already moved past the photo step.' })

        const { uploadPropertyImage } = await import('../upload')
        uploadPropertyImage(req as any, res as any, (err: any) => {
            if (err) return res.status(400).json({ message: err.message || 'Upload failed.' })
            const file = (req as any).file
            if (!file) return res.status(400).json({ message: 'No image uploaded.' })
            const imageUrl = file.s3Url || `/uploads/images/${file.filename}`
            submission.coverImageUrl = imageUrl
            saveSubmission(submission)
            res.json({ imageUrl })
        })
    })

    // Step 3 — send the verification code to the LANDLORD's WhatsApp number.
    app.post('/api/gene/self-serve/:id/send-verification', async (req: Request, res: Response) => {
        const id = Number(req.params.id)
        const token = String(req.body?.token ?? '')
        const submission = findByIdAndToken(id, token)
        if (!submission) return res.status(404).json({ message: 'Listing draft not found.' })
        if (submission.status !== 'draft') return res.status(409).json({ message: `This listing is already ${submission.status.replace('_', ' ')}.` })
        if (!submission.coverImageUrl) return res.status(400).json({ message: 'Add a cover photo before requesting verification.' })

        try {
            await sendOtp(submission)
            res.json({ status: 'otp_sent', message: `We've texted a verification code to the landlord/manager's WhatsApp (ending ${submission.landlordPhoneWhatsapp.slice(-4)}).` })
        } catch (err) {
            console.error('[gene/self-serve] send-verification failed:', err)
            res.status(500).json({ message: 'Could not send the verification code. Please try again.' })
        }
    })

    // Poll status (e.g. after a page refresh).
    app.get('/api/gene/self-serve/:id/status', (req: Request, res: Response) => {
        const id = Number(req.params.id)
        const token = String(req.query.token ?? '')
        const submission = findByIdAndToken(id, token)
        if (!submission) return res.status(404).json({ message: 'Listing draft not found.' })

        const whatsappConfigured = Boolean(process.env.WHATSAPP_BUSINESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID)
        const payload: any = { ...toPublicView(submission), whatsappConfigured }
        // Dev-mode fallback only: if WhatsApp isn't configured we can't
        // actually deliver the OTP, so surface it — clearly labeled, never
        // silently pretended to have been sent.
        if (!whatsappConfigured && submission.status === 'otp_sent' && submission.otpCode) {
            payload.devOtpCode = submission.otpCode
        }
        res.json(payload)
    })

    // Resend OTP (cooldown-limited).
    app.post('/api/gene/self-serve/:id/resend-otp', async (req: Request, res: Response) => {
        const id = Number(req.params.id)
        const token = String(req.body?.token ?? '')
        const submission = findByIdAndToken(id, token)
        if (!submission) return res.status(404).json({ message: 'Listing draft not found.' })
        if (submission.status !== 'otp_sent') {
            return res.status(409).json({ message: 'No verification code to resend at this stage.' })
        }
        if (submission.otpLastSentAt && Date.now() - new Date(submission.otpLastSentAt).getTime() < OTP_RESEND_COOLDOWN_MS) {
            return res.status(429).json({ message: 'Please wait a moment before requesting another code.' })
        }
        await sendOtp(submission)
        const whatsappConfigured = Boolean(process.env.WHATSAPP_BUSINESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID)
        res.json({ sent: true, whatsappConfigured, devOtpCode: whatsappConfigured ? undefined : submission.otpCode })
    })

    // Step 4 — verify the code, go live, create the payout request.
    app.post('/api/gene/self-serve/:id/verify-otp', async (req: Request, res: Response) => {
        const id = Number(req.params.id)
        const token = String(req.body?.token ?? '')
        const code = String(req.body?.code ?? '').trim()
        const submission = findByIdAndToken(id, token)
        if (!submission) return res.status(404).json({ message: 'Listing draft not found.' })
        if (submission.status !== 'otp_sent') return res.status(409).json({ message: 'No verification pending for this listing.' })

        if (submission.otpAttempts >= MAX_OTP_ATTEMPTS) {
            return res.status(429).json({ message: 'Too many incorrect attempts. Request a new code.' })
        }
        if (!submission.otpExpiresAt || new Date(submission.otpExpiresAt).getTime() < Date.now()) {
            return res.status(400).json({ message: 'That code has expired. Request a new one.' })
        }
        if (!code || code !== submission.otpCode) {
            submission.otpAttempts += 1
            saveSubmission(submission)
            return res.status(400).json({ message: 'Incorrect code.', attemptsRemaining: MAX_OTP_ATTEMPTS - submission.otpAttempts })
        }

        try {
            const { userId, isNewAccount } = await getOrCreateAgentUser(submission)

            const property = await storage.createProperty({
                title: submission.draft.title,
                location: submission.draft.location,
                price: submission.draft.price,
                currency: 'UGX',
                description: submission.draft.description,
                bedrooms: submission.draft.bedrooms,
                bathrooms: submission.draft.bathrooms,
                squareMeters: submission.draft.squareMeters,
                imageUrl: submission.coverImageUrl || '',
                rating: '0',
                reviewCount: 0,
                propertyType: submission.draft.propertyType,
                category: submission.draft.category,
                isFeatured: false,
                hasTour: false, // no guided tour yet — added afterwards from the dashboard
                tourUrl: null,
                tourQuality: null,
                amenities: submission.draft.amenities ?? [],
                monthlyPrice: null,
                isAvailable: true,
                // The agent is the account managing this listing day-to-day
                // (toggling availability, replying to inquiries) — the
                // landlord's contact stays in this module's own records for
                // verification/audit, not surfaced as the public contact.
                ownerContactInfo: submission.agentPhoneWhatsapp,
                ownerId: userId,
                yearOfConstruction: null,
                buildingAge: null,
                propertyCondition: null,
                auctionStart: null,
                auctionEnd: null,
                bankName: null,
                auctionDate: null,
                startingBid: null,
                currentBid: null,
                bidIncrement: null,
                auctionStatus: null,
            } as any)

            submission.status = 'live'
            submission.createdUserId = userId
            submission.createdPropertyId = property.id
            saveSubmission(submission)

            const payoutRows = readPayouts()
            const payout: ListingPayoutRequest = {
                id: nextId(payoutRows),
                submissionId: submission.id,
                agentUserId: userId,
                propertyId: property.id,
                amountUgx: submission.payoutAmount,
                status: 'pending_admin_review',
                propertyTitle: property.title,
                agentName: submission.agentName,
                agentPhone: submission.agentPhoneWhatsapp,
                landlordName: submission.landlordName,
                landlordPhone: submission.landlordPhoneWhatsapp,
                createdAt: nowIso(),
            }
            payoutRows.push(payout)
            writePayouts(payoutRows)

            const { url } = issueMagicLoginLink(userId)
            const introLine = isNewAccount
                ? `🎉 "${property.title}" is live on RealEVR Estates! We set up a landlord dashboard for you.`
                : `🎉 "${property.title}" has been added to your RealEVR dashboard.`
            const agentMessage = [
                introLine,
                `Open it here to add photos or a virtual tour, see interested tenants, and manage availability: ${url}`,
                `Your ${submission.payoutAmount} UGX listing referral fee is pending review by our team — you'll get a WhatsApp message once it's approved.`,
                `You can also just text "dashboard" here anytime for a fresh link, or "available ${property.id}" / "unavailable ${property.id}" to toggle this listing.`,
            ].join('\n\n')
            const agentSendResult = await sendWhatsAppMessage(submission.agentPhoneWhatsapp, agentMessage)

            // Courtesy confirmation to the landlord — they now have a record
            // of exactly who they vouched for.
            await sendWhatsAppMessage(
                submission.landlordPhoneWhatsapp,
                `Thanks for confirming! "${property.title}" is now live on RealEVR Estates, listed by ${submission.agentName}. If you didn't authorize this, reply here or contact us at realevrestates.com/contact.`
            )

            notifyAdminsOfPendingPayout(payout).catch((err) =>
                console.error('[gene/self-serve] admin payout notification failed:', err)
            )

            res.json({
                status: 'live',
                propertyId: property.id,
                payoutStatus: payout.status,
                whatsappConfigured: agentSendResult.sent,
                dashboardUrl: agentSendResult.sent ? undefined : url,
            })
        } catch (err) {
            console.error('[gene/self-serve] verify-otp / provisioning failed:', err)
            res.status(500).json({ message: 'Verification succeeded but we hit an error setting up your listing. Please contact support.' })
        }
    })

    // -----------------------------------------------------------------------
    // Admin payout approval — STRICT admin only (see admin-guard.ts).
    //
    // IMPORTANT — registered BEFORE the "rehydrate" GET /:id route below:
    // Express matches routes in registration order, and ':id' matches any
    // string including the literal "payout-requests". Registering these
    // specific routes first is what lets them win instead of being
    // swallowed by the ':id' wildcard (caught by this module's own smoke
    // test — see docs/GENE_PLATFORM.md's verification notes).
    // -----------------------------------------------------------------------

    // GET /api/gene/self-serve/payout-requests — [STRICT ADMIN] optional ?status=
    app.get('/api/gene/self-serve/payout-requests', requireStrictAdmin, (req: Request, res: Response) => {
        try {
            const status = typeof req.query.status === 'string' ? req.query.status : undefined
            let rows = readPayouts()
            if (status) rows = rows.filter((r) => r.status === status)
            rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            res.json(rows)
        } catch (err) {
            console.error('[gene/self-serve] GET payout-requests failed:', err)
            res.status(500).json({ message: 'Failed to load payout requests.' })
        }
    })

    // POST /api/gene/self-serve/payout-requests/:id/approve — [STRICT ADMIN]
    app.post('/api/gene/self-serve/payout-requests/:id/approve', requireStrictAdmin, (req: Request, res: Response) => {
        try {
            const rows = readPayouts()
            const idx = rows.findIndex((r) => String(r.id) === req.params.id)
            if (idx === -1) return res.status(404).json({ message: 'Payout request not found.' })
            if (rows[idx].status !== 'pending_admin_review') {
                return res.status(400).json({ message: `Cannot approve a request in status "${rows[idx].status}".` })
            }
            const decidedBy = (req.user as any)?.username ?? (req.user as any)?.email ?? 'unknown-admin'
            rows[idx] = {
                ...rows[idx],
                // Same honesty policy as referral-rewards.ts: no live
                // disbursement gateway exists, so approval means "cleared to
                // pay", not "paid" — a human still sends the money.
                status: 'approved_manual_payout_required',
                decidedAt: nowIso(),
                decidedBy,
                note: 'Approved — send via mobile money manually, then mark as paid.',
            }
            writePayouts(rows)
            notifyAgentOfDecision(rows[idx], 'approved').catch((err) =>
                console.error('[gene/self-serve] agent approval notification failed:', err)
            )
            res.json(rows[idx])
        } catch (err) {
            console.error('[gene/self-serve] approve failed:', err)
            res.status(500).json({ message: 'Failed to approve payout request.' })
        }
    })

    // POST /api/gene/self-serve/payout-requests/:id/mark-paid — [STRICT ADMIN]
    app.post('/api/gene/self-serve/payout-requests/:id/mark-paid', requireStrictAdmin, (req: Request, res: Response) => {
        try {
            const rows = readPayouts()
            const idx = rows.findIndex((r) => String(r.id) === req.params.id)
            if (idx === -1) return res.status(404).json({ message: 'Payout request not found.' })
            if (rows[idx].status !== 'approved_manual_payout_required') {
                return res.status(400).json({ message: `Cannot mark paid a request in status "${rows[idx].status}".` })
            }
            rows[idx] = { ...rows[idx], status: 'paid', decidedAt: nowIso() }
            writePayouts(rows)
            notifyAgentOfDecision(rows[idx], 'paid').catch((err) =>
                console.error('[gene/self-serve] agent paid notification failed:', err)
            )
            res.json(rows[idx])
        } catch (err) {
            console.error('[gene/self-serve] mark-paid failed:', err)
            res.status(500).json({ message: 'Failed to mark payout request as paid.' })
        }
    })

    // POST /api/gene/self-serve/payout-requests/:id/reject — [STRICT ADMIN] { reason }
    app.post('/api/gene/self-serve/payout-requests/:id/reject', requireStrictAdmin, (req: Request, res: Response) => {
        try {
            const rows = readPayouts()
            const idx = rows.findIndex((r) => String(r.id) === req.params.id)
            if (idx === -1) return res.status(404).json({ message: 'Payout request not found.' })
            if (rows[idx].status !== 'pending_admin_review') {
                return res.status(400).json({ message: `Cannot reject a request in status "${rows[idx].status}".` })
            }
            const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined
            rows[idx] = {
                ...rows[idx],
                status: 'rejected',
                decidedAt: nowIso(),
                decidedBy: (req.user as any)?.username ?? (req.user as any)?.email ?? 'unknown-admin',
                note: reason,
            }
            writePayouts(rows)
            notifyAgentOfDecision(rows[idx], 'rejected').catch((err) =>
                console.error('[gene/self-serve] agent rejection notification failed:', err)
            )
            res.json(rows[idx])
        } catch (err) {
            console.error('[gene/self-serve] reject failed:', err)
            res.status(500).json({ message: 'Failed to reject payout request.' })
        }
    })

    // Rehydrate a submission's public state (e.g. after a page refresh).
    // Registered LAST — see the note above the admin payout routes above for
    // why: this ':id' wildcard must not be given the chance to shadow them.
    app.get('/api/gene/self-serve/:id', (req: Request, res: Response) => {
        const id = Number(req.params.id)
        const token = String(req.query.token ?? '')
        const submission = findByIdAndToken(id, token)
        if (!submission) return res.status(404).json({ message: 'Listing draft not found.' })
        res.json(toPublicView(submission))
    })
}

async function sendOtp(submission: SelfServeSubmission): Promise<void> {
    const code = String(randomBytes(3).readUIntBE(0, 3) % 1000000).padStart(6, '0')
    submission.otpCode = code
    submission.otpExpiresAt = new Date(Date.now() + OTP_LIFETIME_MS).toISOString()
    submission.otpLastSentAt = nowIso()
    submission.otpAttempts = 0
    submission.status = 'otp_sent'
    saveSubmission(submission)

    await sendWhatsAppMessage(
        submission.landlordPhoneWhatsapp,
        `${submission.agentName} wants to list "${submission.draft.title}" on RealEVR Estates on your behalf. Your verification code is ${code} (expires in 10 minutes). Share it with them only if you authorize this listing.`
    )
}

/** WhatsApp-notifies the platform owner's numbers that a payout needs review.
 * Best-effort — never throws into the request path that created the payout.
 * NOTE: this is a business-initiated message. If neither admin number has
 * messaged the WhatsApp Business number within the last 24 hours, Meta may
 * reject a freeform text like this outside that session window — see
 * server/gene/whatsapp-growth.ts's docstring for the template-message
 * workaround if that becomes a problem in practice. */
async function notifyAdminsOfPendingPayout(payout: ListingPayoutRequest): Promise<void> {
    const message = [
        `💰 New listing payout pending review: ${payout.amountUgx} UGX for "${payout.propertyTitle}".`,
        `Agent: ${payout.agentName} (${payout.agentPhone})`,
        `Vouched for by: ${payout.landlordName} (${payout.landlordPhone})`,
        `Review it in the admin dashboard: Payout Approvals → request #${payout.id}.`,
    ].join('\n')
    for (const number of getAdminWhatsappNumbers()) {
        await sendWhatsAppMessage(number, message)
    }
}

/** Best-effort WhatsApp notification to the agent when their payout's status changes. */
async function notifyAgentOfDecision(payout: ListingPayoutRequest, decision: 'approved' | 'paid' | 'rejected'): Promise<void> {
    const messages: Record<typeof decision, string> = {
        approved: `✅ Your ${payout.amountUgx} UGX referral fee for "${payout.propertyTitle}" was approved and will be sent to you shortly.`,
        paid: `💸 Your ${payout.amountUgx} UGX referral fee for "${payout.propertyTitle}" has been sent. Thanks for listing with RealEVR!`,
        rejected: `Your payout request for "${payout.propertyTitle}" was not approved.${payout.note ? ` Reason: ${payout.note}` : ' Contact support for details.'}`,
    }
    await sendWhatsAppMessage(payout.agentPhone, messages[decision])
}

/** Finds an existing account already linked to the agent's phone (a
 * returning agent just gets a new property added to their existing
 * account), or creates a fresh one. Never creates a duplicate for the same
 * number. If the submitter was logged in when they started the submission,
 * that account is reused directly instead of phone-matching. */
async function getOrCreateAgentUser(submission: SelfServeSubmission): Promise<{ userId: number; isNewAccount: boolean }> {
    if (submission.agentUserId) {
        const existing = await storage.getUser(submission.agentUserId)
        if (existing) return { userId: existing.id, isNewAccount: false }
    }

    const normalized = normalizePhone(submission.agentPhoneWhatsapp)
    const existingLink = findLinkByPhone(normalized)
    if (existingLink) {
        return { userId: existingLink.userId, isNewAccount: false }
    }

    const randomPassword = randomBytes(24).toString('hex')
    const hashedPassword = await hashPassword(randomPassword)
    const usernameSuffix = normalized.slice(-6)
    const username = `agent_${usernameSuffix}_${nanoid(4)}`
    const email = submission.agentEmail || `${username}@selfserve.realevrestates.local`

    const user = await storage.createUser({
        username,
        password: hashedPassword,
        email,
        fullName: submission.agentName,
        membershipPlan: 'self-serve', // NOT the recurring paid plan — see subscriptionMiddleware note in routes.ts
        role: 'agent',
        isVerified: true, // the LANDLORD's number was OTP-verified for this listing, not the agent's — see file-top honesty note
        membershipStartDate: null,
        membershipEndDate: null,
        phoneNumber: submission.agentPhoneWhatsapp,
        companyName: undefined,
        licenseNumber: undefined,
        subscriptionPaymentId: undefined,
        subscriptionStatus: 'inactive', // truthful — they did not subscribe; self-serve tag is what grants dashboard access
    } as any)

    linkPhoneToUser(user.id, user.username, normalized)

    return { userId: user.id, isNewAccount: true }
}
