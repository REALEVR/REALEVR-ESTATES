/**
 * A signed-in guest's own confirmed BnB bookings — the user-facing payoff
 * of every booking now being attached to an account (see
 * server/gene/bnb-bookings.ts and useMyBnbBookings.ts) instead of being
 * recorded anonymously.
 */
import { useQuery } from '@tanstack/react-query'
import { Link } from 'wouter'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, CalendarCheck, MapPin } from 'lucide-react'
import { useMyBnbBookings, type MyBnbBooking } from '@/hooks/useMyBnbBookings'
import type { Property } from '@shared/schema'

function formatDate(iso: string) {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    })
}

function nightsBetween(checkIn: string, checkOut: string) {
    const a = new Date(checkIn).getTime()
    const b = new Date(checkOut).getTime()
    return Math.max(1, Math.round((b - a) / (1000 * 60 * 60 * 24)))
}

function BookingRow({ booking }: { booking: MyBnbBooking }) {
    const propertyQuery = useQuery<Property>({ queryKey: [`/api/properties/${booking.propertyId}`] })
    const property = propertyQuery.data

    return (
        <Link
            href={`/property/${booking.propertyId}`}
            className="block rounded-lg border border-border p-4 hover:shadow-md transition-shadow"
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="font-medium truncate">{property?.title || `Property #${booking.propertyId}`}</p>
                    {property?.location && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <MapPin className="h-3 w-3" /> {property.location}
                        </p>
                    )}
                </div>
                <Badge variant="default" className="shrink-0">
                    Confirmed
                </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground mt-3">
                <span>
                    {formatDate(booking.checkIn)} → {formatDate(booking.checkOut)}
                </span>
                <span>{nightsBetween(booking.checkIn, booking.checkOut)} night(s)</span>
                <span>
                    {booking.guests} guest{booking.guests === 1 ? '' : 's'}
                </span>
            </div>
        </Link>
    )
}

export default function MyBookingsList() {
    const bookingsQuery = useMyBnbBookings(true)

    if (bookingsQuery.isLoading) {
        return (
            <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    const bookings = bookingsQuery.data ?? []

    if (bookings.length === 0) {
        return (
            <Card>
                <CardContent className="text-center py-12">
                    <CalendarCheck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No bookings yet</h3>
                    <p className="text-muted-foreground">
                        Once you pay a BnB's booking deposit, it'll show up here — confirmed bookings only, no pending
                        or unpaid interest.
                    </p>
                </CardContent>
            </Card>
        )
    }

    return <div className="space-y-3">{bookings.map((b) => <BookingRow key={b.id} booking={b} />)}</div>
}
