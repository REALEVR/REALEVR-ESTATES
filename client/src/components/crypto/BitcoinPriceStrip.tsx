import { useCryptoPrice } from '@/hooks/useCryptoPrice'
import { formatCoin } from '@shared/crypto-buy'
import BuyWithBitcoinButton, { canBuyWithBitcoin } from './BuyWithBitcoinButton'
import BitcoinMark from './BitcoinMark'

/**
 * Under the price on a property for sale: what it costs in Bitcoin right now, and the button to buy with it.
 * Quiet when the live rate can't be read (the button still works; the window explains).
 */
export default function BitcoinPriceStrip({
    property,
    only,
}: {
    property: { id: number; title: string; category: string; price?: number | null; isAvailable?: boolean | null }
    /** Show only on phones or only on larger screens, so the page can place it twice without repeating it. */
    only?: 'phone' | 'desktop'
}) {
    const show = canBuyWithBitcoin(property)
    const { data, isLoading } = useCryptoPrice(property.id, show)
    if (!show || (data && !data.eligible)) return null
    const q = data?.quote
    return (
        <div className={`mb-4 flex flex-col gap-3 rounded-2xl border border-border bg-muted/40 p-3.5 sm:flex-row sm:items-center sm:justify-between ${only === 'phone' ? 'md:hidden' : only === 'desktop' ? 'max-md:hidden' : ''}`}>
            <div className="flex min-w-0 items-center gap-3">
                <BitcoinMark size={34} />
                <div className="min-w-0 leading-tight">
                    <p className="text-xs text-muted-foreground">Pay with Bitcoin or other digital currency</p>
                    <p className="truncate font-display text-lg font-bold tabular-nums">{q ? `≈ ${formatCoin(q.btc, 'BTC')}` : isLoading ? 'Reading the live price…' : 'Price in Bitcoin on request'}</p>
                </div>
            </div>
            <BuyWithBitcoinButton property={property} variant="page" />
        </div>
    )
}
