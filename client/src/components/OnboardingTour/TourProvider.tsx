import React, { createContext, useContext, useEffect } from 'react'
import { TourProvider as ReactTourProvider } from '@reactour/tour'
import { useTourState, type TourType } from '@/hooks/useTourState'
import { useAuth } from '@/hooks/use-auth'

// ─── Context ──────────────────────────────────────────────────────────────────

interface OnboardingContextValue {
    activeTour: TourType
    isOpen: boolean
    startTour: (type: TourType) => void
    closeTour: () => void
    completeTour: (type: 'propertyOwner' | 'renter' | 'dashboard') => void
    hasCompletedTour: (type: 'propertyOwner' | 'renter' | 'dashboard') => boolean
    resetTour: (type: 'propertyOwner' | 'renter' | 'dashboard') => void
    resetAllTours: () => void
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null)

export function useOnboarding(): OnboardingContextValue {
    const ctx = useContext(OnboardingContext)
    if (!ctx) throw new Error('useOnboarding must be used inside OnboardingTourProvider')
    return ctx
}

// ─── Provider ─────────────────────────────────────────────────────────────────

interface Props {
    children: React.ReactNode
}

export function OnboardingTourProvider({ children }: Props) {
    const tourState = useTourState()
    const { user } = useAuth()

    // Auto-trigger tour on first login based on user role
    useEffect(() => {
        if (!user) return

        const role = (user as { role?: string }).role ?? 'normal'

        if (role === 'agent' && !tourState.hasCompletedTour('propertyOwner')) {
            // Small delay so the UI is fully rendered
            const t = setTimeout(() => tourState.startTour('propertyOwner'), 1200)
            return () => clearTimeout(t)
        }

        if (role === 'normal' && !tourState.hasCompletedTour('renter')) {
            const t = setTimeout(() => tourState.startTour('renter'), 1200)
            return () => clearTimeout(t)
        }
    }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <OnboardingContext.Provider value={tourState}>
            <ReactTourProvider steps={[]} onClickClose={tourState.closeTour}>
                {children}
            </ReactTourProvider>
        </OnboardingContext.Provider>
    )
}
