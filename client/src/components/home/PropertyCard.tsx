import { useState, useEffect } from 'react'
import { Link } from 'wouter'
import type { Property, User } from '@shared/schema'
import SharePropertyModal from '../property/SharePropertyModal'
import BookingCalendarModal from '../property/BookingCalendarModal'
import PaymentModal from '../property/PaymentModal'
import TourPaymentModal from '../property/TourPaymentModal'
import { usePropertyViews } from '@/hooks/usePropertyViews'
import { Button } from '@/components/ui/button'
import { AnimatedCard, FadeIn } from '@/components/ui/animated-components'
import { Phone } from 'lucide-react'

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
        // setIsShareModalOpen(true)
    }

    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
    const { viewedProperties, hasValidPayment } = usePropertyViews()

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
        // Close payment modal and redirect to property page
        setIsTourPaymentModalOpen(false)
        window.location.href = `/property/${property.id}`
    }

    const handleCardClick = (e: React.MouseEvent) => {
        // Don't trigger if clicking on buttons or interactive elements
        if ((e.target as HTMLElement).closest('button')) {
            return
        }

        // Only rental properties require payment for tour viewing
        // BnBs can view tours for free, but need to pay 20% to book
        const requiresPayment =
            property.category === 'rental_units' ||
            property.category === 'furnished_houses' ||
            property.propertyType === 'Furnished Rental'

        if (requiresPayment) {
            setIsTourPaymentModalOpen(true)
        } else {
            // For BnBs, for_sale, etc., navigate directly to property page
            window.location.href = `/property/${property.id}`
        }
    }

    return (
        <>
            <AnimatedCard
                data-tour="property-card"
                className="property-card bg-white rounded-xl overflow-hidden shadow-md cursor-pointer hover:shadow-lg transition-shadow duration-300"
                onClick={handleCardClick}
            >
                <div className="relative">
                    <FadeIn>
                        <img
                            src={property.imageUrl}
                            alt={property.title}
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
                            <i className={`${isFavorite ? 'fas text-[#FF5A5F]' : 'far'} fa-heart`}></i>
                        </button>
                    </div>
                    {property.isAvailable !== undefined && (
                        <div className="absolute top-3 left-3 z-10">
                            <span
                                className={`flex items-center text-xs font-medium rounded-full px-2 py-1 ${
                                    property.isAvailable ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
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
                        <span className="absolute bottom-3 left-3 bg-black/50 text-white px-2 py-1 rounded-md text-sm font-medium z-10">
                            360° Tour Available
                        </span>
                    )}
                </div>
                <div className="p-4">
                    <div className="flex justify-between items-start">
                        <h3 className="font-bold">{property.title}</h3>
                        <div className="flex items-center">
                            <i className="fas fa-eye text-gray-500 text-sm"></i>
                            <span className="ml-1 text-sm font-medium text-gray-600">{property.viewCount || 0}</span>
                        </div>
                    </div>
                    <p className="text-gray-500 text-sm mb-2">{property.location}</p>
                    <p className="text-gray-500 text-sm mb-3">
                        {property.bedrooms} bed • {property.bathrooms} bath • {property.squareMeters} sq m
                    </p>

                    {/* Property Owner Contact */}
                    {propertyOwner && (
                        <div className="mb-3 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-100">
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center mb-1">
                                        <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center mr-2">
                                            <span className="text-xs font-semibold text-blue-600">
                                                {propertyOwner.fullName?.charAt(0)?.toUpperCase() || 'A'}
                                            </span>
                                        </div>
                                        <span className="text-xs font-semibold text-gray-800">
                                            {propertyOwner.fullName}
                                        </span>
                                    </div>
                                    <div className="text-xs text-blue-600 font-medium mb-1">
                                        {propertyOwner.role === 'agent' ? 'Property Agent' : 'Property Manager'}
                                    </div>
                                    {propertyOwner.companyName && (
                                        <div className="text-xs text-gray-600 mb-1">{propertyOwner.companyName}</div>
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
                            <span className="font-bold">
                                {property.price != null ? (
                                    property.price.toLocaleString()
                                ) : (
                                    <span className="text-gray-400">N/A</span>
                                )}{' '}
                                {property.currency || 'UGX'}
                            </span>
                            {property.category === 'rental_units' && (
                                <span className="text-gray-500 text-sm"> / month</span>
                            )}
                            {(property.category === 'furnished_houses' || property.category === 'BnB') && (
                                <span className="text-gray-500 text-sm"> / day</span>
                            )}
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        className="w-full text-sm h-8 border-[#00A699] text-[#00A699] hover:bg-[#00A699]/5 hover:text-gray-800 transition-colors"
                        onClick={(e) => {
                            // Only rental properties require payment for tour viewing
                            // BnBs can view tours for free, but need to pay 20% to book
                            const requiresPayment =
                                property.category === 'rental_units' ||
                                property.category === 'furnished_houses' ||
                                property.propertyType === 'Furnished Rental'

                            if (requiresPayment) {
                                setIsTourPaymentModalOpen(true)
                            } else {
                                // For BnBs, for_sale, etc., navigate directly to property page
                                window.location.href = `/property/${property.id}`
                            }
                        }}
                    >
                        <i className="fas fa-eye mr-2"></i>
                        View Tour
                    </Button>
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
