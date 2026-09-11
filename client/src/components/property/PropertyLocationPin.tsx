import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapPin } from 'lucide-react'

/**
 * Read-only exact pin on a property's own page, when one was set from the
 * upload/edit form (see LocationPinPicker.tsx). Renders nothing when the
 * property has no lat/lng - the free-text `location` field above this in
 * PropertyDetails.tsx is what every property has always shown, this is
 * additive.
 */

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

interface PropertyLocationPinProps {
    latitude: number
    longitude: number
    title: string
}

export default function PropertyLocationPin({ latitude, longitude, title }: PropertyLocationPinProps) {
    const position: [number, number] = [latitude, longitude]
    const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`

    return (
        <div className="mb-6">
            <h4 className="font-semibold mb-3 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-accent" />
                Exact location
            </h4>
            <div className="rounded-lg overflow-hidden border border-border" style={{ height: 280 }}>
                <MapContainer center={position} zoom={15} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <Marker position={position} icon={pinIcon()} />
                </MapContainer>
            </div>
            <a
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-2 text-sm text-accent hover:underline"
            >
                Get directions on Google Maps
            </a>
        </div>
    )
}
