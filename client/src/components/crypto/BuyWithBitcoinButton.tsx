import { lazy, Suspense, useState } from 'react'
import { isCryptoSaleCategory } from '@shared/crypto-buy'
import { cn } from '@/lib/utils'
import BitcoinMark from './BitcoinMark'

const Dialog = lazy(() => import('./BuyWithBitcoinDialog'))

interface Props {
    property: { id: number; title: string; category: string; price?: number | null; isAvailable?: boolean | null }
    /** card: small pill under a price. page: full-size button. */
    variant?: 'card' | 'page'
    className?: string
}

/** True for every listing a buyer can pay for in digital currency. */
export const canBuyWithBitcoin = (p: Props['property']) => isCryptoSaleCategory(p.category) && (p.price ?? 0) > 0 && p.isAvailable !== false

/**
 * The "Buy with Bitcoin" button, with the Bitcoin symbol. Shown on every home that is for sale; renders nothing
 * for rentals, stays and anything already sold. The window (and its price lookup) loads only when it is tapped.
 */
export default function BuyWithBitcoinButton({ property, variant = 'page', className }: Props) {
    const [open, setOpen] = useState(false)
    if (!canBuyWithBitcoin(property)) return null

    const click = (e: React.MouseEvent) => {
        // Cards are links; this button must not also open the property.
        e.preventDefault()
        e.stopPropagation()
        setOpen(true)
    }

    return (
        <>
            {variant === 'card' ? (
                <button
                    type="button"
                    onClick={click}
                    className={cn('mt-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-background py-1 pl-1 pr-3 text-xs font-semibold text-foreground transition hover:border-[#F7931A] hover:bg-[#F7931A]/10', className)}
                >
                    <BitcoinMark size={20} />
                    Buy with Bitcoin
                </button>
            ) : (
                <button
                    type="button"
                    onClick={click}
                    className={cn('inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-foreground/30 bg-background py-1 pl-1.5 pr-5 text-sm font-semibold text-foreground transition hover:border-[#F7931A] hover:bg-[#F7931A]/10', className)}
                >
                    <BitcoinMark size={30} />
                    Buy with Bitcoin
                </button>
            )}
            {open && (
                // A dialog is drawn outside the card, but React still passes its clicks up through the card, which is
                // itself a link to the property. Stop them here so using the form never navigates away.
                <span style={{ display: 'contents' }} onClick={(e) => e.stopPropagation()}>
                    <Suspense fallback={null}>
                        <Dialog open={open} onClose={() => setOpen(false)} propertyId={property.id} propertyTitle={property.title} />
                    </Suspense>
                </span>
            )}
        </>
    )
}
