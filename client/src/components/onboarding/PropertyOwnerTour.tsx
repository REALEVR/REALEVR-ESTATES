import React, { useState, useEffect } from 'react'
import { X, ChevronRight, ChevronLeft, Home, Camera, DollarSign, BarChart3, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'

interface TourStep {
    title: string
    description: string
    icon: React.ReactNode
    tip?: string
}

const propertyOwnerSteps: TourStep[] = [
    {
        title: 'Welcome to REALEVR Estates! 🏡',
        description:
            'Welcome to your property management dashboard. As a property owner or agent, you have powerful tools to list, manage, and grow your property portfolio.',
        icon: <Home className="h-8 w-8 text-primary" />,
    },
    {
        title: 'List Your Property',
        description:
            'Start by adding your property details. Include accurate information about bedrooms, bathrooms, location, and pricing to attract the right tenants.',
        icon: <Home className="h-8 w-8 text-blue-500" />,
        tip: '💡 Properties with complete details get 3x more views',
    },
    {
        title: 'Add Virtual Tours',
        description:
            'Upload 360° virtual tour files to give potential tenants an immersive viewing experience without leaving their home. This dramatically increases booking rates.',
        icon: <Camera className="h-8 w-8 text-purple-500" />,
        tip: '💡 Properties with virtual tours get 40% more inquiries',
    },
    {
        title: 'AI-Powered Descriptions',
        description:
            'Use our AI assistant to generate professional property descriptions automatically. Just provide the basic details and let AI craft compelling copy.',
        icon: <span className="text-3xl">🤖</span>,
        tip: '💡 AI descriptions are optimized for search engines',
    },
    {
        title: 'Receive Payments',
        description:
            'Accept payments securely through Flutterwave or iOTECT. Both gateways support Mobile Money, Card payments, and USSD for maximum accessibility.',
        icon: <DollarSign className="h-8 w-8 text-green-500" />,
        tip: '💡 Enable both gateways for 99.9% payment success rate',
    },
    {
        title: 'Track Analytics',
        description:
            'Monitor your property performance with detailed analytics. See view counts, inquiry rates, payment history, and more in real-time.',
        icon: <BarChart3 className="h-8 w-8 text-orange-500" />,
    },
    {
        title: 'You\'re All Set! 🎉',
        description:
            'You\'re ready to start managing your properties on REALEVR Estates. Our team is here to support you every step of the way.',
        icon: <Check className="h-8 w-8 text-green-500" />,
    },
]

interface PropertyOwnerTourProps {
    onComplete?: () => void
    onSkip?: () => void
}

export function PropertyOwnerTour({ onComplete, onSkip }: PropertyOwnerTourProps) {
    const { user } = useAuth()
    const [currentStep, setCurrentStep] = useState(0)
    const [isVisible, setIsVisible] = useState(false)

    useEffect(() => {
        if (user && (user.role === 'agent' || user.role === 'admin')) {
            const tourCompleted = localStorage.getItem(`owner_tour_completed_${user.id}`)
            if (!tourCompleted) {
                // Small delay before showing the tour
                const timer = setTimeout(() => setIsVisible(true), 1000)
                return () => clearTimeout(timer)
            }
        }
    }, [user])

    const handleNext = () => {
        if (currentStep < propertyOwnerSteps.length - 1) {
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
            localStorage.setItem(`owner_tour_completed_${user.id}`, 'true')
        }
        setIsVisible(false)
        onComplete?.()
    }

    const handleSkip = () => {
        if (user) {
            localStorage.setItem(`owner_tour_completed_${user.id}`, 'true')
        }
        setIsVisible(false)
        onSkip?.()
    }

    if (!isVisible) return null

    const step = propertyOwnerSteps[currentStep]
    const isLastStep = currentStep === propertyOwnerSteps.length - 1

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
                {/* Progress bar */}
                <div className="h-1.5 bg-gray-100">
                    <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${((currentStep + 1) / propertyOwnerSteps.length) * 100}%` }}
                    />
                </div>

                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-4 pb-2">
                    <span className="text-xs text-gray-500 font-medium">
                        Step {currentStep + 1} of {propertyOwnerSteps.length}
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
                            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800 w-full">
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

                        <button
                            onClick={handleSkip}
                            className="text-xs text-gray-400 hover:text-gray-600"
                        >
                            Skip tour
                        </button>

                        <Button size="sm" onClick={handleNext} className="gap-1">
                            {isLastStep ? 'Get Started' : 'Next'}
                            {!isLastStep && <ChevronRight className="h-4 w-4" />}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default PropertyOwnerTour
