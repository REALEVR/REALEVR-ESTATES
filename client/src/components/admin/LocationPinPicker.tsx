import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { MapPin, Crosshair, Loader2, X } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

/**
 * Exact GPS pin for a property, set from the upload/edit form (see its use
 * in PropertyFormNew.tsx) - independent of the free-text `location` field,
 * which every property already has. Three ways in, any of which can be
 * followed by dragging the pin to fine-tune it:
 *  1. Click/tap directly on the map.
 *  2. Paste a Google Maps link (a full URL with coordinates in it, or a
 *     shortened maps.app.goo.gl one - the server resolves that redirect,
 *     since a browser can't read a cross-origin redirect's final URL
 *     itself).
 *  3. "Use my GPS location" - navigator.geolocation, for an agent standing
 *     at the property with their phone, the same device already used for
 *     the guided room-capture photos.
 * PropertyLocationDisplay.tsx renders the read-only result of whichever
 * path was used, on the property detail page.
 */

const DEFAULT_CENTER: [number, number] = [0.32, 32.58] // Kampala, Uganda - same fallback as PropertyLocationMap.tsx

function pinIcon(): L.DivIcon {
    return L.divIcon({
        className: '',
        html: `<div style="
            width:28px;height:28px;border-radius:50% 50% 50% 0;
            background:#FF5A5F;transform:rotate(-45deg);
            border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);
        "></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 28],
    })
}

// Common Google Maps URL shapes that carry coordinates directly:
//   .../@0.3163,32.5825,17z/...        (viewport center, most share links)
//   ?q=0.3163,32.5825                  (search/pin query param)
//   ?ll=0.3163,32.5825                 (older link format)
//   !3d0.3163!4d32.5825                (embedded place data in a long URL)
function parseGoogleMapsUrl(url: string): { lat: number; lng: number } | null {
    const patterns = [/@(-?\d+\.\d+),(-?\d+\.\d+)/, /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/, /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/, /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/]
    for (const re of patterns) {
        const m = url.match(re)
        if (m) {
            const lat = parseFloat(m[1])
            const lng = parseFloat(m[2])
            if (!Number.isNaN(lat) && !Number.isNaN(lng)) return { lat, lng }
        }
    }
    return null
}

function isShortenedMapsLink(url: string): boolean {
    return /(^|\.)goo\.gl\//.test(url) || /maps\.app\.goo\.gl/.test(url)
}

function ClickToPlacePin({ onPick }: { onPick: (lat: number, lng: number) => void }) {
    useMapEvents({
        click(e) {
            onPick(e.latlng.lat, e.latlng.lng)
        },
    })
    return null
}

// Recenters the existing map view when the pin changes from outside a
// direct map interaction (pasted link, GPS button) - without this the map
// would keep showing wherever it happened to be panned/zoomed to.
function RecenterOnChange({ lat, lng }: { lat: number | null; lng: number | null }) {
    const map = useMap()
    useEffect(() => {
        if (lat != null && lng != null) {
            map.setView([lat, lng], Math.max(map.getZoom(), 15))
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lat, lng])
    return null
}

interface LocationPinPickerProps {
    latitude: number | null | undefined
    longitude: number | null | undefined
    onChange: (lat: number | null, lng: number | null) => void
}

export default function LocationPinPicker({ latitude, longitude, onChange }: LocationPinPickerProps) {
    const { toast } = useToast()
    const [mapsLink, setMapsLink] = useState('')
    const [resolving, setResolving] = useState(false)
    const [locating, setLocating] = useState(false)

    const hasPin = typeof latitude === 'number' && typeof longitude === 'number' && !Number.isNaN(latitude) && !Number.isNaN(longitude)
    const center: [number, number] = hasPin ? [latitude as number, longitude as number] : DEFAULT_CENTER

    const handleSetFromLink = async () => {
        const trimmed = mapsLink.trim()
        if (!trimmed) return

        let parsed = parseGoogleMapsUrl(trimmed)

        if (!parsed && isShortenedMapsLink(trimmed)) {
            setResolving(true)
            try {
                const res = await fetch('/api/geo/resolve-maps-link', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: trimmed }),
                })
                const data = await res.json().catch(() => ({}))
                if (res.ok && data.finalUrl) {
                    parsed = parseGoogleMapsUrl(data.finalUrl)
                }
            } catch {
                // Falls through to the "couldn't read" toast below.
            } finally {
                setResolving(false)
            }
        }

        if (parsed) {
            onChange(parsed.lat, parsed.lng)
            setMapsLink('')
            toast({ title: 'Pin set', description: `${parsed.lat.toFixed(5)}, ${parsed.lng.toFixed(5)} — drag the pin to fine-tune it.` })
        } else {
            toast({
                title: "Couldn't read a location from that link",
                description: 'Paste a Google Maps share link with a pin, or click the map directly.',
                variant: 'destructive',
            })
        }
    }

    const handleUseMyLocation = () => {
        if (!navigator.geolocation) {
            toast({ title: 'Not supported', description: "This device/browser doesn't support GPS location.", variant: 'destructive' })
            return
        }
        setLocating(true)
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                onChange(pos.coords.latitude, pos.coords.longitude)
                setLocating(false)
            },
            (err) => {
                toast({ title: 'Could not get your location', description: err.message, variant: 'destructive' })
                setLocating(false)
            },
            { enableHighAccuracy: true, timeout: 15000 }
        )
    }

    return (
        <div className="space-y-3 rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-accent" />
                <Label className="text-sm font-semibold">Location on map (optional)</Label>
            </div>
            <p className="text-xs text-muted-foreground">
                Drop an exact pin — by clicking the map, pasting a Google Maps link, or using your phone's GPS — and it'll show on
                the property's page alongside the text location above.
            </p>

            <div className="flex flex-col sm:flex-row gap-2">
                <Input
                    placeholder="Paste a Google Maps link (e.g. https://maps.app.goo.gl/...)"
                    value={mapsLink}
                    onChange={(e) => setMapsLink(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault()
                            handleSetFromLink()
                        }
                    }}
                    className="flex-1"
                />
                <Button type="button" variant="outline" onClick={handleSetFromLink} disabled={resolving || !mapsLink.trim()}>
                    {resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Set pin from link'}
                </Button>
                <Button type="button" variant="outline" onClick={handleUseMyLocation} disabled={locating}>
                    {locating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Crosshair className="h-4 w-4 mr-1" />}
                    Use my GPS location
                </Button>
            </div>

            <div className="rounded-lg overflow-hidden border border-border" style={{ height: 280 }}>
                <MapContainer center={center} zoom={hasPin ? 15 : 12} style={{ height: '100%', width: '100%' }}>
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <ClickToPlacePin onPick={(lat, lng) => onChange(lat, lng)} />
                    <RecenterOnChange lat={hasPin ? (latitude as number) : null} lng={hasPin ? (longitude as number) : null} />
                    {hasPin && (
                        <Marker
                            position={center}
                            icon={pinIcon()}
                            draggable
                            eventHandlers={{
                                dragend: (e) => {
                                    const pos = (e.target as L.Marker).getLatLng()
                                    onChange(pos.lat, pos.lng)
                                },
                            }}
                        />
                    )}
                </MapContainer>
            </div>

            {hasPin ? (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                        Pin set: {(latitude as number).toFixed(6)}, {(longitude as number).toFixed(6)}
                    </span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null, null)} className="gap-1 h-auto py-1">
                        <X className="h-3 w-3" />
                        Remove pin
                    </Button>
                </div>
            ) : (
                <p className="text-xs text-muted-foreground">No pin set yet — click anywhere on the map to drop one.</p>
            )}
        </div>
    )
}
