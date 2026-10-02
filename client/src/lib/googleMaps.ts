import { useQuery } from '@tanstack/react-query'

/**
 * Google Maps for the whole site.
 *
 * - Showing one place (the property page, the tour window's pin): Google's own map in a frame. With a key set
 *   (GOOGLE_MAPS_API_KEY on the server) it is the official Maps Embed API; with none, Google's keyless embed, so it
 *   works today. Either way it is Google's map with Google's place names, photos, satellite and Street View.
 * - Interactive maps (the area filter, the admin pin picker): the Maps JavaScript API, which needs the key. Without
 *   one those two keep the basic map so nothing breaks.
 */

export interface MapTarget {
    latitude?: number | null
    longitude?: number | null
    /** Used when there is no exact pin: Google finds the place from the written location. */
    query?: string | null
}

export const hasPin = (t: MapTarget): t is MapTarget & { latitude: number; longitude: number } =>
    typeof t.latitude === 'number' && typeof t.longitude === 'number' && Number.isFinite(t.latitude) && Number.isFinite(t.longitude)

/** The text Google searches for: the exact pin if there is one, otherwise the written location. */
export function mapQuery(t: MapTarget): string | null {
    if (hasPin(t)) return `${t.latitude},${t.longitude}`
    const q = (t.query ?? '').trim()
    return q ? q : null
}

export function embedUrl(t: MapTarget, key: string | null, zoom = 16): string | null {
    const q = mapQuery(t)
    if (!q) return null
    if (key) return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&zoom=${zoom}`
    return `https://www.google.com/maps?q=${encodeURIComponent(q)}&z=${zoom}&output=embed&hl=en`
}

/** Opens Google Maps (the app on a phone). */
export function openUrl(t: MapTarget): string | null {
    const q = mapQuery(t)
    return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null
}

export function directionsUrl(t: MapTarget): string | null {
    const q = mapQuery(t)
    return q ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}` : null
}

/** The browser key from the server, or null when none is set. Fetched once. */
export function useGoogleMapsKey() {
    return useQuery<string | null>({
        queryKey: ['/api/config/google-maps-key'],
        staleTime: Infinity,
        gcTime: Infinity,
        retry: 1,
        queryFn: async () => {
            try {
                const res = await fetch('/api/config/google-maps-key')
                if (!res.ok) return null
                const body = await res.json()
                return typeof body?.key === 'string' && body.key ? body.key : null
            } catch {
                return null
            }
        },
    })
}

let loader: Promise<any> | null = null
let authFailed = false
const authListeners = new Set<() => void>()

/**
 * Google reports a refused key (wrong, restricted to another address, billing off) AFTER the script has loaded, by
 * calling a global. Maps subscribe here so they can swap to the basic map when that happens.
 */
export function onGoogleMapsAuthFailure(cb: () => void): () => void {
    if (authFailed) {
        cb()
        return () => {}
    }
    authListeners.add(cb)
    return () => authListeners.delete(cb)
}

/** Loads the Maps JavaScript API once. Rejects (and stays rejected) if the key is refused or the script is blocked. */
export function loadGoogleMaps(key: string): Promise<any> {
    const w = window as any
    if (authFailed) return Promise.reject(new Error('Google Maps refused the key'))
    if (w.google?.maps?.Map) return Promise.resolve(w.google)
    if (loader) return loader
    loader = new Promise((resolve, reject) => {
        w.gm_authFailure = () => {
            authFailed = true
            authListeners.forEach((f) => f())
            authListeners.clear()
            reject(new Error('Google Maps refused the key'))
        }
        const cb = `__gmReady${Date.now()}`
        w[cb] = () => (w.google?.maps ? resolve(w.google) : reject(new Error('Google Maps did not load')))
        const s = document.createElement('script')
        s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=${cb}&loading=async&v=weekly`
        s.async = true
        s.onerror = () => reject(new Error('Google Maps could not be reached'))
        document.head.appendChild(s)
    })
    return loader
}
