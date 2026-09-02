/**
 * GENE Platform — submit a property listing entirely from WhatsApp: a
 * linked agent texts "list property", answers a short guided sequence
 * (category, title, property type, location, price, bedrooms, bathrooms,
 * square meters, description), sends one or more photos, then texts
 * "done" — the listing goes live immediately under their own account,
 * exactly like using the Agent Dashboard's own "Add Property" form, and
 * shows up there right after (GET /api/agent/properties already scopes
 * by ownerId, no extra client work needed).
 *
 * Distinct from server/gene/self-serve-listing.ts — that flow is for
 * ANYONE, unauthenticated, with landlord-OTP verification and a referral
 * fee (built for a stranger listing someone else's property). This one is
 * for an agent who ALREADY has a RealEVR account linked to this WhatsApp
 * number (see whatsapp-concierge.ts's /api/gene/whatsapp/link) — no OTP,
 * no referral fee, same trust level as using their own dashboard.
 *
 * State machine: at most one active draft per phone number
 * (gene_whatsapp_listing_drafts collection). Every inbound message from a
 * phone with an active draft is consumed by this module before falling
 * through to the general concierge chat — see the early-return contract
 * on tryHandleListingUploadText(), called first thing in
 * whatsapp-concierge.ts's handleInboundText().
 *
 * Photos: the WhatsApp Cloud API only ever hands the webhook a short-lived
 * media ID, never a fetchable URL — downloadWhatsAppMedia() resolves that
 * to real bytes via two Graph API calls (ID -> signed URL -> bytes), then
 * uploads to the same S3 bucket every other property image already uses
 * (server/s3-util.ts), so a listing created this way is indistinguishable
 * in storage from one added through the dashboard.
 */
import { randomBytes } from 'crypto'
import { readCollection, writeCollection, nextId, nowIso } from './store'
import { storage } from '../storage'
import { sendWhatsAppMessage } from './whatsapp'
import { uploadFileToS3, getS3FileUrl } from '../s3-util'
import type { WhatsappUserLink } from './whatsapp-concierge'

const DRAFT_COLLECTION = 'gene_whatsapp_listing_drafts'

type DraftStep =
    | 'category'
    | 'title'
    | 'property_type'
    | 'location'
    | 'price'
    | 'bedrooms'
    | 'bathrooms'
    | 'square_meters'
    | 'description'
    | 'photos'

interface ListingDraft {
    id: number
    phone: string
    userId: number
    step: DraftStep
    category?: string
    title?: string
    propertyType?: string
    location?: string
    price?: number
    bedrooms?: number
    bathrooms?: number
    squareMeters?: number
    description?: string
    photoUrls: string[]
    createdAt: string
    updatedAt: string
}

const START_TRIGGERS_RE = /^(list( a)? propert(y|ies)|new listing|add propert(y|ies)|upload propert(y|ies)|sell my property)$/i
const CANCEL_RE = /^(cancel|stop listing|quit)$/i
const DONE_RE = /^(done|finish|that'?s all|submit)$/i

const CATEGORY_MENU = [
    { key: '1', value: 'rental_units', label: 'For Rent' },
    { key: '2', value: 'furnished_houses', label: 'BnB / Furnished' },
    { key: '3', value: 'for_sale', label: 'For Sale' },
    { key: '4', value: 'bank_sales', label: 'Bank Sale' },
]

const CATEGORY_PROMPT =
    "Let's list a property! What type of listing is this?\n" +
    CATEGORY_MENU.map((c) => `${c.key}. ${c.label}`).join('\n') +
    '\n\nReply with the number, or "cancel" anytime to stop.'

function loadDrafts(): ListingDraft[] {
    return readCollection<ListingDraft>(DRAFT_COLLECTION)
}

function saveDraft(draft: ListingDraft): void {
    const rows = loadDrafts()
    const idx = rows.findIndex((d) => d.id === draft.id)
    draft.updatedAt = nowIso()
    if (idx >= 0) rows[idx] = draft
    else rows.push(draft)
    writeCollection(DRAFT_COLLECTION, rows)
}

function getActiveDraft(phone: string): ListingDraft | undefined {
    return loadDrafts().find((d) => d.phone === phone)
}

function clearDraft(phone: string): void {
    writeCollection(
        DRAFT_COLLECTION,
        loadDrafts().filter((d) => d.phone !== phone)
    )
}

async function reply(phone: string, text: string): Promise<void> {
    await sendWhatsAppMessage(phone, text)
}

// --- Media download ---------------------------------------------------

async function downloadWhatsAppMedia(mediaId: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    const token = process.env.WHATSAPP_BUSINESS_TOKEN
    if (!token) return null

    try {
        const metaRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
            headers: { Authorization: `Bearer ${token}` },
        })
        if (!metaRes.ok) return null
        const meta: any = await metaRes.json()
        if (!meta?.url) return null

        const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } })
        if (!fileRes.ok) return null
        const arrayBuffer = await fileRes.arrayBuffer()
        return { buffer: Buffer.from(arrayBuffer), contentType: typeof meta.mime_type === 'string' ? meta.mime_type : 'image/jpeg' }
    } catch (err) {
        console.error('[gene/whatsapp-listing-upload] media download failed:', err)
        return null
    }
}

function extFromContentType(contentType: string): string {
    if (contentType.includes('png')) return 'png'
    if (contentType.includes('webp')) return 'webp'
    return 'jpg'
}

// --- Step machine -------------------------------------------------------

async function handleField(draft: ListingDraft, rawText: string): Promise<void> {
    const text = rawText.trim()

    switch (draft.step) {
        case 'category': {
            const match = CATEGORY_MENU.find((c) => c.key === text)
            if (!match) {
                await reply(draft.phone, `Please reply with a number 1-4.\n\n${CATEGORY_PROMPT}`)
                return
            }
            draft.category = match.value
            draft.step = 'title'
            saveDraft(draft)
            await reply(draft.phone, 'Great — what should the listing title be? (e.g. "2BR Apartment in Ntinda")')
            return
        }
        case 'title': {
            if (!text) {
                await reply(draft.phone, 'Please send a title for the listing.')
                return
            }
            draft.title = text
            draft.step = 'property_type'
            saveDraft(draft)
            await reply(draft.phone, 'What kind of property is it? (e.g. Apartment, House, Villa, Land, Commercial)')
            return
        }
        case 'property_type': {
            if (!text) {
                await reply(draft.phone, 'Please send a property type, e.g. "Apartment".')
                return
            }
            draft.propertyType = text
            draft.step = 'location'
            saveDraft(draft)
            await reply(draft.phone, 'Where is it located? (neighborhood/area, e.g. "Kisaasi, Kampala")')
            return
        }
        case 'location': {
            if (!text) {
                await reply(draft.phone, 'Please send the location.')
                return
            }
            draft.location = text
            draft.step = 'price'
            saveDraft(draft)
            await reply(draft.phone, "What's the price, in UGX? (numbers only, e.g. 800000)")
            return
        }
        case 'price': {
            const price = parseInt(text.replace(/[^0-9]/g, ''), 10)
            if (!Number.isFinite(price) || price <= 0) {
                await reply(draft.phone, 'Please send just the number, e.g. 800000.')
                return
            }
            draft.price = price
            draft.step = 'bedrooms'
            saveDraft(draft)
            await reply(draft.phone, 'How many bedrooms?')
            return
        }
        case 'bedrooms': {
            const n = parseInt(text, 10)
            if (!Number.isFinite(n) || n < 0) {
                await reply(draft.phone, 'Please send a number, e.g. 2.')
                return
            }
            draft.bedrooms = n
            draft.step = 'bathrooms'
            saveDraft(draft)
            await reply(draft.phone, 'How many bathrooms?')
            return
        }
        case 'bathrooms': {
            const n = parseInt(text, 10)
            if (!Number.isFinite(n) || n < 0) {
                await reply(draft.phone, 'Please send a number, e.g. 1.')
                return
            }
            draft.bathrooms = n
            draft.step = 'square_meters'
            saveDraft(draft)
            await reply(draft.phone, 'Roughly how big is it, in square meters?')
            return
        }
        case 'square_meters': {
            const n = parseInt(text.replace(/[^0-9]/g, ''), 10)
            if (!Number.isFinite(n) || n <= 0) {
                await reply(draft.phone, 'Please send a number, e.g. 90.')
                return
            }
            draft.squareMeters = n
            draft.step = 'description'
            saveDraft(draft)
            await reply(draft.phone, 'Add a short description of the property.')
            return
        }
        case 'description': {
            if (!text) {
                await reply(draft.phone, 'Please send a description.')
                return
            }
            draft.description = text
            draft.step = 'photos'
            saveDraft(draft)
            await reply(draft.phone, 'Almost done! Send one or more photos of the property, then reply "done" when you\'ve sent them all.')
            return
        }
        case 'photos': {
            if (DONE_RE.test(text)) {
                if (draft.photoUrls.length === 0) {
                    await reply(draft.phone, 'I don\'t have any photos yet — please send at least one photo, then reply "done".')
                    return
                }
                await finalizeDraft(draft)
                return
            }
            await reply(
                draft.phone,
                `Got ${draft.photoUrls.length} photo${draft.photoUrls.length === 1 ? '' : 's'} so far. Send more, or reply "done" when finished.`
            )
            return
        }
    }
}

async function finalizeDraft(draft: ListingDraft): Promise<void> {
    try {
        const property = await storage.createProperty({
            title: draft.title!,
            location: draft.location!,
            price: draft.price!,
            currency: 'UGX',
            description: draft.description!,
            bedrooms: draft.bedrooms!,
            bathrooms: draft.bathrooms!,
            squareMeters: draft.squareMeters!,
            imageUrl: draft.photoUrls[0] || '',
            rating: '0',
            reviewCount: 0,
            propertyType: draft.propertyType!,
            category: draft.category!,
            isFeatured: false,
            hasTour: false, // no guided tour yet - added afterwards from the dashboard
            tourUrl: null,
            tourQuality: null,
            amenities: [],
            monthlyPrice: null,
            isAvailable: true,
            ownerContactInfo: draft.phone,
            ownerId: draft.userId,
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

        clearDraft(draft.phone)
        await reply(
            draft.phone,
            `🎉 "${property.title}" is live! It's in your Agent Dashboard now — sign in at realevrestates.com to add more photos, a virtual tour, or edit details.`
        )
    } catch (err) {
        console.error('[gene/whatsapp-listing-upload] failed to create property:', err)
        await reply(
            draft.phone,
            "Something went wrong saving that listing — please try again, or use the \"Add Property\" button in your dashboard instead."
        )
    }
}

// --- Entry points, called from whatsapp-concierge.ts --------------------

/** Called first, before any other command routing, so an in-progress
 * listing draft always wins even if an answer happens to look like another
 * command (e.g. a description containing the word "dashboard"). Returns
 * true if this message was consumed here (starting, continuing, or
 * cancelling a draft) - false means "not for me," the caller should keep
 * routing to its own handlers. */
export async function tryHandleListingUploadText(
    phone: string,
    text: string,
    link: WhatsappUserLink | undefined
): Promise<boolean> {
    const existing = getActiveDraft(phone)

    if (existing) {
        if (CANCEL_RE.test(text.trim())) {
            clearDraft(phone)
            await reply(phone, 'Okay, cancelled that listing. Text "list property" anytime to start again.')
            return true
        }
        await handleField(existing, text)
        return true
    }

    if (!START_TRIGGERS_RE.test(text.trim())) return false

    if (!link) {
        await reply(
            phone,
            "To list a property from WhatsApp, this number needs to be linked to your RealEVR agent account first — sign in at realevrestates.com/agent/dashboard and link this number from your dashboard's WhatsApp card, then text me again."
        )
        return true
    }

    const draft: ListingDraft = {
        id: nextId(loadDrafts()),
        phone,
        userId: link.userId,
        step: 'category',
        photoUrls: [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
    }
    saveDraft(draft)
    await reply(phone, CATEGORY_PROMPT)
    return true
}

/** Called for inbound image messages. Only relevant while a draft is on
 * the "photos" step; anything else is a no-op (false) so the caller can
 * decide what to do with a stray photo (e.g. the general concierge just
 * ignores images today). */
export async function tryHandleListingUploadImage(phone: string, mediaId: string): Promise<boolean> {
    const draft = getActiveDraft(phone)
    if (!draft || draft.step !== 'photos') return false

    const media = await downloadWhatsAppMedia(mediaId)
    if (!media) {
        await reply(phone, "Couldn't download that photo — please try sending it again.")
        return true
    }

    const key = `properties/whatsapp-${draft.userId}-${Date.now()}-${randomBytes(4).toString('hex')}.${extFromContentType(media.contentType)}`
    await uploadFileToS3(key, media.buffer, media.contentType)
    draft.photoUrls.push(getS3FileUrl(key))
    saveDraft(draft)

    await reply(
        phone,
        `Got it (${draft.photoUrls.length} photo${draft.photoUrls.length === 1 ? '' : 's'} so far). Send more, or reply "done" when finished.`
    )
    return true
}
