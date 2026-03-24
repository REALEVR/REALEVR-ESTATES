import { useState, useEffect, useCallback } from 'react'

export type TourType = 'propertyOwner' | 'renter' | 'dashboard' | null

const STORAGE_KEYS = {
    propertyOwner: 'realevr_tour_propertyOwner_done',
    renter: 'realevr_tour_renter_done',
    dashboard: 'realevr_tour_dashboard_done',
}

export function useTourState() {
    const [activeTour, setActiveTour] = useState<TourType>(null)
    const [isOpen, setIsOpen] = useState(false)

    const hasCompletedTour = useCallback((type: keyof typeof STORAGE_KEYS): boolean => {
        return localStorage.getItem(STORAGE_KEYS[type]) === 'true'
    }, [])

    const markTourComplete = useCallback((type: keyof typeof STORAGE_KEYS) => {
        localStorage.setItem(STORAGE_KEYS[type], 'true')
    }, [])

    const resetTour = useCallback((type: keyof typeof STORAGE_KEYS) => {
        localStorage.removeItem(STORAGE_KEYS[type])
    }, [])

    const resetAllTours = useCallback(() => {
        Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key))
    }, [])

    const startTour = useCallback((type: TourType) => {
        setActiveTour(type)
        setIsOpen(true)
    }, [])

    const closeTour = useCallback(() => {
        setIsOpen(false)
        setActiveTour(null)
    }, [])

    const completeTour = useCallback(
        (type: keyof typeof STORAGE_KEYS) => {
            markTourComplete(type)
            closeTour()
        },
        [markTourComplete, closeTour],
    )

    return {
        activeTour,
        isOpen,
        hasCompletedTour,
        startTour,
        closeTour,
        completeTour,
        resetTour,
        resetAllTours,
    }
}
