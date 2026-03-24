import React, { useState, useEffect } from 'react'
import { X, ChevronRight, ChevronLeft, LayoutDashboard, Bell, CreditCard, BarChart3, Settings, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'

interface TourStep {
    title: string
    description: string
    icon: React.ReactNode
    highlight?: string
}

const dashboardSteps: TourStep[] = [
    {
        title: 'Your Dashboard 📊',
        description:
            'This is your command center. From here you can manage all your activities on REALEVR Estates — bookings, payments, properties, and more.',
        icon: <LayoutDashboard className="h-8 w-8 text-primary" />,
    },
    {
        title: 'Notifications',
        description:
            'The bell icon in the top navigation shows your real-time notifications. You\'ll get alerts for payment confirmations, booking updates, and property activity.',
        icon: <Bell className="h-8 w-8 text-orange-500" />,
        highlight: 'Look for the 🔔 bell icon in the top navigation bar',
    },
    {
        title: 'Payment History',
        description:
            'View all your payment transactions in one place. See which gateway was used, transaction references, and payment status for every transaction.',
        icon: <CreditCard className="h-8 w-8 text-green-500" />,
    },
    {
        title: 'Gateway Selection',
        description:
            'When making payments, you can choose between Flutterwave and iOTECT. Both support Mobile Money and cards. We automatically fall back if one gateway is unavailable.',
        icon: <span className="text-3xl">💳</span>,
        highlight: 'Both gateways are always available for maximum reliability',
    },
    {
        title: 'Analytics & Reports',
        description:
            'Track your property performance, viewing statistics, and payment analytics. Make data-driven decisions to optimize your listings.',
        icon: <BarChart3 className="h-8 w-8 text-blue-500" />,
    },
    {
        title: 'Profile Settings',
        description:
            'Update your profile, contact information, and notification preferences. Keep your details up to date for the best experience.',
        icon: <Settings className="h-8 w-8 text-gray-500" />,
    },
    {
        title: 'Dashboard Mastered! 🏆',
        description:
            'You now know all the key features of your dashboard. Explore freely and reach out to our support team if you need help.',
        icon: <Check className="h-8 w-8 text-green-500" />,
    },
]

interface DashboardTourProps {
    onComplete?: () => void
    onSkip?: () => void
}

export function DashboardTour({ onComplete, onSkip }: DashboardTourProps) {
    const { user } = useAuth()
    const [currentStep, setCurrentStep] = useState(0)
    const [isVisible, setIsVisible] = useState(false)

    useEffect(() => {
        if (user) {
            const tourKey = `dashboard_tour_completed_${user.id}`
            if (!localStorage.getItem(tourKey)) {
                const timer = setTimeout(() => setIsVisible(true), 2000)
                return () => clearTimeout(timer)
            }
        }
    }, [user])

    const handleNext = () => {
        if (currentStep < dashboardSteps.length - 1) {
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
            localStorage.setItem(`dashboard_tour_completed_${user.id}`, 'true')
        }
        setIsVisible(false)
        onComplete?.()
    }

    const handleSkip = () => {
        if (user) {
            localStorage.setItem(`dashboard_tour_completed_${user.id}`, 'true')
        }
        setIsVisible(false)
        onSkip?.()
    }

    if (!isVisible) return null

    const step = dashboardSteps[currentStep]
    const isLastStep = currentStep === dashboardSteps.length - 1

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
                {/* Progress bar */}
                <div className="h-1.5 bg-gray-100">
                    <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${((currentStep + 1) / dashboardSteps.length) * 100}%` }}
                    />
                </div>

                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-4 pb-2">
                    <span className="text-xs text-gray-500 font-medium">
                        Step {currentStep + 1} of {dashboardSteps.length}
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
                        {step.highlight && (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2 text-sm text-yellow-800 w-full text-left">
                                <span className="font-medium">💡 Tip: </span>{step.highlight}
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
                            {isLastStep ? 'Done' : 'Next'}
                            {!isLastStep && <ChevronRight className="h-4 w-4" />}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default DashboardTour
