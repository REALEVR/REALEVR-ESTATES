import { Suspense, lazy, useState } from 'react'
import type { Property } from '@shared/schema'
const SharePropertyModal = lazy(() => import('../property/SharePropertyModal'))
const BookingCalendarModal = lazy(() => import('../property/BookingCalendarModal'))
import { FadeIn } from '@/components/ui/animated-components'
import Tilt from '@/components/motion/Tilt'
import { Star, Rocket, Heart, Share2, Play, Orbit } from 'lucide-react'
import { useActiveBoostedPropertyIds } from '@/hooks/useActiveBoosts'
import BuyWithBitcoinButton from '@/components/crypto/BuyWithBitcoinButton'

interface PropertyCardProps {
    property: Property
}

/**
 * A listing, the way Airbnb shows one: the photo is the card (4:3, soft corners, no
 * heavy frame), and under it three quiet lines (title and rating, where, price).
 * The one loud thing is the gold "360 tour" chip, because that is what this site is for.
 * Whole card opens the property; the heart and share buttons sit on the photo.
 *
 * What used to be here and is not any more: the big "View Tour" pill across every photo
 * (the card is the button), the agent contact box (it lives on the property page, and
 * dropping it also drops one request per card), and the "VR & 360 Ready" banner.
 */
export default function PropertyCard({ property }: PropertyCardProps) {
    const [isFavorite, setIsFavorite] = useState(false)
    const [isShareModalOpen, setIsShareModalOpen] = useState(false)
    const [isBookingModalOpen, setIsBookingModalOpen] = useState(false)
    const isBnB =
        property.category === 'BnB' ||
        property.category === 'furnished_houses' ||
        property.propertyType === 'Furnished Rental'
    // Same badge, wherever this card renders: only while a real, active boost covers it.
    const { data: activeBoosts } = useActiveBoostedPropertyIds()
    const isBoosted = !!activeBoosts?.propertyIds?.includes(property.id)

    // POLICY: the grid card never gates viewing for any category - tapping the photo or the
    // card goes straight to the property page, where each category's payment moment (if any)
    // lives (rental tours preview free for 5 seconds, BnB deposits come at booking).
    const goToProperty = () => {
        window.location.href = `/property/${property.id}`
    }

    const stop = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
    }

    const perUnit =
        property.category === 'rental_units' ? ' / month' : isBnB ? ' / night' : ''

    return (
        <>
            <Tilt
                className="property-card group cursor-pointer rounded-3xl"
                onClick={(e: React.MouseEvent) => {
                    if ((e.target as HTMLElement).closest('button')) return
                    goToProperty()
                }}
            >
                <article aria-label={property.title}>
                    <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-muted shadow-[0_1px_2px_hsl(235_28%_12%/0.08)]">
                        <FadeIn className="h-full w-full">
                            {/* Lazy: a grid of these used to fetch every photo at once, a real cost on mobile data. */}
                            <img
                                src={property.imageUrl}
                                alt={property.title}
                                loading="lazy"
                                decoding="async"
                                className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                            />
                        </FadeIn>
                        {/* Legibility for the chips, whatever the photo is. */}
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/10" />

                        <div className="absolute left-3 top-3 z-10 flex flex-col items-start gap-1.5">
                            {isBoosted && (
                                <span className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-foreground shadow-sm">
                                    <Rocket className="h-3 w-3 text-accent" aria-hidden="true" />
                                    Boosted
                                </span>
                            )}
                            {property.isAvailable === false && (
                                <span className="rounded-full bg-foreground/85 px-2.5 py-1 text-xs font-semibold text-background">
                                    Unavailable
                                </span>
                            )}
                        </div>

                        <div className="absolute right-3 top-3 z-10 flex gap-2">
                            <button
                                type="button"
                                className="grid h-9 w-9 place-items-center rounded-full bg-white/90 text-foreground shadow-sm backdrop-blur transition hover:scale-105 hover:bg-white"
                                onClick={(e) => {
                                    stop(e)
                                    setIsShareModalOpen(true)
                                }}
                                aria-label="Share this property"
                            >
                                <Share2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                            <button
                                type="button"
                                className="grid h-9 w-9 place-items-center rounded-full bg-white/90 text-foreground shadow-sm backdrop-blur transition hover:scale-105 hover:bg-white"
                                onClick={(e) => {
                                    stop(e)
                                    setIsFavorite(!isFavorite)
                                }}
                                aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                                aria-pressed={isFavorite}
                            >
                                <Heart
                                    className={`h-4 w-4 ${isFavorite ? 'fill-accent text-accent' : ''}`}
                                    aria-hidden="true"
                                />
                            </button>
                        </div>

                        {property.hasTour && (
                            <div className="absolute bottom-3 left-3 z-10">
                                <span className="tour-chip">
                                    <Orbit className="h-3.5 w-3.5" aria-hidden="true" />
                                    360° tour
                                </span>
                            </div>
                        )}
                        {property.hasTour && (
                            <span className="pointer-events-none absolute bottom-3 right-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-foreground opacity-0 shadow-sm backdrop-blur transition-opacity duration-300 group-hover:opacity-100">
                                <Play className="ml-0.5 h-4 w-4 fill-current" aria-hidden="true" />
                            </span>
                        )}
                    </div>

                    <div className="px-1 pb-1 pt-3">
                        <div className="flex items-start justify-between gap-3">
                            <h3 className="line-clamp-1 font-display text-[1.0625rem] font-semibold leading-snug text-foreground">
                                {property.title}
                            </h3>
                            {property.reviewCount > 0 && (
                                <span className="flex flex-shrink-0 items-center gap-1 pt-0.5 text-sm font-medium text-foreground">
                                    <Star className="h-3.5 w-3.5 fill-foreground" aria-hidden="true" />
                                    {property.rating}
                                </span>
                            )}
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{property.location}</p>
                        <p className="text-sm text-muted-foreground">
                            {property.bedrooms} bed · {property.bathrooms} bath
                            {property.squareMeters ? ` · ${property.squareMeters} m²` : ''}
                        </p>
                        <p className="mt-1.5 text-foreground">
                            <span className="font-display text-lg font-bold">
                                {property.price != null ? (
                                    `${property.currency || 'UGX'} ${property.price.toLocaleString()}`
                                ) : (
                                    <span className="text-muted-foreground">Price on request</span>
                                )}
                            </span>
                            {property.price != null && perUnit && <span className="text-sm text-muted-foreground">{perUnit}</span>}
                        </p>
                        {/* Every home for sale can be bought with Bitcoin: renders nothing for rentals and stays. */}
                        <BuyWithBitcoinButton property={property} variant="card" />
                        {/* A BnB can offer a discounted monthly rate for long stays, shown beside the nightly one. */}
                        {isBnB && property.monthlyPrice != null && (
                            <p className="text-xs text-muted-foreground">
                                or {property.currency || 'UGX'} {property.monthlyPrice.toLocaleString()} / month for long stays
                            </p>
                        )}
                    </div>
                </article>
            </Tilt>

            {/* Loaded only when opened: the date picker and its forms are not needed to show a card. */}
            {isShareModalOpen && (
                <Suspense fallback={null}>
                    <SharePropertyModal
                        isOpen={isShareModalOpen}
                        onClose={() => setIsShareModalOpen(false)}
                        propertyId={property.id}
                        propertyTitle={property.title}
                    />
                </Suspense>
            )}

            {isBookingModalOpen && (
                <Suspense fallback={null}>
                    <BookingCalendarModal
                        isOpen={isBookingModalOpen}
                        onClose={() => setIsBookingModalOpen(false)}
                        propertyId={property.id}
                        propertyTitle={property.title}
                        propertyCategory={property.category}
                        propertyPrice={property.price}
                        propertyCurrency={property.currency || 'UGX'}
                    />
                </Suspense>
            )}
        </>
    )
}
