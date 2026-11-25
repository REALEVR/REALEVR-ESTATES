import { useEffect, useMemo, useState } from 'react'
import { History } from 'lucide-react'
import PropertyCard from '@/components/home/PropertyCard'
import { useProperties } from '@/hooks/usePropertyData'
import { readRecentlyViewed, recordRecentlyViewed } from '@/lib/recentlyViewed'
import type { Property } from '@shared/schema'

const STRIP_SIZE = 4

interface RecentlyViewedProps {
    /** The property being viewed now: recorded, and left out of the strip. */
    currentPropertyId: number
}

/**
 * "Recently viewed" strip under a listing, so a visitor comparing homes can
 * jump back without searching again. Ids come from this device only
 * (lib/recentlyViewed.ts); cards are drawn from the already-cached
 * /api/properties list, so listings removed since the visit just drop out.
 * Renders nothing until there is at least one other home to show.
 */
export default function RecentlyViewed({ currentPropertyId }: RecentlyViewedProps) {
    // Read before recording, so the strip shows the homes seen before this one.
    const [recentIds, setRecentIds] = useState<number[]>(() => readRecentlyViewed())
    const { data: allProperties } = useProperties()

    useEffect(() => {
        if (!currentPropertyId) return
        setRecentIds(recordRecentlyViewed(currentPropertyId))
    }, [currentPropertyId])

    const recent = useMemo(() => {
        if (!allProperties) return []
        const byId = new Map<number, Property>(allProperties.map((p) => [p.id, p]))
        return recentIds
            .filter((id) => id !== currentPropertyId)
            .map((id) => byId.get(id))
            .filter((p): p is Property => !!p && !!p.title?.trim())
            .slice(0, STRIP_SIZE)
    }, [allProperties, recentIds, currentPropertyId])

    if (recent.length === 0) return null

    return (
        <section aria-labelledby="recently-viewed-heading" className="mt-12 border-t border-border pt-8">
            <h2
                id="recently-viewed-heading"
                className="text-xl font-display font-medium mb-4 text-foreground flex items-center gap-2"
            >
                <History className="h-5 w-5 text-accent" aria-hidden="true" /> Recently viewed
            </h2>
            {/* Swipeable row on phones, a plain grid from tablet width up. */}
            <ul className="-mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-6 sm:overflow-visible sm:px-0 lg:grid-cols-4">
                {recent.map((p) => (
                    <li key={p.id} className="w-[78%] shrink-0 snap-start sm:w-auto">
                        <PropertyCard property={p} />
                    </li>
                ))}
            </ul>
        </section>
    )
}
