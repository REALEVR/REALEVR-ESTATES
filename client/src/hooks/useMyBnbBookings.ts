/**
 * A signed-in guest's own confirmed BnB bookings (see
 * server/gene/bnb-bookings.ts's GET /api/gene/bnb-bookings/me) — the
 * user-facing payoff of every booking being attached to an account rather
 * than recorded anonymously.
 */
import { useQuery } from '@tanstack/react-query'

export interface MyBnbBooking {
    id: number
    propertyId: number
    userId: number
    checkIn: string
    checkOut: string
    guests: number
    transactionId: string
    status: 'confirmed'
    createdAt: string
}

export function useMyBnbBookings(enabled: boolean) {
    return useQuery<MyBnbBooking[]>({
        queryKey: ['/api/gene/bnb-bookings/me'],
        enabled,
    })
}
