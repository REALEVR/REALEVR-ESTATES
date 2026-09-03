import { useState, useEffect } from 'react'
import { Link } from 'wouter'
import type { Property, User } from '@shared/schema'
import SharePropertyModal from '../property/SharePropertyModal'
import BookingCalendarModal from '../property/BookingCalendarModal'
import PaymentModal from '../property/PaymentModal'
import TourPaymentModal from '../property/TourPaymentModal'
import { usePropertyViews } from '@/hooks/usePropertyViews'
import { AnimatedCard, FadeIn } from '@/components/ui/animated-components'
import { Star } from 'lucide-react'
import VRBadge from '../property/VRBadge'

interface PropertyCardProps {
    property: Property
}

export default function PropertyCard({ property }: PropertyCardProps) {
    const [isFavorite, setIsFavorite] = useState(false)
    const [isShareModalOpen, setIsShareModalOpen] = useState(false)
    const [isBookingModalOpen, setIsBookingModalOpen] = useState(false)
    const [isTourPaymentModalOpen, setIsTourPaymentModalOpen] = useState(false)
    const [propertyOwner, setPropertyOwner] = useState<User | null>(null)

    // Fetch property owner details
    useEffect(() => {
        const fetchPropertyOwner = async () => {
            if (property.ownerId) {
                try {
                    const response = await fetch(`/api/users/${property.ownerId}`)
                    if (response.ok) {
                        const owner = await response.json()
                        setPropertyOwner(owner)
                    }
                } catch (error) {
                    console.error('Error fetching property owner:', error)
                }
            }
        }

        fetchPropertyOwner()
    }, [property.ownerId])

    const handleFavoriteClick = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsFavorite(!isFavorite)
    }

    const handleShareClick = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsShareModalOpen(true)
    }

    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
    const { viewedProperties, hasValidPayment, registerPayment } = usePropertyViews()

    const handlePropertyView = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()

        // Only rental properties require payment for tour viewing
        // BnBs can view tours for free, but need to pay 20% to book
        const requiresPayment =
            property.category === 'rental_units' ||
            property.category === 'furnished_houses' ||
            property.propertyType === 'Furnished Rental'

        if (!hasValidPayment && requiresPayment) {
            setIsPaymentModalOpen(true)
            return
        }

        // For other property types, allow direct viewing
        window.location.href = `/property/${property.id}`
    }

    const handleScheduleClick = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsBookingModalOpen(true)
    }

    const handlePaymentConfirm = async (response: any) => {
        try {
            console.log('Payment response:', response)
            // Payment was successful, now redirect to property page
            window.location.href = `/property/${property.id}`
        } catch (error) {
            console.error('Payment handling error:', error)
        }
    }

    const handleTourPaymentSuccess = () => {
        // BUG FIX: this used to only close the modal and redirect — it never
        // called registerPayment(), so hasValidPayment stayed false even
        // after a real, successful IoTec payment. Combined with
        // handleCardClick below never checking hasValidPayment either, the
        // result was that EVERY click on ANY rental/BnB property demanded a
        // fresh payment, even seconds after a successful one — completely
        // defeating the "pay once, view up to 5 properties for 24h" promise
        // TourPaymentModal's own sibling PaymentModal advertises. Now a
        // successful payment actually sticks.
        registerPayment()
        setIsTourPaymentModalOpen(false)
        window.location.href = `/property/${property.id}`
    }

    // Shared by the whole-card click and the explicit "View Tour" button on
    // the picture (added on request — a visible affordance in addition to
    // the whole card already being clickable, not a replacement for it).
    const openTourOrPay = () => {
        // Only rental properties require payment for tour viewing
        // BnBs can view tours for free, but need to pay 20% to book
        const requiresPayment =
            property.category === 'rental_units' ||
            property.category === 'furnished_houses' ||
            property.propertyType === 'Furnished Rental'

        // BUG FIX: this never checked hasValidPayment before — see
        // handleTourPaymentSuccess's comment above for the full picture.
        // Someone who already has a valid pass now skips straight to the
        // tour, same as the (previously unused) handlePropertyView above
        // always intended.
        if (requiresPayment && !hasValidPayment) {
            setIsTourPaymentModalOpen(true)
        } else {
            // Free categories, or a rental/BnB already covered by a valid
            // pass — go straight to the property page.
            window.location.href = `/property/${property.id}`
        }
    }

    const handleCardClick = (e: React.MouseEvent) => {
        // Don't trigger if clicking on buttons or interactive elements
        if ((e.target as HTMLElement).closest('button')) {
            return
        }
        openTourOrPay()
    }

    const handleViewTourClick = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        openTourOrPay()
    }

    return (
        <>
            <AnimatedCard
                className="property-card bg-card rounded-2xl overflow-hidden shadow-sm border-[1.5px] border-border cursor-pointer hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
                onClick={handleCardClick}
            >
                <div className="relative">
                    <FadeIn>
                        {/* Design-review fix (round 3): every property grid on the
                            homepage (Featured/Popular/Recent/Browse) renders through
                            this one component, so an uncached homepage load was firing
                            up to 16+ full-size image requests immediately, most of them
                            for cards scrolled well out of view. loading="lazy" defers
                            the offscreen ones to when they're actually about to scroll
                            into view — a real bandwidth win on the data-constrained
                            mobile connections this platform's Uganda/Africa audience is
                            most likely to be using. */}
                        <img
                            src={property.imageUrl}
                            alt={property.title}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-52 object-cover transition-transform duration-500 hover:scale-110"
                        />
                    </FadeIn>
                    <div className="absolute top-3 right-3 flex space-x-2 z-10">
                        <button
                            className="p-2 bg-white/80 backdrop-blur-sm rounded-full hover:bg-white transition-colors"
                            onClick={handleShareClick}
                            aria-label="Share this property"
                            title="Share this property"
                        >
                            <i className="fas fa-share-alt"></i>
                        </button>
                        <button
                            className="p-2 bg-white/80 backdrop-blur-sm rounded-full hover:bg-white transition-colors"
                            onClick={handleFavoriteClick}
                            aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                        >
                            <i className={`${isFavorite ? 'fas text-accent' : 'far'} fa-heart`}></i>
                        </button>
                    </div>
                    {property.isAvailable !== undefined && (
                        <div className="absolute top-3 left-3 z-10">
                            <span
                                className={`flex items-center text-xs font-medium rounded-full px-2 py-1 ${
                                    property.isAvailable ? 'bg-emerald-600 text-white' : 'bg-red-500 text-white'
                                }`}
                            >
                                <span
                                    className={`w-2 h-2 rounded-full mr-1 ${
                                        property.isAvailable ? 'bg-white' : 'bg-white'
                                    }`}
                                ></span>
                                {property.isAvailable ? 'Available' : 'Unavailable'}
                            </span>
                        </div>
                    )}
                    {property.hasTour && (
                        <div className="absolute bottom-3 left-3 z-10">
                            <VRBadge size="sm" />
                        </div>
                    )}
                    {/* Explicit "View Tour" affordance on the picture itself
                        — the whole card is already clickable (handleCardClick
                        above), but a visible button removes any doubt about
                        what tapping the photo does: opens the tour directly,
                        or the IoTec pay-to-view prompt first for
                        rental/BnB categories that require it. Always visible
                        (not a hover-reveal) — this platform's audience is
                        mostly on phones, which have no hover state, so
                        anything shown only on :hover is effectively invisible
                        to most visitors here. */}
                    <button
                        type="button"
                        onClick={handleViewTourClick}
                        aria-label="View virtual tour"
                        className="absolute inset-0 z-[5] flex items-center justify-center bg-black/0 active:bg-black/10 transition-colors"
                    >
                        <span className="flex items-center gap-2 rounded-full bg-black/55 backdrop-blur-sm px-4 py-2 text-sm font-medium text-white shadow-lg">
                            <i className="fas fa-play text-xs"></i>
                            View Tour
                        </span>
                    </button>
                </div>
                <div className="p-4">
                    <div className="flex justify-between items-start gap-2">
                        {/* Design-review fix (round 1): unclamped titles could
                            wrap to 2 lines on longer real listing titles,
                            visually colliding with the availability badge
                            above and breaking row alignment across cards in
                            the same grid. line-clamp-2 + a fixed min-height
                            keeps every card the same title-block height
                            regardless of title length. */}
                        <h3 className="font-display font-medium text-foreground line-clamp-2 min-h-[2.75rem]">{property.title}</h3>
                        {/* Airbnb-style rating, next to the title — only shown once the
                            property actually has reviews, never a fabricated "new" rating. */}
                        {property.reviewCount > 0 && (
                            <div className="flex items-center gap-1 flex-shrink-0 pt-0.5">
                                <Star className="h-3.5 w-3.5 fill-foreground text-foreground" />
                                <span className="text-sm font-medium text-foreground">{property.rating}</span>
                            </div>
                        )}
                    </div>
                    <p className="text-muted-foreground text-sm mb-2">{property.location}</p>
                    <p className="text-muted-foreground text-sm mb-3">
                        {property.bedrooms} bed • {property.bathrooms} bath • {property.squareMeters} sq m
                    </p>

                    {/* Property Owner Contact */}
                    {propertyOwner && (
                        <div className="mb-3 p-3 bg-secondary rounded-lg border border-border">
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center mb-1">
                                        <div className="w-6 h-6 rounded-full bg-accent/15 flex items-center justify-center mr-2">
                                            <span className="text-xs font-semibold text-accent">
                                                {propertyOwner.fullName?.charAt(0)?.toUpperCase() || 'A'}
                                            </span>
                                        </div>
                                        <span className="text-xs font-semibold text-foreground">
                                            {propertyOwner.fullName}
                                        </span>
                                    </div>
                                    <div className="text-xs text-accent font-medium mb-1">
                                        {propertyOwner.role === 'agent' ? 'Property Agent' : 'Property Manager'}
                                    </div>
                                    {propertyOwner.companyName && (
                                        <div className="text-xs text-muted-foreground mb-1">{propertyOwner.companyName}</div>
                                    )}
                                    {propertyOwner.phoneNumber && (
                                        <div className="flex items-center">
                                            {/* <Phone className="h-3 w-3 text-green-600 mr-1" />
                      <span className="text-xs text-green-700 font-medium">
                        {propertyOwner.phoneNumber}
                      </span> */}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex justify-between items-center mb-3">
                        <div>
                            {/* Design-review fix (round 2): price was the same
                                weight/size as the bed/bath/sqm spec line below
                                it — the single most-scanned number on a
                                listings card read like metadata, not the
                                headline it should be. */}
                            <span className="font-display font-bold text-foreground text-xl md:text-2xl">
                                {property.price != null ? (
                                    property.price.toLocaleString()
                                ) : (
                                    <span className="text-muted-foreground">N/A</span>
                                )}{' '}
                                {property.currency || 'UGX'}
                            </span>
                            {property.category === 'rental_units' && (
                                <span className="text-muted-foreground text-sm"> / month</span>
                            )}
                            {(property.category === 'furnished_houses' || property.category === 'BnB') && (
                                <span className="text-muted-foreground text-sm"> / day</span>
                            )}
                        </div>
                    </div>
                    {/* No separate "View Tour" button — Airbnb-style cards carry no
                        button at all; the whole card is already clickable via
                        handleCardClick above, with the exact same payment-gating
                        logic this button used to duplicate. */}
                </div>
            </AnimatedCard>

            {/* Modals */}
            <SharePropertyModal
                isOpen={isShareModalOpen}
                onClose={() => setIsShareModalOpen(false)}
                propertyId={property.id}
                propertyTitle={property.title}
            />

            <BookingCalendarModal
                isOpen={isBookingModalOpen}
                onClose={() => setIsBookingModalOpen(false)}
                propertyId={property.id}
                propertyTitle={property.title}
                propertyCategory={property.category}
                propertyPrice={property.price}
                propertyCurrency={property.currency || 'UGX'}
            />

            <PaymentModal
                isOpen={isPaymentModalOpen}
                onClose={() => setIsPaymentModalOpen(false)}
                propertyId={property.id}
                propertyTitle={property.title}
                paymentType="ViewingFee"
                amount={10000} // 10,000 UGX for viewing rental properties
                successCallback={handlePaymentConfirm}
            />

            <TourPaymentModal
                isOpen={isTourPaymentModalOpen}
                onClose={() => setIsTourPaymentModalOpen(false)}
                property={property}
                onPaymentSuccess={handleTourPaymentSuccess}
            />
        </>
    )
}
