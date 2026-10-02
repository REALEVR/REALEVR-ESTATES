/**
 * Buying a home with digital currency: which listings, which coins, and the plain arithmetic of turning a price
 * into an amount of coin. The server fetches the live rates; this file only does sums and wording, so the page
 * and the server always agree.
 */

/** Listings a buyer can pay for in digital currency: homes for sale, and bank sales (the bank still has to agree). */
export function isCryptoSaleCategory(category: unknown): boolean {
    return category === 'for_sale' || category === 'bank_sales'
}

export interface CryptoAsset {
    code: 'BTC' | 'ETH' | 'USDT' | 'USDC' | 'OTHER'
    name: string
    /** Digits after the point worth showing. */
    decimals: number
    /** Priced at about one US dollar, so no market rate is needed. */
    stable?: boolean
    short: string
}

export const CRYPTO_ASSETS: CryptoAsset[] = [
    { code: 'BTC', name: 'Bitcoin', short: 'Bitcoin (BTC)', decimals: 8 },
    { code: 'ETH', name: 'Ether', short: 'Ether (ETH)', decimals: 6 },
    { code: 'USDT', name: 'Tether', short: 'Tether (USDT)', decimals: 2, stable: true },
    { code: 'USDC', name: 'USD Coin', short: 'USD Coin (USDC)', decimals: 2, stable: true },
    { code: 'OTHER', name: 'Another digital currency', short: 'Another digital currency', decimals: 0 },
]

export const assetByCode = (code: unknown): CryptoAsset | undefined => CRYPTO_ASSETS.find((a) => a.code === code)

/** How much of a coin equals this many US dollars. `usdPerUnit` is the market price of one coin in dollars. */
export function coinAmount(usd: number, usdPerUnit: number): number | null {
    if (!Number.isFinite(usd) || usd <= 0 || !Number.isFinite(usdPerUnit) || usdPerUnit <= 0) return null
    return usd / usdPerUnit
}

/** "0.41230000 BTC", with the digits that matter for that coin and thousands separators for the big stable amounts. */
export function formatCoin(amount: number, code: CryptoAsset['code']): string {
    const asset = assetByCode(code)
    const d = asset?.decimals ?? 8
    const text = amount.toLocaleString('en-US', { minimumFractionDigits: Math.min(d, 2), maximumFractionDigits: d })
    return `${text} ${code === 'OTHER' ? '' : code}`.trim()
}

export interface CryptoQuote {
    /** The listing price in dollars at the fiat rate used. */
    usd: number
    btc: number
    eth: number | null
    usdt: number
    usdc: number
    btcUsd: number
    ethUsd: number | null
    /** Units of the listing's currency per US dollar. */
    fiatPerUsd: number
    /** When the market rates were read (ISO). */
    asOf: string
    /** True when the live feeds could not be reached and an earlier reading is shown. */
    stale: boolean
}

export const CRYPTO_REQUEST_STATUSES = ['new', 'contacted', 'escrow', 'completed', 'declined'] as const
export type CryptoRequestStatus = (typeof CRYPTO_REQUEST_STATUSES)[number]

export const CRYPTO_STATUS_LABEL: Record<CryptoRequestStatus, string> = {
    new: 'New',
    contacted: 'Buyer contacted',
    escrow: 'In escrow / with the lawyer',
    completed: 'Completed',
    declined: 'Declined',
}
