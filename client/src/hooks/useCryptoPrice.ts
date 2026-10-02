import { useQuery } from '@tanstack/react-query'
import type { CryptoQuote } from '@shared/crypto-buy'

export interface CryptoPrice {
    eligible: boolean
    propertyId?: number
    title?: string
    category?: string
    price?: number
    currency?: string
    assets?: string[]
    note?: string
    quote?: CryptoQuote | null
    safety?: string
}

/** What a listing costs in coin, from the server's live rates. Refreshes every minute while something is showing it. */
export function useCryptoPrice(propertyId: number, enabled = true) {
    return useQuery<CryptoPrice>({
        queryKey: ['/api/crypto/property', propertyId],
        enabled: enabled && propertyId > 0,
        staleTime: 30_000,
        refetchInterval: 60_000,
        retry: 1,
        queryFn: async () => {
            const res = await fetch(`/api/crypto/property/${propertyId}`)
            if (!res.ok) throw new Error('price lookup failed')
            return res.json()
        },
    })
}
