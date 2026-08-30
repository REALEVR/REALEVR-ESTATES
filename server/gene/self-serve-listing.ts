/**
 * GENE Platform — self-serve paid listing intake.
 *
 * The "list it yourself" flow: a landlord/manager who has never touched
 * this platform fills in their property, uploads one cover photo, pays a
 * flat 1,000 UGX listing fee via mobile money (reusing the same IoTec
 * collections API already live in server/routes.ts for tour-viewing fees —
 * same env vars, same provider, called server-side here since this
 * payment is *server*-initiated rather than driven by a logged-in user's
 * browser), and verifies the phone number they gave us with a WhatsApp
 * OTP. On success we:
 *
 *   1. Auto-create (or reuse) an 'agent'-role account for that phone number
 *      — no password is ever set by the landlord; see ./magic-login.ts for
 *      how they actually get in.
 *   2. Auto-create the property, owned by that account.
 *   3. Link the phone number for WhatsApp (server/gene/whatsapp-concierge.ts)
 *      the same way an existing user linking from their profile would.
 *   4. Text them a one-tap link straight into their new Agent Dashboard,
 *      where the EXISTING guided tour-capture flow
 *      (server/room-capture.ts, already reachable by any 'agent'-role
 *      account) is how they actually add photos/a 360 tour afterwards —
 *      this module deliberately does not reimplement tour upload, only the
 *      "get a verified, paid, live listing + working account" part.
 *
 * ACCOUNT ACCESS NOTE: a self-serve account is tagged `membershipPlan:
 * 'self-serve'` (not an active paid *subscription* — that's a separate,
 * honest distinction) so it can be told apart from a real recurring-billing
 * agent membership. server/routes.ts's `subscriptionMiddleware` has one
 * small, additive, backward-compatible line letting this tag through
 * without requiring `subscriptionStatus === 'active'` — see the comment
 * there. Nothing about an existing subscriber's behavior changes.
 *
 * UGANDA-SPECIFIC PHONE HANDLING: this product is Uganda-only today (UGX
 * everywhere, IoTec is a Uganda mobile-money aggregator, the existing
 * payment UI hardcodes MTN/Airtel prefixes) — see `ugandaDigitsCore()`
 * below for the one assumption this module adds: a 9-digit national number
 * under either a leading '0' (local) or '256' (international) prefix.
 *
 * HONESTY NOTE: if IOTEC_CLIENT_ID/SECRET/WALLET_ID aren't configured, the
 * `/pay` step 501s with a clear message rather than pretending to charge
 * anyone. If WhatsApp isn't configured, the OTP and the final dashboard
 * link are returned directly in the API response (clearly flagged
 * `whatsappConfigured: false`) instead of silently vanishing — same
 * graceful-degrade policy as the rest of GENE.
 *
 * Persistence: shared JSON-file collection store (see ./store.ts).
 */
import type { Express, Request, Response } from 'express'
import fetch from 'node-fetch'
import { nanoid } from 'nanoid'
import { readCollection, writeCollection, nextId, nowIso } from './store'
import { storage } from '../storage'
import { hashPassword } from '../auth'
import { sendWhatsAppMessage } from './whatsapp'
import { normalizePhone, findLinkByPhone, linkPhoneToUser } from './whatsapp-concierge'
import { issueMagicLoginLink } from './magic-login'
import { randomBytes } from 'crypto'

const COLLECTION = 'gene_selfserve_submissions'
const FEE_AMOUNT_UGX = 1000
const OTP_LIFETIME_MS = 10 * 60 * 1000 // 10 minutes
const OTP_RESEND_COOLDOWN_MS = 45 * 1000
const MAX_OTP_ATTEMPTS = 5
const MAX_PHOTOS = 1 // cover photo only — the real tour comes later via the dashboard
const SELF_SERVE_CATEGORIES = new Set(['rental_units', 'furnished_houses', 'for_sale'])

type SubmissionStatus =
    | 'draft'
    | 'awaiting_payment'
    | 'payment_confirmed'
    | 'otp_sent'
    | 'live'
    | 'expired'

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
    contactName: string
    contactPhoneRaw: string // as typed, used for the IoTec `payer` field
    contactPhoneWhatsapp: string // normalized 256XXXXXXXXX, used for WhatsApp + linking
    contactEmail?: string
    coverImageUrl?: string
    feeAmount: number
    feeCurrency: 'UGX'
    paymentTransactionId?: string
    paymentConfirmedAt?: string
    otpCode?: string
    otpExpiresAt?: string
    otpLastSentAt?: string
    otpAttempts: number
    createdUserId?: number
    createdPropertyId?: number
    createdAt: string
    updatedAt: string
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

/** Public, safe-to-return view of a submission — never leaks the OTP code
 * or the payment transaction id. */
function toPublicView(s: SelfServeSubmission) {
    return {
        id: s.id,
        status: s.status,
        draft: s.draft,
        coverImageUrl: s.coverImageUrl ?? null,
        feeAmount: s.feeAmount,
        feeCurrency: s.feeCurrency,
        createdPropertyId: s.createdPropertyId ?? null,
    }
}

// ---------------------------------------------------------------------------
// Uganda phone handling — see file-top note.
// ---------------------------------------------------------------------------

/** Returns the 9-digit national core (no leading 0/256), or null if the
 * input doesn't look like a Uganda MSISDN. */
function ugandaDigitsCore(raw: string): string | null {
    const digits = raw.replace(/\D/g, '')
    let core = digits
    if (core.startsWith('256')) core = core.slice(3)
    else if (core.startsWith('0')) core = core.slice(1)
    if (!/^\d{9}$/.test(core)) return null
    return core
}
function toLocalUgandaFormat(raw: string): string | null {
    const core = ugandaDigitsCore(raw)
    return core ? `0${core}` : null
}
function toWhatsappFormat(raw: string): string | null {
    const core = ugandaDigitsCore(raw)
    return core ? `256${core}` : null
}

// ---------------------------------------------------------------------------
// IoTec mobile-money collection — mirrors the exact contract already proven
// live by client/src/components/payment/io-tech/layoutGate.tsx and
// server/routes.ts's /api/payment/iotec/* endpoints (same env vars, same
// upstream URLs, same request/response shapes), called server-side here.
// ---------------------------------------------------------------------------

async function getIotecAccessToken(): Promise<string | null> {
    const clientId = process.env.IOTEC_CLIENT_ID
    const clientSecret = process.env.IOTEC_CLIENT_SECRET
    if (!clientId || !clientSecret) return null

    const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' })
    const res = await fetch('https://id.iotec.io/connect/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    })
    if (!res.ok) return null
    const data = (await res.json()) as any
    return data?.access_token ?? null
}

async function collectIotecPayment(
    accessToken: string,
    payerLocalPhone: string,
    amount: number,
    payerNote: string
): Promise<{ transactionId: string } | { error: string }> {
    const walletId = process.env.IOTEC_WALLET_ID
    if (!walletId) return { error: 'IOTEC_WALLET_ID not configured' }

    const res = await fetch('https://pay.iotec.io/api/collections/collect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            category: 'MobileMoney',
            currency: 'UGX',
            walletId,
            transactionChargesCategory: 'ChargeWallet',
            channel: null,
            externalId: `selfserve-${Date.now()}`,
            payer: payerLocalPhone,
            payerNote,
            amount,
        }),
    })
    const data = (await res.json()) as any
    if (!res.ok || !data?.id) return { error: data?.message || data?.error || 'Collection request failed' }
    return { transactionId: data.id }
}

async function checkIotecStatus(accessToken: string, transactionId: string): Promise<string | null> {
    const res = await fetch(`https://pay.iotec.io/api/collections/status/${transactionId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    })
    if (!res.ok) return null
    const data = (await res.json()) as any
    return data?.status ?? null
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
        return { error: 'Category must be one of: rental_units, furnished_houses, for_sale. (Bank auction listings go through our team, not self-serve.)' }
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
    // Step 1 — start a submission with the property details + contact info.
    app.post('/api/gene/self-serve/start', (req: Request, res: Response) => {
        try {
            const validated = validateDraft(req.body)
            if ('error' in validated) return res.status(400).json({ message: validated.error })

            const contactName = String(req.body?.contactName ?? '').trim()
            const contactPhoneRaw = String(req.body?.contactPhone ?? '').trim()
            const contactEmail = typeof req.body?.contactEmail === 'string' ? req.body.contactEmail.trim() : undefined

            if (!contactName) return res.status(400).json({ message: 'Your name is required.' })
            const whatsappPhone = toWhatsappFormat(contactPhoneRaw)
            const localPhone = toLocalUgandaFormat(contactPhoneRaw)
            if (!whatsappPhone || !localPhone) {
                return res.status(400).json({ message: 'Enter a valid Uganda phone number, e.g. 0770000000 or 256770000000 — this is where we send your verification code.' })
            }

            const rows = readSubmissions()
            const submission: SelfServeSubmission = {
                id: nextId(rows),
                token: nanoid(24),
                status: 'draft',
                draft: validated.draft,
                contactName,
                contactPhoneRaw: localPhone,
                contactPhoneWhatsapp: whatsappPhone,
                contactEmail: contactEmail || undefined,
                feeAmount: FEE_AMOUNT_UGX,
                feeCurrency: 'UGX',
                otpAttempts: 0,
                createdAt: nowIso(),
                updatedAt: nowIso(),
            }
            saveSubmission(submission)
            res.status(201).json({ submissionId: submission.id, token: submission.token, feeAmount: FEE_AMOUNT_UGX, feeCurrency: 'UGX' })
        } catch (err) {
            console.error('[gene/self-serve] start failed:', err)
            res.status(500).json({ message: 'Could not start your listing. Please try again.' })
        }
    })

    // Step 2 — cover photo. Reuses the exact same multer+S3 upload chain the
    // existing (auth-gated) /api/upload/property-image route uses, imported
    // directly rather than duplicated — this route supplies its own gate
    // (a valid submission token) instead of a login, since the landlord
    // doesn't have an account yet at this point in the flow.
    app.post('/api/gene/self-serve/:id/cover-photo', async (req: Request, res: Response) => {
        const id = Number(req.params.id)
        const token = String(req.query.token ?? req.body?.token ?? '')
        const submission = findByIdAndToken(id, token)
        if (!submission) return res.status(404).json({ message: 'Listing draft not found.' })
        if (submission.status !== 'draft') return res.status(409).json({ message: 'This listing has already moved past the photo step.' })

        // Lazy import to avoid pulling multer/S3 wiring into every module
        // that imports this file — only needed on this one route.
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

    // Step 3 — kick off the 1,000 UGX mobile-money collection.
    app.post('/api/gene/self-serve/:id/pay', async (req: Request, res: Response) => {
        const id = Number(req.params.id)
        const token = String(req.body?.token ?? '')
        const submission = findByIdAndToken(id, token)
        if (!submission) return res.status(404).json({ message: 'Listing draft not found.' })
        if (submission.status !== 'draft') return res.status(409).json({ message: `This listing is already ${submission.status.replace('_', ' ')}.` })
        if (!submission.coverImageUrl) return res.status(400).json({ message: 'Add a cover photo before paying.' })

        try {
            const accessToken = await getIotecAccessToken()
            if (!accessToken) {
                return res.status(501).json({
                    configured: false,
                    message: 'Mobile money payments are not configured yet. Please contact support to list your property manually in the meantime.',
                })
            }

            const result = await collectIotecPayment(
                accessToken,
                submission.contactPhoneRaw,
                submission.feeAmount,
                `RealEVR listing fee — ${submission.draft.title}`.slice(0, 100)
            )
            if ('error' in result) return res.status(502).json({ message: `Payment request failed: ${result.error}` })

            submission.paymentTransactionId = result.transactionId
            submission.status = 'awaiting_payment'
            saveSubmission(submission)
            res.json({ status: 'awaiting_payment', message: 'Approve the mobile money prompt sent to your phone, then check status.' })
        } catch (err) {
            console.error('[gene/self-serve] pay failed:', err)
            res.status(500).json({ message: 'Could not start the payment. Please try again.' })
        }
    })

    // Step 4 — poll payment status; on success, sends (or re-sends) the OTP.
    app.get('/api/gene/self-serve/:id/status', async (req: Request, res: Response) => {
        const id = Number(req.params.id)
        const token = String(req.query.token ?? '')
        const submission = findByIdAndToken(id, token)
        if (!submission) return res.status(404).json({ message: 'Listing draft not found.' })

        try {
            if (submission.status === 'awaiting_payment' && submission.paymentTransactionId) {
                const accessToken = await getIotecAccessToken()
                const iotecStatus = accessToken ? await checkIotecStatus(accessToken, submission.paymentTransactionId) : null

                if (iotecStatus === 'Success') {
                    submission.status = 'payment_confirmed'
                    submission.paymentConfirmedAt = nowIso()
                    saveSubmission(submission)
                    await sendOtp(submission)
                } else if (iotecStatus && ['Failed', 'RolledBack', 'Cancelled', 'Rejected'].includes(iotecStatus)) {
                    submission.status = 'draft' // let them retry payment without re-entering everything
                    submission.paymentTransactionId = undefined
                    saveSubmission(submission)
                    return res.json({ ...toPublicView(submission), paymentFailed: true, paymentDetail: iotecStatus })
                }
                // Pending/SentToVendor/AwaitingApproval/Scheduled — keep polling, no state change.
            }

            const whatsappConfigured = Boolean(process.env.WHATSAPP_BUSINESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID)
            const payload: any = { ...toPublicView(submission), whatsappConfigured }
            // Dev-mode fallback only: if WhatsApp isn't configured we can't
            // actually deliver the OTP, so surface it in the response —
            // clearly labeled, never silently pretended to have been sent.
            if (!whatsappConfigured && submission.status === 'otp_sent' && submission.otpCode) {
                payload.devOtpCode = submission.otpCode
            }
            res.json(payload)
        } catch (err) {
            console.error('[gene/self-serve] status check failed:', err)
            res.status(500).json({ message: 'Could not check status. Please try again.' })
        }
    })

    // Resend OTP (cooldown-limited).
    app.post('/api/gene/self-serve/:id/resend-otp', async (req: Request, res: Response) => {
        const id = Number(req.params.id)
        const token = String(req.body?.token ?? '')
        const submission = findByIdAndToken(id, token)
        if (!submission) return res.status(404).json({ message: 'Listing draft not found.' })
        if (submission.status !== 'otp_sent' && submission.status !== 'payment_confirmed') {
            return res.status(409).json({ message: 'No verification code to resend at this stage.' })
        }
        if (submission.otpLastSentAt && Date.now() - new Date(submission.otpLastSentAt).getTime() < OTP_RESEND_COOLDOWN_MS) {
            return res.status(429).json({ message: 'Please wait a moment before requesting another code.' })
        }
        await sendOtp(submission)
        const whatsappConfigured = Boolean(process.env.WHATSAPP_BUSINESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID)
        res.json({ sent: true, whatsappConfigured, devOtpCode: whatsappConfigured ? undefined : submission.otpCode })
    })

    // Step 5 — verify the code, create the account + property, log them in.
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
            const { userId, isNewAccount } = await getOrCreateSelfServeUser(submission)

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
                ownerContactInfo: submission.contactPhoneWhatsapp,
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

            const { url } = issueMagicLoginLink(userId)
            const introLine = isNewAccount
                ? `🎉 "${property.title}" is live on RealEVR Estates! We set up a landlord dashboard for you.`
                : `🎉 "${property.title}" has been added to your RealEVR dashboard.`
            const message = [
                introLine,
                `Open it here to add photos or a virtual tour, see interested tenants, and manage availability: ${url}`,
                `You can also just text "dashboard" here anytime for a fresh link, or "available ${property.id}" / "unavailable ${property.id}" to toggle this listing.`,
            ].join('\n\n')

            const sendResult = await sendWhatsAppMessage(submission.contactPhoneWhatsapp, message)

            res.json({
                status: 'live',
                propertyId: property.id,
                whatsappConfigured: sendResult.sent,
                // Only handed back in the API response when we couldn't actually
                // deliver it over WhatsApp — never omitted silently.
                dashboardUrl: sendResult.sent ? undefined : url,
            })
        } catch (err) {
            console.error('[gene/self-serve] verify-otp / provisioning failed:', err)
            res.status(500).json({ message: 'Verification succeeded but we hit an error setting up your listing. Please contact support with your phone number.' })
        }
    })

    // Rehydrate a submission's public state (e.g. after a page refresh).
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
        submission.contactPhoneWhatsapp,
        `Your RealEVR Estates verification code is ${code}. It expires in 10 minutes. Enter it on the listing page to confirm your number and publish "${submission.draft.title}".`
    )
}

/** Finds an existing account already linked to this phone (a returning
 * landlord just gets a new property added to their existing account), or
 * creates a fresh one. Never creates a duplicate for the same number. */
async function getOrCreateSelfServeUser(submission: SelfServeSubmission): Promise<{ userId: number; isNewAccount: boolean }> {
    const normalized = normalizePhone(submission.contactPhoneWhatsapp)
    const existingLink = findLinkByPhone(normalized)
    if (existingLink) {
        return { userId: existingLink.userId, isNewAccount: false }
    }

    const randomPassword = randomBytes(24).toString('hex')
    const hashedPassword = await hashPassword(randomPassword)
    const usernameSuffix = normalized.slice(-6)
    const username = `landlord_${usernameSuffix}_${nanoid(4)}`
    const email = submission.contactEmail || `${username}@selfserve.realevrestates.local`

    const user = await storage.createUser({
        username,
        password: hashedPassword,
        email,
        fullName: submission.contactName,
        membershipPlan: 'self-serve', // NOT the recurring paid plan — see file-top note + subscriptionMiddleware
        role: 'agent',
        isVerified: true, // phone-verified via WhatsApp OTP, in lieu of email verification
        membershipStartDate: null,
        membershipEndDate: null,
        phoneNumber: submission.contactPhoneWhatsapp,
        companyName: undefined,
        licenseNumber: undefined,
        subscriptionPaymentId: undefined,
        subscriptionStatus: 'inactive', // truthful — they did not subscribe; self-serve tag is what grants access
    } as any)

    linkPhoneToUser(user.id, user.username, normalized)

    return { userId: user.id, isNewAccount: true }
}
