import { Link } from 'wouter'
import { useMemo } from 'react'
import PropertyCard from './PropertyCard'
import { useProperties } from '@/hooks/usePropertyData'
import { useCountrySpotInfo } from '@/hooks/useCountrySpots'

/**
 * "Promoted in Kenya": the listings whose owners bought a spot for their country (server/gene/country-spots.ts).
 * Says plainly that these are paid places. Shows nothing at all when no spot is live, so an empty country does not get
 * an empty shelf; the owner's invitation to take a spot appears only where spots are open and free.
 */
export default function CountrySpotsStrip({ country, showInvite = false }: { country: string; showInvite?: boolean }) {
    const { data: info } = useCountrySpotInfo(country)
    const { data: all } = useProperties()
    const promoted = useMemo(() => {
        const byId = new Map((all ?? []).map((p) => [p.id, p]))
        return (info?.propertyIds ?? []).map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p && p.isAvailable !== false)
    }, [all, info])

    const invite = showInvite && info?.open && info.free > 0
    if (!info || (promoted.length === 0 && !invite)) return null

    return (
        <section className="py-6 md:py-8" aria-label={`Promoted in ${info.name}`}>
            <div className="mx-auto max-w-[1500px] px-0 md:px-8">
                <div className="mb-4 flex items-end justify-between gap-4 md:mb-6">
                    <div>
                        <h2 className="section-title">Promoted in {info.name}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">Paid places, bought by owners in {info.name}.</p>
                    </div>
                    {invite && (
                        <Link href="/promotions" className="shrink-0 text-sm font-semibold text-foreground underline underline-offset-4">
                            {info.free} {info.free === 1 ? 'spot' : 'spots'} open
                        </Link>
                    )}
                </div>
                {promoted.length > 0 && (
                    <div className="rail">
                        {promoted.map((p) => (
                            <PropertyCard key={p.id} property={p} />
                        ))}
                    </div>
                )}
            </div>
        </section>
    )
}
