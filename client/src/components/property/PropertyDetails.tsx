import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { useLocation } from 'wouter'
import { useAuth } from '@/hooks/use-auth'
import { usePropertyViews } from '@/hooks/usePropertyViews'
import OwnerContactDetails from './OwnerContactDetails'
import ReviewsSection from './ReviewsSection'
import BookingCalendarModal from './BookingCalendarModal'
import VirtualTourModal from './VirtualTourModal'
import TourPaymentModal from './TourPaymentModal'
import SharePropertyModal from './SharePropertyModal'
import MessageAgentModal from './MessageAgentModal'
import SimilarProperties from './SimilarProperties'
import PropertyLocationPin from './PropertyLocationPin'
import RentPaymentPrompt from './RentPaymentPrompt'
import BnbAvailabilityCalendar from './BnbAvailabilityCalendar'
import type { Property, User } from '@shared/schema'
import { getSafeAmenities } from '@/lib/property-utils'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Phone, User as UserIcon, Share2 } from 'lucide-react'

interface PropertyDescriptionProps {
    description: string
}

function PropertyDescription({ description }: PropertyDescriptionProps) {
    const [isExpanded, setIsExpanded] = useState(false)

    // Split description into sentences using a simpler approach
    const sentences = description.split(/[.!?]+\s+/).filter((s) => s.trim().length > 0)

    // Show first 3 sentences by default
    const previewSentences = sentences.slice(0, 3)
    const remainingSentences = sentences.slice(3)

    const hasMoreContent = remainingSentences.length > 0
    // Reconstruct the preview text with proper punctuation
    const previewText = previewSentences
        .map((sentence, index) => {
            // Add back punctuation if it's missing
            if (index < previewSentences.length - 1 && !sentence.match(/[.!?]$/)) {
                return sentence + '.'
            }
            return sentence
        })
        .join(' ')
    const fullText = description

    return (
        <div className="text-muted-foreground">
            <p className="leading-relaxed">
                {isExpanded ? fullText : previewText}
                {!isExpanded && hasMoreContent && '...'}
            </p>
            {hasMoreContent && (
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="mt-2 text-accent hover:text-accent/70 font-medium text-sm transition-colors"
                >
                    {isExpanded ? 'Show less' : 'Read more'}
                </button>
            )}
        </div>
    )
}

interface PropertyDetailsProps {
    property: Property
}

export default function PropertyDetails({ property }: PropertyDetailsProps) {
    const [isFavorite, setIsFavorite] = useState(false)
    const [isShareModalOpen, setIsShareModalOpen] = useState(false)
    const [isBookingModalOpen, setIsBookingModalOpen] = useState(false)
    const [isTourModalOpen, setIsTourModalOpen] = useState(false)
    const [isTourPaymentModalOpen, setIsTourPaymentModalOpen] = useState(false)
    const [isMessageAgentModalOpen, setIsMessageAgentModalOpen] = useState(false)
    const [bookingConfirmed, setBookingConfirmed] = useState(false)
    const [propertyOwner, setPropertyOwner] = useState<User | null>(null)
    const [location] = useLocation()
    const { toast } = useToast()
    const { user } = useAuth()
    const { hasValidPayment, registerPayment } = usePropertyViews()

    // Check if this is a BnB property — a property explicitly tagged as a
    // furnished/serviced rental reads the same "tour + host contact gated
    // behind the 20% deposit" policy as a category="furnished_houses"/"BnB"
    // listing (see handleViewTour and OwnerContactDetails), even if its
    // category field happens to be "rental_units".
    const isBnB =
        property.category === 'BnB' ||
        property.category === 'furnished_houses' ||
        property.propertyType === 'Furnished Rental'

    // PAYMENTS ROUND 3: a plain rental unit pays to *view* the tour AND the
    // rest of the listing's details (amenities, description, extra info —
    // see the gate wrapping the Tabs below), after a free tour preview —
    // see handleViewTour and the previewSeconds prop passed to
    // VirtualTourModal below. BnBs (isBnB above) never pay to view; their
    // gate is booking (the 20% deposit), which now covers both the tour
    // and host contact details together (see handleViewTour and
    // OwnerContactDetails). For-sale and bank-sales remain always free.
    const requiresTourPayment = property.category === 'rental_units' && !isBnB

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

    // Check for booking confirmation in URL
    useEffect(() => {
        if (location.includes('booking=confirmed')) {
            setBookingConfirmed(true)
            toast({
                title: 'Booking Confirmed!',
                description: 'Your booking has been confirmed. Owner contact details are now available.',
                duration: 5000,
            })
        }
    }, [location, toast])

    const handleFavoriteClick = () => {
        setIsFavorite(!isFavorite)
        toast({
            title: isFavorite ? 'Removed from favorites' : 'Added to favorites',
            description: isFavorite
                ? `${property.title} has been removed from your favorites.`
                : `${property.title} has been added to your favorites.`,
            duration: 3000,
        })
    }

    const handleViewTour = () => {
        // PAYMENTS ROUND 3: BnBs now gate the tour itself behind the same
        // 20% booking deposit that already gated host contact details
        // (OwnerContactDetails) — a reversal of PAYMENTS ROUND 2, which had
        // deliberately made BnB tours free to view. Everything else about
        // the flow is unchanged: a rental unit without a valid pass still
        // gets its 5-second free preview (previewSeconds on
        // VirtualTourModal below, handled by handleTourPreviewExpired);
        // for-sale/bank-sale tours are still always free.
        if (isBnB && !bookingConfirmed) {
            toast({
                title: 'Book this property to view the tour',
                description: 'The virtual tour unlocks once your 20% deposit is confirmed. Click "Book Now" to get started.',
                variant: 'destructive',
                duration: 5000,
            })
            setIsBookingModalOpen(true)
            return
        }
        setIsTourModalOpen(true)
    }

    const handleTourPreviewExpired = () => {
        // Only ever fires for a rental unit without a valid pass — see
        // requiresTourPayment, which is the only thing that puts a
        // previewSeconds limit on VirtualTourModal in the first place.
        setIsTourModalOpen(false)
        setIsTourPaymentModalOpen(true)
    }

    const handleContactAgent = () => {
        if (isBnB && !bookingConfirmed) {
            toast({
                title: 'Contact Information Hidden',
                description: 'You need to book this property with a deposit to view owner contact details.',
                variant: 'destructive',
                duration: 4000,
            })
            return
        }

        toast({
            title: 'Agent contacted',
            description: 'An agent will reach out to you shortly regarding this property.',
            duration: 3000,
        })
    }

    const handleScheduleVisit = () => {
        setIsBookingModalOpen(true)
    }

    const handleBookingSuccess = () => {
        setBookingConfirmed(true)
        toast({
            title: 'Booking Successful!',
            description:
                "Your booking has been confirmed and deposit received. You can now view the owner's contact details.",
            duration: 5000,
        })
    }

    const handleTourPaymentSuccess = () => {
        // Same fix as PropertyCard.tsx's handleTourPaymentSuccess: actually
        // register the payment so hasValidPayment is true for the rest of
        // this session — previously a successful payment here was forgotten
        // immediately, so re-opening the tour (or viewing another gated
        // property) would ask again.
        registerPayment()
        setIsTourPaymentModalOpen(false)
        setIsTourModalOpen(true)
    }

    return (
        <div className="p-6 lg:p-8">
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-2xl font-display font-medium text-foreground">{property.title}</h1>
                    <p className="text-muted-foreground mb-2">{property.location}</p>
                    <div className="flex items-center mb-4">
                        <i className="fas fa-star text-accent"></i>
                        <span className="ml-1 font-medium">{property.rating}</span>
                        <span className="mx-1">·</span>
                        <span className="text-muted-foreground underline">{property.reviewCount} reviews</span>
                    </div>
                </div>
                <div className="flex gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="p-2 hover:bg-secondary rounded-full"
                        onClick={() => setIsShareModalOpen(true)}
                        aria-label="Share this property"
                        title="Share this property"
                    >
                        <Share2 className="h-5 w-5" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="p-2 hover:bg-secondary rounded-full"
                        onClick={handleFavoriteClick}
                    >
                        <i className={`${isFavorite ? 'fas text-accent' : 'far'} fa-heart text-xl`}></i>
                    </Button>
                </div>
            </div>

            <SharePropertyModal
                isOpen={isShareModalOpen}
                onClose={() => setIsShareModalOpen(false)}
                propertyId={property.id}
                propertyTitle={property.title}
            />

            {/* PAYMENTS ROUND 3: a plain rental unit's details - amenities,
                description, extra info, everything the Tabs below hold -
                are now gated behind the same pay-to-view pass that already
                gated the tour (requiresTourPayment/hasValidPayment). Before
                this, only the tour itself was gated; the rest of the page
                was fully visible regardless, which undercut the point of
                paying to view in the first place. */}
            {requiresTourPayment && !hasValidPayment ? (
                <div className="border border-dashed border-border rounded-lg p-8 text-center my-6">
                    <h4 className="font-semibold mb-1">Full details are locked</h4>
                    <p className="text-muted-foreground text-sm mb-4">
                        Amenities, extra property information, and reviews unlock once you pay to view this listing —
                        the same pass that unlocks the virtual tour.
                    </p>
                    <Button variant="default" className="bg-accent hover:bg-accent/90" onClick={handleViewTour}>
                        Unlock full details
                    </Button>
                </div>
            ) : (
            <Tabs defaultValue="overview" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="details">Extra Details</TabsTrigger>
                    <TabsTrigger value="reviews">
                        Reviews{property.reviewCount ? ` (${property.reviewCount})` : ''}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-6">
                    <div className="border-t border-b border-border py-6 my-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <h4 className="font-semibold mb-1">Property Details</h4>
                                <ul className="space-y-2 text-muted-foreground">
                                    <li className="flex items-center">
                                        <i className="fas fa-bed w-6"></i>
                                        <span>{property.bedrooms} Bedrooms</span>
                                    </li>
                                    <li className="flex items-center">
                                        <i className="fas fa-bath w-6"></i>
                                        <span>{property.bathrooms} Bathrooms</span>
                                    </li>
                                    {/* Square meters is no longer collected on the upload form —
                                        only shown for older listings that already have a real
                                        value, never a fabricated "0 sq m". */}
                                    {property.squareMeters ? (
                                        <li className="flex items-center">
                                            <i className="fas fa-vector-square w-6"></i>
                                            <span>
                                                {property.squareMeters} sq m ({Math.round(property.squareMeters / 0.093)} sq
                                                ft)
                                            </span>
                                        </li>
                                    ) : null}
                                    <li className="flex items-center">
                                        <i className="fas fa-building w-6"></i>
                                        <span>{property.propertyType}</span>
                                    </li>
                                    {isBnB && (
                                        <li className="flex items-center text-accent font-medium">
                                            <i className="fas fa-calendar-check w-6"></i>
                                            <span>20% deposit to book (non-refundable) — unlocks the tour and host contact</span>
                                        </li>
                                    )}
                                </ul>
                            </div>
                            <div>
                                <h4 className="font-semibold mb-1">Amenities</h4>
                                <ul className="space-y-2 text-muted-foreground">
                                    {/* Design-review fix (round 2): `array.map(...) || fallback`
                                        never actually falls back — `.map()` on an empty array
                                        returns `[]`, which is truthy in JS, so the "No amenities
                                        listed" text could never render; a property with zero
                                        amenities just showed a silently blank column instead
                                        (confirmed via the design-review panel's screenshot).
                                        Checking `.length` explicitly fixes the real bug. */}
                                    {(() => {
                                        const amenities = getSafeAmenities(property) ?? []
                                        if (amenities.length === 0) {
                                            return <li className="text-muted-foreground/70 italic">No amenities listed</li>
                                        }
                                        return amenities.map((amenity, index) => (
                                            <li key={index} className="flex items-center">
                                                <i
                                                    className={`fas fa-${
                                                        amenity.includes('Pool')
                                                            ? 'swimming-pool'
                                                            : amenity.includes('Fitness')
                                                            ? 'dumbbell'
                                                            : amenity.includes('Pet')
                                                            ? 'paw'
                                                            : amenity.includes('Internet')
                                                            ? 'wifi'
                                                            : amenity.includes('parking')
                                                            ? 'parking'
                                                            : 'check'
                                                    } w-6`}
                                                ></i>
                                                <span>{amenity}</span>
                                            </li>
                                        ))
                                    })()}
                                </ul>
                            </div>
                        </div>
                    </div>

                    {typeof property.latitude === 'number' && typeof property.longitude === 'number' && (
                        <PropertyLocationPin latitude={property.latitude} longitude={property.longitude} title={property.title} />
                    )}

                    {/* Property Owner Contact Information. Was showing the
                        agent's raw phone number to every visitor regardless
                        of payment status - a real leak against the "only
                        visible to users who have paid" policy the upload
                        form itself documents for this same contact info.
                        Hidden for BnBs (OwnerContactDetails below already
                        covers that, gated on the booking deposit) and for
                        rental units before they've paid to view (this whole
                        block only renders once requiresTourPayment has
                        already resolved to false or hasValidPayment is true,
                        via the wrapping gate above), so the only case left
                        where this shows unconditionally is for-sale/bank-
                        sale listings, which were never gated in the first
                        place. */}
                    {propertyOwner && !isBnB && (
                        <div className="mb-6">
                            <h4 className="font-semibold mb-3">Property Contact</h4>
                            <Card>
                                <CardContent className="p-4">
                                    <div className="flex items-center space-x-3">
                                        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                                            <UserIcon className="h-6 w-6 text-muted-foreground" />
                                        </div>
                                        <div className="flex-1">
                                            <h5 className="font-medium">{propertyOwner.fullName}</h5>
                                            <p className="text-sm text-muted-foreground">
                                                {propertyOwner.role === 'agent' ? 'Property Agent' : 'Property Manager'}
                                            </p>
                                        </div>
                                        {propertyOwner.phoneNumber && (
                                            <div className="flex items-center space-x-2">
                                                <Phone className="h-4 w-4 text-muted-foreground" />
                                                <span className="text-sm font-medium">{propertyOwner.phoneNumber}</span>
                                            </div>
                                        )}
                                    </div>
                                    {propertyOwner.companyName && (
                                        <div className="mt-3 pt-3 border-t border-border">
                                            <p className="text-sm text-muted-foreground">
                                                <span className="font-medium">Company:</span>{' '}
                                                {propertyOwner.companyName}
                                            </p>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="details" className="space-y-6">
                    {/* Property Description */}
                    <Card>
                        <CardHeader>
                            <CardTitle>About this property</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <PropertyDescription description={property.description} />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Additional Property Information</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <h4 className="font-semibold mb-3">Construction & Age</h4>
                                    <ul className="space-y-2 text-muted-foreground">
                                        {property.yearOfConstruction && (
                                            <li className="flex items-center">
                                                <i className="fas fa-calendar w-6"></i>
                                                <span>Built in {property.yearOfConstruction}</span>
                                            </li>
                                        )}
                                        {property.buildingAge && (
                                            <li className="flex items-center">
                                                <i className="fas fa-clock w-6"></i>
                                                <span>{property.buildingAge} years old</span>
                                            </li>
                                        )}
                                        {property.propertyCondition && (
                                            <li className="flex items-center">
                                                <i className="fas fa-star w-6"></i>
                                                <span>
                                                    Condition:{' '}
                                                    {property.propertyCondition
                                                        .replace('-', ' ')
                                                        .replace(/\b\w/g, (l) => l.toUpperCase())}
                                                </span>
                                            </li>
                                        )}
                                        {!property.yearOfConstruction &&
                                            !property.buildingAge &&
                                            !property.propertyCondition && (
                                                <li className="text-muted-foreground/70 italic">
                                                    No construction details available
                                                </li>
                                            )}
                                    </ul>
                                </div>

                                {property.category === 'bank-sale' && (
                                    <div>
                                        <h4 className="font-semibold mb-3">Auction Information</h4>
                                        <ul className="space-y-2 text-muted-foreground">
                                            {property.auctionStart && (
                                                <li className="flex items-center">
                                                    <i className="fas fa-play w-6"></i>
                                                    <span>
                                                        Starts: {new Date(property.auctionStart).toLocaleDateString()}
                                                    </span>
                                                </li>
                                            )}
                                            {property.auctionEnd && (
                                                <li className="flex items-center">
                                                    <i className="fas fa-stop w-6"></i>
                                                    <span>
                                                        Ends: {new Date(property.auctionEnd).toLocaleDateString()}
                                                    </span>
                                                </li>
                                            )}
                                            {property.auctionStatus && (
                                                <li className="flex items-center">
                                                    <i className="fas fa-gavel w-6"></i>
                                                    <span>
                                                        Status:{' '}
                                                        {property.auctionStatus.replace(/\b\w/g, (l) =>
                                                            l.toUpperCase()
                                                        )}
                                                    </span>
                                                </li>
                                            )}
                                            {!property.auctionStart &&
                                                !property.auctionEnd &&
                                                !property.auctionStatus && (
                                                    <li className="text-muted-foreground/70 italic">
                                                        No auction details available
                                                    </li>
                                                )}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="reviews" className="space-y-6">
                    <ReviewsSection propertyId={property.id} />
                </TabsContent>
            </Tabs>
            )}

            {/* Display price differently for BnBs (per night) vs other properties (per month) */}
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-3">
                <div className="mb-4 md:mb-0">
                    {/* Design-review fix (round 2): bumped from text-2xl/font-medium
                        to match the same price-hierarchy fix applied to
                        PropertyCard — the price is the most-scanned number on
                        this page and should read as a headline. */}
                    <span className="text-3xl font-display font-bold text-foreground">
                        {property.price !== undefined && property.price !== null
                            ? property.price.toLocaleString()
                            : 'N/A'}{' '}
                        {property.currency || 'UGX'}
                    </span>
                    {property.category === 'rental_units' && <span className="text-muted-foreground"> / month</span>}
                    {(property.category === 'furnished_houses' || property.category === 'BnB') && (
                        <span className="text-muted-foreground"> / day</span>
                    )}
                </div>
                <div className="flex space-x-3">
                    {property.ownerId && user?.id !== property.ownerId && (
                        <Button variant="outline" className="border-foreground/30" onClick={() => setIsMessageAgentModalOpen(true)}>
                            Message Agent
                        </Button>
                    )}
                    <Button variant="outline" className="border-foreground/30" onClick={handleScheduleVisit}>
                        {isBnB ? 'Book Now' : 'Schedule Visit'}
                    </Button>
                    <Button variant="default" className="bg-accent hover:bg-accent/90" onClick={handleViewTour}>
                        {isBnB ? 'View Virtual Tour' : 'View Virtual Tour'}
                    </Button>
                </div>
            </div>

            {property.ownerId && (
                <MessageAgentModal
                    isOpen={isMessageAgentModalOpen}
                    onClose={() => setIsMessageAgentModalOpen(false)}
                    propertyId={property.id}
                    propertyTitle={property.title}
                    ownerId={property.ownerId}
                />
            )}

            {/* Design-review fix (round 2): the trust/credibility review
                flagged that "Schedule Visit" / "Book Now" gave no indication
                of what happens next or how to know you're dealing with the
                verified agent — exactly the hesitation point for a
                scam-wary first-time visitor. One honest, real line, linking
                to the platform's actual existing Trust & Safety page rather
                than inventing a new policy. */}
            <p className="text-sm text-muted-foreground mb-8 flex items-center gap-1.5">
                <i className="fas fa-shield-halved text-xs"></i>
                You'll be contacted by the listing agent to arrange next steps.{' '}
                <a href="/trust-safety" className="text-accent hover:underline">
                    Read our safety guidance
                </a>{' '}
                before paying any deposit outside the platform.
            </p>

            {/* Show owner contact details section for BnBs */}
            {isBnB && (
                <div className="mt-8 border-t border-border pt-8">
                    <h3 className="text-xl font-display font-medium mb-4 text-foreground">Property Owner</h3>
                    <OwnerContactDetails property={property} bookingConfirmed={bookingConfirmed} owner={propertyOwner} />
                </div>
            )}

            {/* Booking calendar visibility, always shown for BnBs (never
                behind the booking-deposit gate — it's just occupied date
                ranges, no contact info) so a prospective booker can check
                availability before booking, and the host/landlord/manager
                can open this same page to see occupancy for maintenance
                planning. See BnbAvailabilityCalendar's own doc comment. */}
            {isBnB && (
                <div className="mt-8 border-t border-border pt-8">
                    <h3 className="text-xl font-display font-medium mb-4 text-foreground">Availability</h3>
                    <BnbAvailabilityCalendar propertyId={property.id} />
                </div>
            )}

            {/* Rental unit: once they've paid to view (requiresTourPayment
                gate has already resolved above), invite them to pay rent
                via RentRail - a distinct, later intent signal from paying
                to view, and the only thing that reveals the landlord/
                manager's own contact (see RentPaymentPrompt's own comment). */}
            {requiresTourPayment && hasValidPayment && (
                <div className="mt-8 border-t border-border pt-8">
                    <RentPaymentPrompt property={property} />
                </div>
            )}

            <SimilarProperties property={property} />

            {/* Booking Calendar Modal */}
            <BookingCalendarModal
                isOpen={isBookingModalOpen}
                onClose={() => setIsBookingModalOpen(false)}
                propertyId={property.id}
                propertyTitle={property.title}
                propertyCategory={isBnB ? 'BnB' : property.category || 'rental'}
                propertyPrice={property.price}
                propertyCurrency={property.currency || 'UGX'}
                owner={propertyOwner}
            />

            {/* Virtual Tour Modal */}
            <VirtualTourModal
                isOpen={isTourModalOpen}
                onClose={() => setIsTourModalOpen(false)}
                propertyTitle={property.title}
                tourUrl={property.tourUrl || undefined}
                previewSeconds={requiresTourPayment && !hasValidPayment ? 5 : undefined}
                onPreviewExpired={handleTourPreviewExpired}
            />

            {/* Tour Payment Modal */}
            <TourPaymentModal
                isOpen={isTourPaymentModalOpen}
                onClose={() => setIsTourPaymentModalOpen(false)}
                property={property}
                onPaymentSuccess={handleTourPaymentSuccess}
            />
        </div>
    )
}
