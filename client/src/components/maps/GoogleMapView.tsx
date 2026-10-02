import { useEffect, useRef } from 'react'
import { loadGoogleMaps, onGoogleMapsAuthFailure } from '@/lib/googleMaps'

export interface MapMarker {
    id: string
    lat: number
    lng: number
    /** Text inside a round marker (a count). Without it the marker is Google's own red pin. */
    label?: string
    active?: boolean
    title?: string
    draggable?: boolean
    onClick?: () => void
    onDragEnd?: (lat: number, lng: number) => void
}

interface Props {
    apiKey: string
    center: { lat: number; lng: number }
    zoom: number
    markers: MapMarker[]
    onMapClick?: (lat: number, lng: number) => void
    /** Called when Google refuses the key or cannot be reached, so the caller can fall back to the basic map. */
    onError?: () => void
    className?: string
    /** When this changes the map moves to `center` (not on every render, so panning is never undone). */
    recenterKey?: string | number
}

/**
 * An interactive Google map (Maps JavaScript API). Used where people click or drag: the area filter and the pin picker.
 */
export default function GoogleMapView({ apiKey, center, zoom, markers, onMapClick, onError, className, recenterKey }: Props) {
    const host = useRef<HTMLDivElement>(null)
    const map = useRef<any>(null)
    const shown = useRef(new Map<string, any>())
    const latest = useRef({ markers, onMapClick, onError })
    latest.current = { markers, onMapClick, onError }

    const draw = () => {
        const g = (window as any).google
        if (!g?.maps || !map.current) return
        const seen = new Set<string>()
        for (const m of latest.current.markers) {
            seen.add(m.id)
            const icon = m.label
                ? { path: g.maps.SymbolPath.CIRCLE, scale: 18, fillColor: m.active ? '#FF5A5F' : '#111827', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 }
                : undefined
            const options = {
                position: { lat: m.lat, lng: m.lng },
                title: m.title,
                draggable: !!m.draggable,
                icon,
                label: m.label ? { text: m.label, color: '#ffffff', fontWeight: '600', fontSize: '13px' } : undefined,
            }
            let marker = shown.current.get(m.id)
            if (!marker) {
                marker = new g.maps.Marker({ ...options, map: map.current })
                shown.current.set(m.id, marker)
            } else {
                marker.setOptions(options)
            }
            g.maps.event.clearListeners(marker, 'click')
            g.maps.event.clearListeners(marker, 'dragend')
            if (m.onClick) marker.addListener('click', m.onClick)
            if (m.onDragEnd) {
                const cb = m.onDragEnd
                marker.addListener('dragend', (e: any) => cb(e.latLng.lat(), e.latLng.lng()))
            }
        }
        for (const [id, marker] of Array.from(shown.current)) {
            if (!seen.has(id)) {
                marker.setMap(null)
                shown.current.delete(id)
            }
        }
    }

    useEffect(() => {
        let dead = false
        const stopWatching = onGoogleMapsAuthFailure(() => !dead && latest.current.onError?.())
        loadGoogleMaps(apiKey)
            .then((g) => {
                if (dead || !host.current) return
                map.current = new g.maps.Map(host.current, {
                    center,
                    zoom,
                    mapTypeControl: true,
                    streetViewControl: true,
                    fullscreenControl: false,
                    gestureHandling: 'cooperative',
                })
                map.current.addListener('click', (e: any) => latest.current.onMapClick?.(e.latLng.lat(), e.latLng.lng()))
                draw()
            })
            .catch(() => !dead && latest.current.onError?.())
        return () => {
            dead = true
            stopWatching()
            Array.from(shown.current.values()).forEach((marker) => marker.setMap(null))
            shown.current.clear()
            map.current = null
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiKey])

    useEffect(draw)

    useEffect(() => {
        if (map.current) {
            map.current.panTo(center)
            if (recenterKey !== undefined) map.current.setZoom(Math.max(map.current.getZoom() ?? zoom, zoom))
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recenterKey])

    return <div ref={host} className={className} style={{ height: '100%', width: '100%' }} />
}
