import { MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { embedUrl, useGoogleMapsKey, type MapTarget } from '@/lib/googleMaps'

/**
 * One place on Google Maps, in a frame. Exact pin when the listing has one, otherwise Google finds the place from
 * the written location. Zoom, satellite and Street View are Google's own.
 */
export default function GoogleMapFrame({ target, title, className, zoom = 16 }: { target: MapTarget; title: string; className?: string; zoom?: number }) {
    const { data: key, isLoading } = useGoogleMapsKey()
    // Wait for the key answer so the frame is not built twice (keyless, then keyed).
    const src = isLoading ? null : embedUrl(target, key ?? null, zoom)
    if (!isLoading && !src) {
        return (
            <div className={cn('grid place-items-center bg-muted p-6 text-center text-sm text-muted-foreground', className)}>
                <span className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" aria-hidden="true" /> This listing has no location yet.
                </span>
            </div>
        )
    }
    return src ? (
        <iframe
            title={title}
            src={src}
            className={cn('block h-full w-full border-0 bg-muted', className)}
            loading="lazy"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
        />
    ) : (
        <div className={cn('bg-muted', className)} />
    )
}
