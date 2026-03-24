/**
 * OnboardingTour orchestrator.
 *
 * Renders the appropriate tour component based on the active tour type.
 * Wrap your app (or a page) with <OnboardingTour /> to enable guided tours.
 */

export { OnboardingTourProvider, useOnboarding } from './TourProvider'
export { PropertyOwnerTour } from './PropertyOwnerTour'
export { RenterTour } from './RenterTour'
export { DashboardTour } from './DashboardTour'

import { useOnboarding } from './TourProvider'
import { PropertyOwnerTour } from './PropertyOwnerTour'
import { RenterTour } from './RenterTour'
import { DashboardTour } from './DashboardTour'

export function OnboardingTour() {
    const { activeTour } = useOnboarding()

    if (activeTour === 'propertyOwner') return <PropertyOwnerTour />
    if (activeTour === 'renter') return <RenterTour />
    if (activeTour === 'dashboard') return <DashboardTour />
    return null
}
