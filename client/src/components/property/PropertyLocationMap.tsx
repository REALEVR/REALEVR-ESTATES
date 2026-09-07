import { useMemo, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Property } from '@shared/schema'
import { Button } from '@/components/ui/button'
import { MapPin, X } from 'lucide-react'

/**
 * Real, well-known neighborhood coordinates for the Kampala-area locations
 * already offered as a text filter in Hero.tsx's search bar — these are
 * public geography (approximate neighborhood centers), not per-property
 * addresses. There's no lat/lng on the Property schema itself (no
 * geocoding pipeline exists), so a pin here represents "properties whose
 * `location` field mentions this neighborhood," not an exact building.
 */
const NEIGHBORHOODS: { name: string; lat: number; lng: number }[] = [
    { name: 'Kololo', lat: 0.3324, lng: 32.5966 },
    { name: 'Nakasero', lat: 0.3163, lng: 32.5825 },
    { name: 'Bugolobi', lat: 0.326, lng: 32.618 },
    { name: 'Muyenga', lat: 0.2989, lng: 32.6068 },
    { name: 'Ntinda', lat: 0.3616, lng: 32.6119 },
    { name: 'Munyonyo', lat: 0.2745, lng: 32.6285 },
    { name: 'Naguru', lat: 0.3392, lng: 32.6094 },
    { name: 'Kira', lat: 0.399, lng: 32.6425 },
    { name: 'Lubowa', lat: 0.265, lng: 32.555 },
    { name: 'Entebbe', lat: 0.0512, lng: 32.4637 },
]

const KAMPALA_CENTER: [number, number] = [0.32, 32.58]

function countIcon(count: number, active: boolean): L.DivIcon {
    return L.divIcon({
        className: '',
        html: `<div style="
            display:flex;align-items:center;justify-content:center;
            width:36px;height:36px;border-radius:50%;
            background:${active ? '#FF5A5F' : '#111827'};
            color:#fff;font-weight:600;font-size:13px;
            box-shadow:0 2px 6px rgba(0,0,0,0.35);
            border:2px solid #fff;
        ">${count}</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
    })
}

interface PropertyLocationMapProps {
    properties: Property[]
    selectedLocation: string | null
    onSelectLocation: (location: string | null) => void
}

/**
 * A location-based map filter: one pin per named Kampala-area neighborhood
 * that actually has listings, sized/labeled with how many. Clicking a pin
 * filters the property grid to that neighborhood (matched against each
 * property's own `location` text); clicking it again, or the "Clear" button,
 * removes the filter. Properties whose `location` doesn't mention any of
 * these named areas simply don't show a pin — they're still listed in the
 * ungated grid, this is purely a filter shortcut, not the source of truth.
 */
export default function PropertyLocationMap({ properties, selectedLocation, onSelectLocation }: PropertyLocationMapProps) {
    const [isOpen, setIsOpen] = useState(false)

    const pins = useMemo(() => {
        return NEIGHBORHOODS.map((n) => {
            const count = properties.filter((p) => p.location?.toLowerCase().includes(n.name.toLowerCase())).length
            return { ...n, count }
        }).filter((n) => n.count > 0)
    }, [properties])

    return (
        <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsOpen((v) => !v)}
                    className="gap-2"
                >
                    <MapPin className="h-4 w-4" />
                    {isOpen ? 'Hide map' : 'Filter by location on map'}
                </Button>
                {selectedLocation && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onSelectLocation(null)}
                        className="gap-1 text-muted-foreground"
                    >
                        <X className="h-3.5 w-3.5" />
                        Clear "{selectedLocation}" filter
                    </Button>
                )}
            </div>

            {isOpen && (
                <div className="rounded-lg overflow-hidden border border-border" style={{ height: 360 }}>
                    <MapContainer center={KAMPALA_CENTER} zoom={12} style={{ height: '100%', width: '100%' }}>
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        {pins.map((pin) => (
                            <Marker
                                key={pin.name}
                                position={[pin.lat, pin.lng]}
                                icon={countIcon(pin.count, selectedLocation === pin.name)}
                                eventHandlers={{
                                    click: () => onSelectLocation(selectedLocation === pin.name ? null : pin.name),
                                }}
                            >
                                <Popup>
                                    <strong>{pin.name}</strong>
                                    <br />
                                    {pin.count} propert{pin.count === 1 ? 'y' : 'ies'}
                                </Popup>
                            </Marker>
                        ))}
                    </MapContainer>
                </div>
            )}
        </div>
    )
}
