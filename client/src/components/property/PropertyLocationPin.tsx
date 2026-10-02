import { MapPin } from 'lucide-react'
import GoogleMapFrame from '@/components/maps/GoogleMapFrame'
import { directionsUrl, hasPin, openUrl } from '@/lib/googleMaps'

/**
 * Where a property is, on Google Maps. An exact pin when one was set from the upload/edit form (see
 * LocationPinPicker.tsx); otherwise Google finds the place from the written location, and the heading says
 * "Area" so nobody mistakes it for the exact building.
 */
interface PropertyLocationPinProps {
    latitude?: number | null
    longitude?: number | null
    /** The written location, e.g. "Kololo, Kampala". */
    location?: string | null
    title: string
}

export default function PropertyLocationPin({ latitude, longitude, location, title }: PropertyLocationPinProps) {
    const target = { latitude, longitude, query: location }
    const exact = hasPin(target)
    const open = openUrl(target)
    const directions = directionsUrl(target)
    if (!open) return null

    return (
        <div className="mb-6">
            <h4 className="font-semibold mb-3 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-accent" />
                {exact ? 'Exact location' : 'Area'}
            </h4>
            <div className="rounded-lg overflow-hidden border border-border" style={{ height: 280 }}>
                <GoogleMapFrame target={target} title={`${title} on Google Maps`} zoom={exact ? 16 : 14} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <a href={open} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                    Open in Google Maps
                </a>
                <a href={directions!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                    Get directions
                </a>
            </div>
        </div>
    )
}
