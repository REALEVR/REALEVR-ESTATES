import { useMemo, useState } from 'react'
import { Lock, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useProperties } from '@/hooks/usePropertyData'
import { useSimilarPropertiesPass } from '@/hooks/useSimilarPropertiesPass'
import PropertyCard from '@/components/home/PropertyCard'
import SimilarPropertiesPaymentModal from './SimilarPropertiesPaymentModal'
import { SIMILAR_PROPERTIES_PASS_PRICE_UGX } from '@shared/pricing'
import type { Property } from '@shared/schema'

const BUDGET_TOLERANCE = 0.25 // ±25% of the current property's price counts as "in budget"

interface SimilarPropertiesProps {
    property: Property
}

/**
 * "Let someone be required to pay a fee of 20,000 [UGX] to view similar
 * properties in the person's budget." Similar = same category, price
 * within ±25% of this property's price, excluding this property itself.
 * Locked behind SimilarPropertiesPaymentModal.tsx until an active pass
 * exists (server/gene/similar-properties-pass.ts) — real candidate count
 * shown on the locked teaser, never a fabricated number.
 */
export default function SimilarProperties({ property }: SimilarPropertiesProps) {
    const { data: allProperties } = useProperties()
    const passQuery = useSimilarPropertiesPass(true)
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)

    const candidates = useMemo(() => {
        if (!allProperties || property.price == null) return []
        const minPrice = property.price * (1 - BUDGET_TOLERANCE)
        const maxPrice = property.price * (1 + BUDGET_TOLERANCE)
        return allProperties.filter(
            (p) =>
                p.id !== property.id &&
                p.title &&
                p.title.trim() !== '' &&
                p.category === property.category &&
                p.price != null &&
                p.price >= minPrice &&
                p.price <= maxPrice
        )
    }, [allProperties, property.id, property.price, property.category])

    // Nothing to show either way — don't render an empty/locked section
    // promising properties that don't exist.
    if (candidates.length === 0) return null

    const isUnlocked = passQuery.data?.active === true

    return (
        <div className="mt-8 border-t border-border pt-8">
            <h3 className="text-xl font-display font-medium mb-4 text-foreground flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-accent" /> Similar Properties in Your Budget
            </h3>

            {isUnlocked ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {candidates.slice(0, 6).map((p) => (
                        <PropertyCard key={p.id} property={p} />
                    ))}
                </div>
            ) : (
                <div className="relative rounded-xl border border-border overflow-hidden">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 p-4 blur-sm select-none pointer-events-none">
                        {candidates.slice(0, 3).map((p) => (
                            <PropertyCard key={p.id} property={p} />
                        ))}
                    </div>
                    <div className="absolute inset-0 bg-background/70 flex flex-col items-center justify-center gap-3 text-center p-6">
                        <Lock className="h-8 w-8 text-muted-foreground" />
                        <p className="font-medium text-foreground">
                            {candidates.length} propert{candidates.length === 1 ? 'y' : 'ies'} like this one, in your budget
                        </p>
                        <Button onClick={() => setIsPaymentModalOpen(true)} className="bg-accent hover:bg-accent/90">
                            Unlock for UGX {SIMILAR_PROPERTIES_PASS_PRICE_UGX.toLocaleString()}
                        </Button>
                    </div>
                </div>
            )}

            <SimilarPropertiesPaymentModal
                isOpen={isPaymentModalOpen}
                onClose={() => setIsPaymentModalOpen(false)}
                propertyId={property.id}
                onUnlocked={() => setIsPaymentModalOpen(false)}
            />
        </div>
    )
}
