import { useTour } from '@reactour/tour'
import { useEffect } from 'react'
import { useOnboarding } from './TourProvider'

const steps = [
    {
        selector: '[data-tour="dashboard-metrics"]',
        content: (
            <div>
                <h3 className="font-semibold text-base mb-1">📈 Key Metrics</h3>
                <p className="text-sm text-gray-600">
                    View your revenue, total views, active bookings, and earnings trend at
                    a glance.
                </p>
            </div>
        ),
    },
    {
        selector: '[data-tour="upcoming-bookings"]',
        content: (
            <div>
                <h3 className="font-semibold text-base mb-1">🗓️ Upcoming Bookings</h3>
                <p className="text-sm text-gray-600">
                    See all upcoming viewings and bookings. Confirm or reschedule
                    appointments directly from here.
                </p>
            </div>
        ),
    },
    {
        selector: '[data-tour="messages-notifications"]',
        content: (
            <div>
                <h3 className="font-semibold text-base mb-1">🔔 Messages & Notifications</h3>
                <p className="text-sm text-gray-600">
                    Stay informed with real-time notifications for payments, bookings, and
                    messages from potential renters.
                </p>
            </div>
        ),
    },
]

export function DashboardTour() {
    const { setSteps, setIsOpen, setCurrentStep } = useTour()
    const { isOpen, activeTour, closeTour } = useOnboarding()

    const active = activeTour === 'dashboard' && isOpen

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
