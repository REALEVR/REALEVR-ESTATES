import { useTour } from '@reactour/tour'
import { useEffect } from 'react'
import { useOnboarding } from './TourProvider'

const steps = [
    {
        selector: '[data-tour="search-bar"]',
        content: (
            <div>
                <h3 className="font-semibold text-base mb-1">🔍 Search Properties</h3>
                <p className="text-sm text-gray-600">
                    Use the search bar and filters to find properties by location, price
                    range, type, and amenities.
                </p>
            </div>
        ),
    },
    {
        selector: '[data-tour="property-card"]',
        content: (
            <div>
                <h3 className="font-semibold text-base mb-1">🏠 Browse Listings</h3>
                <p className="text-sm text-gray-600">
                    Click on any property card to see detailed photos, a virtual tour, and
                    full property information.
                </p>
            </div>
        ),
    },
    {
        selector: '[data-tour="book-viewing"]',
        content: (
            <div>
                <h3 className="font-semibold text-base mb-1">📅 Schedule a Viewing</h3>
                <p className="text-sm text-gray-600">
                    Pick a date and time to visit the property in person, or use instant
                    booking for immediate confirmation.
                </p>
            </div>
        ),
    },
    {
        selector: '[data-tour="payment-section"]',
        content: (
            <div>
                <h3 className="font-semibold text-base mb-1">💳 Secure Payment</h3>
                <p className="text-sm text-gray-600">
                    Pay your deposit securely via Flutterwave or mobile money. Your funds
                    are held in escrow until the booking is confirmed.
                </p>
            </div>
        ),
    },
    {
        selector: '[data-tour="user-dashboard"]',
        content: (
            <div>
                <h3 className="font-semibold text-base mb-1">📋 Your Dashboard</h3>
                <p className="text-sm text-gray-600">
                    Track all your bookings, documents, and messages in one place. You can
                    also re-watch virtual tours you've purchased here.
                </p>
            </div>
        ),
    },
]

export function RenterTour() {
    const { setSteps, setIsOpen, setCurrentStep } = useTour()
    const { isOpen, activeTour, closeTour } = useOnboarding()

    const active = activeTour === 'renter' && isOpen

    useEffect(() => {
        if (active) {
            setSteps?.(steps)
            setCurrentStep(0)
            setIsOpen(true)
        } else {
            setIsOpen(false)
        }
    }, [active]) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!active) return

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                closeTour()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [active, closeTour])

    return null
}
