/**
 * GENE Platform — BnB booking calendar: records the date ranges a BnB has
 * actually been booked for (deposit paid, via BookingCalendarModal.tsx),
 * and exposes them so:
 *   - a prospective booker mid-booking-flow can see which dates are
 *     already taken before picking a check-in date, and
 *   - the landlord/manager can see current occupancy for maintenance
 *     scheduling purposes.
 *
 * Both of those read the same GET /api/properties/:id/booked-dates route,
 * which is deliberately public/unauthenticated: landlordPhone/landlordName
 * (see shared/schema.ts) are plain contact-info text fields, not user
 * accounts, so a landlord/manager has no login to gate this behind — the
 * property page itself (which they already have the link to) is the one
 * surface they can reach. The route only ever returns occupied date
 * ranges, never who booked them, so this stays safe to expose publicly.
 *
 * No date range here is ever double-booked against automatically — this
 * is visibility (what BookingCalendarModal.tsx disables in its date
 * picker), not a hard server-side booking lock. That's an accepted
 * limitation of this being a deposit-based interest signal rather than a
 * confirmed-inventory reservation system.
 *
 * Persistence: shared JSON-file collection store (see ./store.ts).
 */
import type { Express, Request, Response } from 'express'
import { nextId, nowIso, readCollection, writeCollection } from './store'

const COLLECTION = 'gene_bnb_bookings'

export interface BnbBooking {
    id: number
    propertyId: number
    userId: number | null
    checkIn: string // ISO date, e.g. "2026-09-20"
    checkOut: string // ISO date, exclusive - the first day NOT booked
    guests: number
    transactionId: string
    createdAt: string
}

function loadBookings(propertyId: number): BnbBooking[] {
    return readCollection<BnbBooking>(COLLECTION).filter((b) => b.propertyId === propertyId)
}

/**
 * Record a confirmed (deposit-paid) BnB booking. Called from the same
 * payment-confirmation path as storage.recordTourPayment() so a booking
 * only ever gets created alongside a real recorded payment.
 */
export function recordBnbBooking(input: {
    propertyId: number
    userId: number | null
    checkIn: string
    checkOut: string
    guests: number
    transactionId: string
}): BnbBooking {
    const rows = readCollection<BnbBooking>(COLLECTION)
    const booking: BnbBooking = {
        id: nextId(rows),
        propertyId: input.propertyId,
        userId: input.userId,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        guests: input.guests,
        transactionId: input.transactionId,
        createdAt: nowIso(),
    }
    rows.push(booking)
    writeCollection(COLLECTION, rows)
    return booking
}

export function registerBnbBookingRoutes(app: Express): void {
    // GET /api/properties/:id/booked-dates — [PUBLIC] -> occupied date
    // ranges only (no booker identity), for the calendar UI and for
    // landlord/manager maintenance visibility. See this file's doc
    // comment for why this is intentionally not behind auth.
    app.get('/api/properties/:id/booked-dates', (req: Request, res: Response) => {
        try {
            const propertyId = Number(req.params.id)
            if (!Number.isFinite(propertyId)) {
                return res.status(400).json({ message: 'Invalid property id.' })
            }
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            const ranges = loadBookings(propertyId)
                // Drop stays that have already fully ended - only future/
                // current occupancy is useful for either audience.
                .filter((b) => new Date(b.checkOut) >= today)
                .map((b) => ({ checkIn: b.checkIn, checkOut: b.checkOut }))
                .sort((a, b) => a.checkIn.localeCompare(b.checkIn))
            res.json({ propertyId, bookedRanges: ranges })
        } catch (err) {
            console.error('[gene/bnb-bookings] GET booked-dates failed:', err)
            res.status(500).json({ message: 'Failed to load booked dates.' })
        }
    })
}
