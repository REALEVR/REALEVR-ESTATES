import React, { useState, useEffect } from 'react'
import { X, ChevronRight, ChevronLeft, Search, Eye, CreditCard, Bell, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'

interface TourStep {
    title: string
    description: string
    icon: React.ReactNode
    tip?: string
}

const renterSteps: TourStep[] = [
    {
        title: 'Welcome to REALEVR Estates! 🏠',
        description:
            'Find your perfect home or investment property in Uganda. Browse thousands of listings with virtual tours, real photos, and verified details.',
        icon: <span className="text-4xl">🏠</span>,
    },
    {
        title: 'Search & Filter',
        description:
            'Use our powerful search to find properties by location, price, type, and amenities. Filter by BnBs, rental units, properties for sale, or bank sales.',
        icon: <Search className="h-8 w-8 text-blue-500" />,
        tip: '💡 Save searches to get notified when new matching properties are listed',
    },
    {
        title: 'Virtual Tours',
        description:
            'Experience properties in 360° before visiting in person. Many of our listings include immersive virtual tours so you can explore every corner remotely.',
        icon: <Eye className="h-8 w-8 text-purple-500" />,
        tip: '💡 Virtual tours save you time and help you make better decisions',
    },
    {
        title: 'Book a Viewing',
        description:
            'Found a property you like? Schedule a physical viewing directly through the platform. Pay a small viewing fee to confirm your appointment.',
        icon: <span className="text-3xl">📅</span>,
        tip: '💡 Viewings are refunded if the property doesn\'t match the listing',
    },
    {
        title: 'Secure Payment',
        description:
            'Pay your deposit or rent securely using Mobile Money, Card, or USSD through Flutterwave or iOTECT. All transactions are encrypted and protected.',
        icon: <CreditCard className="h-8 w-8 text-green-500" />,
        tip: '💡 Deposits are held in escrow until you confirm move-in',
    },
    {
        title: 'Stay Updated',
        description:
            'Get real-time notifications about your bookings, payments, and property updates. We\'ll keep you informed every step of the way.',
        icon: <Bell className="h-8 w-8 text-orange-500" />,
    },
    {
        title: 'Ready to Explore! 🎉',
        description:
            'Start browsing properties and find your next home. Our team is available to help you with any questions.',
        icon: <Check className="h-8 w-8 text-green-500" />,
    },
]

interface RenterTourProps {
    onComplete?: () => void
    onSkip?: () => void
}

export function RenterTour({ onComplete, onSkip }: RenterTourProps) {
    const { user } = useAuth()
    const [currentStep, setCurrentStep] = useState(0)
    const [isVisible, setIsVisible] = useState(false)

    useEffect(() => {
        if (user && user.role === 'normal') {
            const tourKey = `renter_tour_completed_${user.id}`
            if (!localStorage.getItem(tourKey)) {
                const timer = setTimeout(() => setIsVisible(true), 1500)
                return () => clearTimeout(timer)
            }
        }
    }, [user])

    const handleNext = () => {
        if (currentStep < renterSteps.length - 1) {
            setCurrentStep((prev) => prev + 1)
        } else {
            handleComplete()
        }
    }

    const handlePrev = () => {
        if (currentStep > 0) {
            setCurrentStep((prev) => prev - 1)
        }
    }

    const handleComplete = () => {
        if (user) {
            localStorage.setItem(`renter_tour_completed_${user.id}`, 'true')
        }
        setIsVisible(false)
        onComplete?.()
    }

    const handleSkip = () => {
        if (user) {
            localStorage.setItem(`renter_tour_completed_${user.id}`, 'true')
        }
        setIsVisible(false)
        onSkip?.()
    }

    if (!isVisible) return null

    const step = renterSteps[currentStep]
    const isLastStep = currentStep === renterSteps.length - 1

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
                {/* Progress bar */}
                <div className="h-1.5 bg-gray-100">
                    <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${((currentStep + 1) / renterSteps.length) * 100}%` }}
                    />
                </div>

                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-4 pb-2">
                    <span className="text-xs text-gray-500 font-medium">
                        Step {currentStep + 1} of {renterSteps.length}
                    </span>
                    <button
                        onClick={handleSkip}
                        className="p-1 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Content */}
                <div className="px-6 pb-6">
                    <div className="flex flex-col items-center text-center gap-4 py-4">
                        <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center">
                            {step.icon}
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-gray-900 mb-2">{step.title}</h3>
                            <p className="text-gray-600 text-sm leading-relaxed">{step.description}</p>
                        </div>
                        {step.tip && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm text-blue-800 w-full">
                                {step.tip}
                            </div>
                        )}
                    </div>

                    {/* Navigation */}
                    <div className="flex items-center justify-between mt-4">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handlePrev}
                            disabled={currentStep === 0}
                            className="gap-1"
                        >
                            <ChevronLeft className="h-4 w-4" />
                            Back
                        </Button>

                        <button onClick={handleSkip} className="text-xs text-gray-400 hover:text-gray-600">
                            Skip tour
                        </button>

                        <Button size="sm" onClick={handleNext} className="gap-1">
                            {isLastStep ? 'Start Exploring' : 'Next'}
                            {!isLastStep && <ChevronRight className="h-4 w-4" />}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default RenterTour
