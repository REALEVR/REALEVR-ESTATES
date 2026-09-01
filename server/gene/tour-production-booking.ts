/**
 * GENE Platform — Virtual Tour Production paid add-on (monetization
 * playbook, 2026-08-29, Section 2 stream #4). A landlord/agent books a
 * professional 360 virtual-tour shoot for a listing; RealEVR charges a flat
 * production fee. This is separate from `tour-access-pass.ts` (which sells
 * BUYERS access to VIEW existing tours) — this module sells the LISTING
 * OWNER the service of PRODUCING a new tour.
 *
 * HONESTY NOTE — payment: same manual-confirmation policy as every other
 * GENE payments module (payments-core.ts, boost-placement.ts). A booking
 * starts `pending_payment_confirmation`; a human confirms the mobile money
 * was received via /confirm-payment, which moves it to `scheduled`. Actually
 * capturing/uploading the finished tour still goes through the existing
 * room-capture.ts / admin Virtual Tour Manager flow — this module only
 * tracks the booking + payment + completion status, and on `/complete` sets
 * the real `properties.hasTour` flag if a tourUrl is supplied, via the
 * existing `storage.updateProperty()` (no schema change).
 *
 * Persistence: shared JSON-file collection store (see ./store.ts), collection
 * `gene_tour_production_bookings`.
 */
import type { Express, Request, Response, RequestHandler } from 'express'
import { readCollection, writeCollection, nextId, nowIso } from './store'
import { storage } from '../storage'

const COLLECTION = 'gene_tour_production_bookings'

/** Matches the playbook's own worked example (Section 2, stream #4). */
export const TOUR_PRODUCTION_PRICE_UGX = 190000

export type TourProductionStatus = 'pending_payment_confirmation' | 'scheduled' | 'completed' | 'cancelled'

export interface TourProductionBooking {
    id: number
    propertyId: number
    propertyTitle: string
    requestedByUserId: number
    preferredDate?: string
    contactPhone: string
    notes?: string
    amountUgx: number
    status: TourProductionStatus
    createdAt: string
    confirmedAt?: string
    confirmedBy?: string
    completedAt?: string
    tourUrl?: string
}

function readBookings(): TourProductionBooking[] {
    return readCollection<TourProductionBooking>(COLLECTION)
}
function writeBookings(rows: TourProductionBooking[]): void {
    writeCollection(COLLECTION, rows)
}

export function registerTourProductionBookingRoutes(app: Express, adminMiddleware: RequestHandler): void {
    // Authenticated — any signed-in user can request a shoot for a property
    // they can show they're associated with (owner) or an admin/agent booking on their behalf.
    app.post('/api/gene/tour-production/bookings', async (req: Request, res: Response) => {
        try {
            if (!req.isAuthenticated?.() || !req.user) return res.status(401).json({ message: 'Sign in first.' })
            const propertyId = Number(req.body?.propertyId)
            if (!Number.isFinite(propertyId)) return res.status(400).json({ message: 'propertyId (number) is required.' })

            const property = await storage.getProperty(propertyId)
            if (!property) return res.status(404).json({ message: 'Property not found.' })

            const user = req.user as any
            const isOwner = property.ownerId != null && property.ownerId === user.id
            if (!isOwner && user.role !== 'admin' && user.role !== 'agent') {
                return res.status(403).json({ message: 'Only this listing\'s owner (or an admin/agent) can book a production shoot for it.' })
            }

            const contactPhone = String(req.body?.contactPhone ?? '').trim()
            if (!contactPhone) return res.status(400).json({ message: 'contactPhone is required — this is who our crew will coordinate the shoot with.' })
            const preferredDate = typeof req.body?.preferredDate === 'string' ? req.body.preferredDate : undefined
            const notes = typeof req.body?.notes === 'string' ? req.body.notes : undefined

            const rows = readBookings()
            const booking: TourProductionBooking = {
                id: nextId(rows),
                propertyId,
                propertyTitle: property.title,
                requestedByUserId: user.id,
                preferredDate,
                contactPhone,
                notes,
                amountUgx: TOUR_PRODUCTION_PRICE_UGX,
                status: 'pending_payment_confirmation',
                createdAt: nowIso(),
            }
            rows.push(booking)
            writeBookings(rows)
            res.status(201).json({
                booking,
                message: `Shoot requested for ${TOUR_PRODUCTION_PRICE_UGX.toLocaleString()} UGX. Pay via mobile money and our team will confirm and schedule your crew.`,
            })
        } catch (err) {
            console.error('[gene/tour-production-booking] create failed:', err)
            res.status(500).json({ message: 'Failed to request a tour production booking.' })
        }
    })

    // [ADMIN or AGENT] — confirm payment received, move to scheduled.
    app.post('/api/gene/tour-production/bookings/:id/confirm-payment', adminMiddleware, (req: Request, res: Response) => {
        try {
            const id = Number(req.params.id)
            const rows = readBookings()
            const idx = rows.findIndex((r) => r.id === id)
            if (idx === -1) return res.status(404).json({ message: 'Booking not found.' })
            if (rows[idx].status !== 'pending_payment_confirmation') {
                return res.status(400).json({ message: `Cannot confirm payment for a booking in status "${rows[idx].status}".` })
            }
            const confirmedBy = (req.user as any)?.username ?? (req.user as any)?.email ?? 'unknown-admin'
            rows[idx] = { ...rows[idx], status: 'scheduled', confirmedAt: nowIso(), confirmedBy }
            writeBookings(rows)
            res.json(rows[idx])
        } catch (err) {
            console.error('[gene/tour-production-booking] confirm-payment failed:', err)
            res.status(500).json({ message: 'Failed to confirm payment.' })
        }
    })

    // [ADMIN or AGENT] — mark the shoot complete; optionally attach the resulting tourUrl.
    app.post('/api/gene/tour-production/bookings/:id/complete', async (req: Request, res: Response) => {
        try {
            const id = Number(req.params.id)
            const rows = readBookings()
            const idx = rows.findIndex((r) => r.id === id)
            if (idx === -1) return res.status(404).json({ message: 'Booking not found.' })
            if (rows[idx].status !== 'scheduled') {
                return res.status(400).json({ message: `Cannot complete a booking in status "${rows[idx].status}".` })
            }
            const tourUrl = typeof req.body?.tourUrl === 'string' ? req.body.tourUrl.trim() : undefined
            rows[idx] = { ...rows[idx], status: 'completed', completedAt: nowIso(), tourUrl: tourUrl || undefined }
            writeBookings(rows)

            if (tourUrl) {
                try {
                    await storage.updateProperty(rows[idx].propertyId, { hasTour: true, tourUrl } as any)
                } catch (err) {
                    console.error(`[gene/tour-production-booking] failed to set hasTour for property ${rows[idx].propertyId}:`, err)
                }
            }
            res.json(rows[idx])
        } catch (err) {
            console.error('[gene/tour-production-booking] complete failed:', err)
            res.status(500).json({ message: 'Failed to complete booking.' })
        }
    })

    // [ADMIN or AGENT] — list, optional ?status=.
    app.get('/api/gene/tour-production/bookings', adminMiddleware, (req: Request, res: Response) => {
        try {
            const status = typeof req.query.status === 'string' ? req.query.status : undefined
            let rows = readBookings()
            if (status) rows = rows.filter((r) => r.status === status)
            rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            res.json(rows)
        } catch (err) {
            console.error('[gene/tour-production-booking] list failed:', err)
            res.status(500).json({ message: 'Failed to load bookings.' })
        }
    })
}
