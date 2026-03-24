import { useTour } from '@reactour/tour'
import { useEffect } from 'react'
import { useOnboarding } from './TourProvider'

const steps = [
    {
        selector: '[data-tour="dashboard-stats"]',
        content: (
            <div>
                <h3 className="font-semibold text-base mb-1">📊 Dashboard Overview</h3>
                <p className="text-sm text-gray-600">
                    Here you can see all your key metrics — total listings, views, and
                    earnings at a glance.
                </p>
            </div>
        ),
    },
    {
        selector: '[data-tour="create-listing"]',
        content: (
            <div>
                <h3 className="font-semibold text-base mb-1">➕ Create a Listing</h3>
                <p className="text-sm text-gray-600">
                    Click this button to add a new property. You can upload photos, a
                    virtual tour, and set pricing.
                </p>
            </div>
        ),
    },
    {
        selector: '[data-tour="property-pricing"]',
        content: (
            <div>
                <h3 className="font-semibold text-base mb-1">💰 Set Your Price</h3>
                <p className="text-sm text-gray-600">
                    Set monthly rent or sale price, choose availability dates, and write an
                    engaging description to attract renters.
                </p>
            </div>
        ),
    },
    {
        selector: '[data-tour="publish-listing"]',
        content: (
            <div>
                <h3 className="font-semibold text-base mb-1">🚀 Publish Your Listing</h3>
                <p className="text-sm text-gray-600">
                    Once everything looks good, publish your property and it will be live
                    for renters to find and book!
                </p>
            </div>
        ),
    },
]

export function PropertyOwnerTour() {
    const { setSteps, setIsOpen, setCurrentStep } = useTour()
    const { isOpen, activeTour, completeTour, closeTour } = useOnboarding()

    const active = activeTour === 'propertyOwner' && isOpen

    useEffect(() => {
        if (active) {
            setSteps?.(steps)
            setCurrentStep(0)
            setIsOpen(true)
        } else {
            setIsOpen(false)
        }
    }, [active]) // eslint-disable-line react-hooks/exhaustive-deps

    // Listen for tour close/complete events via the ReactTour context
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
