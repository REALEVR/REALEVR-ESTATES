/**
 * GENE Platform — listing lifecycle state machine + offer/inquiry pipeline.
 *
 * States: draft -> active -> under_offer -> closed, plus active -> withdrawn
 * and under_offer -> active (offer fell through). Every real property id is
 * validated against `storage.getProperty()` before a transition is allowed —
 * this module does not invent properties.
 *
 * Persistence via the shared `server/gene/store.ts` JSON-file collection
 * store — see that file's docstring for the DynamoDB migration path.
 */
import type { Express, RequestHandler } from 'express'
import { storage } from '../storage'
import { nextId, nowIso, readCollection, writeCollection } from './store'

const STATES_COLLECTION = 'gene_listing_states'
const OFFERS_COLLECTION = 'gene_offers'

export type ListingState = 'draft' | 'active' | 'under_offer' | 'closed' | 'withdrawn'

/** The exact legal transition graph — encoded once, used everywhere. */
const LEGAL_TRANSITIONS: Record<ListingState, ListingState[]> = {
    draft: ['active'],
    active: ['under_offer', 'withdrawn'],
    under_offer: ['active', 'closed'],
    closed: [],
    withdrawn: [],
}

/** Pure — no I/O. Encodes exactly the legal state transitions. */
export function canTransition(from: string, to: string): boolean {
    const legalTargets = LEGAL_TRANSITIONS[from as ListingState]
    if (!legalTargets) return false
    return legalTargets.includes(to as ListingState)
}

export interface GeneListingState {
    propertyId: number
    state: ListingState
    updatedAt: string
    updatedBy: string
}

export type OfferStatus = 'new' | 'in_discussion' | 'accepted' | 'declined' | 'closed'

export interface GeneOffer {
    id: number
    propertyId: number
    inquirerName: string
    inquirerContact: string
    offerAmountMinor?: number
    currency?: string
    message: string
    status: OfferStatus
    createdAt: string
    updatedAt: string
}

function loadStates(): GeneListingState[] {
    return readCollection<GeneListingState>(STATES_COLLECTION)
}
function saveStates(rows: GeneListingState[]): void {
    writeCollection(STATES_COLLECTION, rows)
}
function loadOffers(): GeneOffer[] {
    return readCollection<GeneOffer>(OFFERS_COLLECTION)
}
function saveOffers(rows: GeneOffer[]): void {
    writeCollection(OFFERS_COLLECTION, rows)
}

export function registerListingsLifecycleRoutes(app: Express, adminMiddleware: RequestHandler): void {
    /**
     * [ADMIN] Transition a listing's lifecycle state. Validates the property
     * exists, defaults an unseen property to "draft" as its implicit current
     * state, and rejects illegal transitions with a clear 400.
     */
    app.post('/api/gene/listings/:propertyId/transition', adminMiddleware, async (req, res) => {
        try {
            const propertyId = Number(req.params.propertyId)
            if (!Number.isFinite(propertyId)) {
                return res.status(400).json({ message: 'Invalid propertyId' })
            }
            const { to } = req.body ?? {}
            if (!to || typeof to !== 'string') {
                return res.status(400).json({ message: 'to (string state) is required' })
            }

            const property = await storage.getProperty(propertyId)
            if (!property) {
                return res.status(404).json({ message: 'Property not found' })
            }

            const rows = loadStates()
            const idx = rows.findIndex((r) => r.propertyId === propertyId)
            const currentState: ListingState = idx === -1 ? 'draft' : rows[idx].state

            if (!canTransition(currentState, to)) {
                return res.status(400).json({
                    message: `Illegal transition from "${currentState}" to "${to}". Legal next states: ${
                        LEGAL_TRANSITIONS[currentState]?.join(', ') || '(none — terminal state)'
                    }`,
                })
            }

            const updatedBy = (req.user as any)?.username ?? (req.user as any)?.email ?? 'unknown-admin'
            const newRow: GeneListingState = {
                propertyId,
                state: to as ListingState,
                updatedAt: nowIso(),
                updatedBy,
            }

            if (idx === -1) {
                rows.push(newRow)
            } else {
                rows[idx] = newRow
            }
            saveStates(rows)

            res.json(newRow)
        } catch (error: any) {
            console.error('[gene/listings-lifecycle] transition error', error)
            res.status(500).json({ message: 'Failed to transition listing', error: error?.message })
        }
    })

    /** [ADMIN] Read current lifecycle state for a property (defaults to "draft" if never set). */
    app.get('/api/gene/listings/:propertyId/state', adminMiddleware, async (req, res) => {
        try {
            const propertyId = Number(req.params.propertyId)
            if (!Number.isFinite(propertyId)) {
                return res.status(400).json({ message: 'Invalid propertyId' })
            }
            const property = await storage.getProperty(propertyId)
            if (!property) {
                return res.status(404).json({ message: 'Property not found' })
            }
            const rows = loadStates()
            const row = rows.find((r) => r.propertyId === propertyId)
            res.json(row ?? { propertyId, state: 'draft', updatedAt: null, updatedBy: null })
        } catch (error: any) {
            console.error('[gene/listings-lifecycle] state error', error)
            res.status(500).json({ message: 'Failed to load listing state', error: error?.message })
        }
    })

    /** Public. Buyer submits an inquiry/offer on a property. */
    app.post('/api/gene/listings/:propertyId/offers', async (req, res) => {
        try {
            const propertyId = Number(req.params.propertyId)
            if (!Number.isFinite(propertyId)) {
                return res.status(400).json({ message: 'Invalid propertyId' })
            }
            const property = await storage.getProperty(propertyId)
            if (!property) {
                return res.status(404).json({ message: 'Property not found' })
            }

            const { inquirerName, inquirerContact, offerAmountMinor, currency, message } = req.body ?? {}
            if (!inquirerName || typeof inquirerName !== 'string') {
                return res.status(400).json({ message: 'inquirerName (string) is required' })
            }
            if (!inquirerContact || typeof inquirerContact !== 'string') {
                return res.status(400).json({ message: 'inquirerContact (string) is required' })
            }
            if (!message || typeof message !== 'string') {
                return res.status(400).json({ message: 'message (string) is required' })
            }
            if (offerAmountMinor !== undefined && (typeof offerAmountMinor !== 'number' || offerAmountMinor <= 0)) {
                return res.status(400).json({ message: 'offerAmountMinor, if provided, must be a positive number' })
            }

            const rows = loadOffers()
            const id = nextId(rows)
            const now = nowIso()
            const row: GeneOffer = {
                id,
                propertyId,
                inquirerName,
                inquirerContact,
                offerAmountMinor,
                currency: typeof currency === 'string' ? currency : undefined,
                message,
                status: 'new',
                createdAt: now,
                updatedAt: now,
            }
            rows.push(row)
            saveOffers(rows)

            res.status(201).json(row)
        } catch (error: any) {
            console.error('[gene/listings-lifecycle] create offer error', error)
            res.status(500).json({ message: 'Failed to submit offer', error: error?.message })
        }
    })

    /** [ADMIN] List offers for a property. */
    app.get('/api/gene/listings/:propertyId/offers', adminMiddleware, async (req, res) => {
        try {
            const propertyId = Number(req.params.propertyId)
            if (!Number.isFinite(propertyId)) {
                return res.status(400).json({ message: 'Invalid propertyId' })
            }
            const rows = loadOffers().filter((r) => r.propertyId === propertyId)
            res.json(rows)
        } catch (error: any) {
            console.error('[gene/listings-lifecycle] list offers error', error)
            res.status(500).json({ message: 'Failed to load offers', error: error?.message })
        }
    })

    /** [ADMIN] Update an offer's status. */
    app.patch('/api/gene/offers/:id', adminMiddleware, async (req, res) => {
        try {
            const id = Number(req.params.id)
            if (!Number.isFinite(id)) {
                return res.status(400).json({ message: 'Invalid offer id' })
            }
            const { status } = req.body ?? {}
            const validStatuses: OfferStatus[] = ['new', 'in_discussion', 'accepted', 'declined', 'closed']
            if (!status || !validStatuses.includes(status)) {
                return res.status(400).json({ message: `status must be one of: ${validStatuses.join(', ')}` })
            }

            const rows = loadOffers()
            const idx = rows.findIndex((r) => r.id === id)
            if (idx === -1) {
                return res.status(404).json({ message: 'Offer not found' })
            }

            rows[idx] = { ...rows[idx], status, updatedAt: nowIso() }
            saveOffers(rows)

            res.json(rows[idx])
        } catch (error: any) {
            console.error('[gene/listings-lifecycle] update offer error', error)
            res.status(500).json({ message: 'Failed to update offer', error: error?.message })
        }
    })
}
