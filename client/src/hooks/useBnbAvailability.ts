/**
 * Shared read-only view of a BnB's booked date ranges (see
 * server/gene/bnb-bookings.ts). Used both by BookingCalendarModal.tsx
 * (so a booker can't pick an already-taken check-in date) and by
 * BnbAvailabilityCalendar.tsx (a standalone view anyone with the property
 * link — including the landlord/manager — can open for maintenance
 * scheduling visibility).
 */
import { useQuery } from '@tanstack/react-query'

export interface BookedRange {
    checkIn: string // ISO date, inclusive
    checkOut: string // ISO date, exclusive
}

function toLocalDate(iso: string): Date {
    // Parsed as local midnight rather than UTC midnight (new Date(iso))
    // so date-only comparisons against the Calendar's local-time dates
    // don't drift a day depending on the viewer's timezone.
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, (m || 1) - 1, d || 1)
}

export function useBnbAvailability(propertyId: number, enabled = true) {
    const query = useQuery<{ propertyId: number; bookedRanges: BookedRange[] }>({
        queryKey: [`/api/properties/${propertyId}/booked-dates`],
        enabled: enabled && Number.isFinite(propertyId),
    })

    const bookedRanges = query.data?.bookedRanges ?? []

    /** Is `date` inside any booked [checkIn, checkOut) range? */
    const isDateBooked = (date: Date): boolean => {
        return bookedRanges.some((r) => {
            const start = toLocalDate(r.checkIn)
            const end = toLocalDate(r.checkOut)
            return date >= start && date < end
        })
    }

    return { bookedRanges, isDateBooked, isLoading: query.isLoading }
}
