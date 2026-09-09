/**
 * Read-only booking calendar for a BnB — shows every date that's already
 * booked platform-wide for this property. Two audiences share this exact
 * component:
 *   - a prospective booker, so they can see availability before opening
 *     the booking flow (see also BookingCalendarModal.tsx, which disables
 *     these same dates in its own check-in picker);
 *   - the landlord/manager, who can open the property page from their own
 *     link to check occupied days for maintenance scheduling — they don't
 *     need a platform account for this (see useBnbAvailability.ts's doc
 *     comment on why the underlying route is public).
 */
import { Calendar } from '@/components/ui/calendar'
import { Loader2, CalendarDays } from 'lucide-react'
import { useBnbAvailability } from '@/hooks/useBnbAvailability'

export default function BnbAvailabilityCalendar({ propertyId }: { propertyId: number }) {
    const { bookedRanges, isDateBooked, isLoading } = useBnbAvailability(propertyId)

    return (
        <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Booking calendar</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
                Dates already booked on the platform are shown highlighted below — useful for checking availability
                before booking, or for the host/manager to plan maintenance around guest stays.
            </p>

            {isLoading ? (
                <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <>
                    <Calendar
                        mode="single"
                        selected={undefined}
                        onSelect={() => {}}
                        modifiers={{ booked: isDateBooked }}
                        modifiersClassNames={{ booked: 'bg-destructive/15 text-destructive line-through' }}
                        className="rounded-md border mx-auto w-fit"
                    />
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        <span className="inline-block h-3 w-3 rounded-sm bg-destructive/15" />
                        Booked
                    </div>
                    {bookedRanges.length === 0 && (
                        <p className="text-xs text-muted-foreground mt-2">No booked dates yet — fully available.</p>
                    )}
                </>
            )}
        </div>
    )
}
