/**
 * Live prices for the "buy with Bitcoin" button. Reads free public feeds that need no key, tries the next one when
 * a feed is down, remembers the last good reading, and says plainly when the number is old. It never invents a
 * price: with no reading at all (or one older than six hours) the page shows no amount and says so.
 *
 *   coins  Coinbase spot price, then CoinGecko, then mempool.space (Bitcoin only)
 *   money  open.er-api.com (USD to ~160 currencies, including UGX, KES, TZS); the Admin → Payments rate for UGX if it is down
 */
import { getPaymentSettings } from './payment-settings'
import { coinAmount, type CryptoQuote } from '../../shared/crypto-buy'

type Fetch = typeof fetch

export interface Rates {
    btcUsd: number
    ethUsd: number | null
    /** Units of each currency per one US dollar. */
    fiat: Record<string, number>
    at: number
}

const FRESH_MS = 60_000
const MAX_STALE_MS = 6 * 3_600_000
const TIMEOUT_MS = 4_500

let cache: Rates | null = null
let inflight: Promise<Rates | null> | null = null

export function resetRateCache(): void {
    cache = null
    inflight = null
}

async function getJson(f: Fetch, url: string): Promise<any> {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
    try {
        const res = await f(url, { signal: ctl.signal, headers: { Accept: 'application/json' } })
        if (!res.ok) throw new Error(`${url} answered ${res.status}`)
        return await res.json()
    } finally {
        clearTimeout(timer)
    }
}

const sane = (n: unknown, lo: number, hi: number): number | null => {
    const v = typeof n === 'string' ? Number(n) : (n as number)
    return typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null
}

async function firstOf<T>(tries: Array<() => Promise<T | null>>): Promise<T | null> {
    for (const t of tries) {
        try {
            const v = await t()
            if (v != null) return v
        } catch {
            /* try the next feed */
        }
    }
    return null
}

async function readCoins(f: Fetch): Promise<{ btcUsd: number; ethUsd: number | null } | null> {
    const btc = await firstOf<number>([
        async () => sane((await getJson(f, 'https://api.coinbase.com/v2/prices/BTC-USD/spot'))?.data?.amount, 1_000, 10_000_000),
        async () => sane((await getJson(f, 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd'))?.bitcoin?.usd, 1_000, 10_000_000),
        async () => sane((await getJson(f, 'https://mempool.space/api/v1/prices'))?.USD, 1_000, 10_000_000),
    ])
    if (btc == null) return null
    const eth = await firstOf<number>([
        async () => sane((await getJson(f, 'https://api.coinbase.com/v2/prices/ETH-USD/spot'))?.data?.amount, 10, 1_000_000),
        async () => sane((await getJson(f, 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'))?.ethereum?.usd, 10, 1_000_000),
    ])
    return { btcUsd: btc, ethUsd: eth }
}

async function readFiat(f: Fetch): Promise<Record<string, number> | null> {
    try {
        const body = await getJson(f, 'https://open.er-api.com/v6/latest/USD')
        const rates = body?.rates
        if (rates && typeof rates === 'object') {
            const out: Record<string, number> = { USD: 1 }
            for (const [k, v] of Object.entries(rates)) {
                const n = sane(v, 0.0000001, 10_000_000)
                if (n != null) out[k.toUpperCase()] = n
            }
            if (Object.keys(out).length > 5) return out
        }
    } catch {
        /* fall through to the rate set by hand */
    }
    return null
}

/** The latest rates, or null when there is nothing trustworthy to show. */
export async function getRates(f: Fetch = fetch): Promise<{ rates: Rates; stale: boolean } | null> {
    const now = Date.now()
    if (cache && now - cache.at < FRESH_MS) return { rates: cache, stale: false }
    if (!inflight) {
        inflight = (async () => {
            const [coins, fiat] = await Promise.all([readCoins(f), readFiat(f)])
            if (!coins) return null
            // Keep earlier currency rates when only the fiat feed failed, so a coin price outage and a currency outage are independent.
            const fiatRates = fiat ?? cache?.fiat ?? { USD: 1 }
            const fresh: Rates = { btcUsd: coins.btcUsd, ethUsd: coins.ethUsd ?? cache?.ethUsd ?? null, fiat: fiatRates, at: Date.now() }
            cache = fresh
            return fresh
        })().finally(() => {
            inflight = null
        })
    }
    const got = await inflight
    if (got) return { rates: got, stale: false }
    if (cache && now - cache.at < MAX_STALE_MS) return { rates: cache, stale: true }
    return null
}

/** Units of `currency` per US dollar: the live rate, else the rate set by hand in Admin → Payments (UGX only). */
export function fiatPerUsd(rates: Rates, currency: string): number | null {
    const code = currency.trim().toUpperCase()
    if (code === 'USD') return 1
    const live = rates.fiat[code]
    if (live && live > 0) return live
    if (code === 'UGX') {
        const manual = getPaymentSettings().ugxPerUsd
        if (manual > 0) return manual
    }
    return null
}

/** What a price is worth in each coin, from a rate reading. Null when the currency has no known rate. */
export function quotePrice(price: number, currency: string, got: { rates: Rates; stale: boolean }): CryptoQuote | null {
    const per = fiatPerUsd(got.rates, currency)
    if (per == null || !Number.isFinite(price) || price <= 0) return null
    const usd = price / per
    const btc = coinAmount(usd, got.rates.btcUsd)
    if (btc == null) return null
    return {
        usd,
        btc,
        eth: got.rates.ethUsd ? coinAmount(usd, got.rates.ethUsd) : null,
        usdt: usd,
        usdc: usd,
        btcUsd: got.rates.btcUsd,
        ethUsd: got.rates.ethUsd,
        fiatPerUsd: per,
        asOf: new Date(got.rates.at).toISOString(),
        stale: got.stale,
    }
}
