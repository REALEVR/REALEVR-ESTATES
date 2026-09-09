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
 * Every booking here is attached to the guest's own account — `userId` is
 * required, not optional, and BookingCalendarModal.tsx now refuses to open
 * the payment step at all unless someone is signed in (see that file's own
 * comment). This is what makes GET /api/gene/bnb-bookings/me below
 * possible: a guest's confirmed stays are always theirs to look back on.
 *
 * `status` only ever has one value today, `'confirmed'` — a row is created
 * here exclusively from the payment-confirmation path in server/routes.ts
 * (POST /api/payment/iotect/record's BnB branch), which only runs once the
 * booking fee has actually cleared, so there's no separate "pending"
 * state to represent. The field exists so a future state (e.g.
 * 'cancelled') can be added without a schema migration, and so callers
 * never have to assume every row here is active.
 *
 * No date range here is ever double-booked against automatically — this
 * is visibility (what BookingCalendarModal.tsx disables in its date
 * picker), not a hard server-side booking lock. That's an accepted
 * limitation of this being a deposit-based interest signal rather than a
 * confirmed-inventory reservation system.
 *
 * Persistence: shared JSON-file collection store (see ./store.ts).
 */
import type { Express, Request, Response, NextFunction } from 'express'
import { nextId, nowIso, readCollection, writeCollection } from './store'

const COLLECTION = 'gene_bnb_bookings'

export type BnbBookingStatus = 'confirmed'

export interface BnbBooking {
    id: number
    propertyId: number
    // Required, not optional — see this file's doc comment on why a
    // booking is never recorded for a signed-out guest.
    userId: number
    checkIn: string // ISO date, e.g. "2026-09-20"
    checkOut: string // ISO date, exclusive - the first day NOT booked
    guests: number
    transactionId: string
    status: BnbBookingStatus
    createdAt: string
}

function loadBookingsForProperty(propertyId: number): BnbBooking[] {
    return readCollection<BnbBooking>(COLLECTION).filter((b) => b.propertyId === propertyId)
}

function requireUser(req: Request, res: Response, next: NextFunction) {
    if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: 'Sign in to see your bookings.' })
    }
    next()
}

/**
 * Record a confirmed (deposit-paid) BnB booking. Called from the same
 * payment-confirmation path as storage.recordTourPayment() so a booking
 * only ever gets created alongside a real recorded payment, and only for
 * a signed-in guest (userId is required — the caller must not invoke this
 * for an anonymous payment).
 */
export function recordBnbBooking(input: {
    propertyId: number
    userId: number
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
        status: 'confirmed',
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
            const ranges = loadBookingsForProperty(propertyId)
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

    // GET /api/gene/bnb-bookings/me — [AUTH] -> this guest's own confirmed
    // bookings, newest first — the payoff of every booking being attached
    // to an account instead of recorded anonymously.
    app.get('/api/gene/bnb-bookings/me', requireUser, (req: Request, res: Response) => {
        try {
            const userId = (req.user as any).id
            const rows = readCollection<BnbBooking>(COLLECTION)
                .filter((b) => b.userId === userId)
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            res.json(rows)
        } catch (err) {
            console.error('[gene/bnb-bookings] GET bnb-bookings/me failed:', err)
            res.status(500).json({ message: 'Failed to load your bookings.' })
        }
    })
}
