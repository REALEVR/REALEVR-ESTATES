/**
 * Country spots: a small number of promoted places for each country, paid for in that country's money by people in that
 * country. One definition of the plans and prices, used by the server (to charge) and the browser (to show), so the two
 * can never disagree.
 *
 * Prices are set in US dollars and shown in local money at a rate the administrator keeps for each country. A country
 * without a rate is quoted in US dollars. Nothing here moves money: a spot is bought by paying the country's payee and
 * keeping the reference, and it is switched on when that payment is seen (automatically or by the country's manager).
 */
import { countryByCode, toInternationalDigits } from './africa'

export type PlanId = 'week' | 'month' | 'quarter'

export interface SpotPlan {
    id: PlanId
    label: string
    days: number
    /** Default price in US dollars; an administrator can change it for a single country. */
    usd: number
}

export const SPOT_PLANS: SpotPlan[] = [
    { id: 'week', label: '1 week', days: 7, usd: 3 },
    { id: 'month', label: '1 month', days: 30, usd: 9 },
    { id: 'quarter', label: '3 months', days: 90, usd: 22 },
]

export const DEFAULT_SPOTS_PER_COUNTRY = 6
export const MAX_SPOTS_PER_COUNTRY = 24

export const planById = (id: unknown): SpotPlan | undefined => SPOT_PLANS.find((p) => p.id === id)

/** Local money for a dollar price: rounded up to three significant figures, so prices look like prices (33,300 not 33,284). */
export function localPrice(usd: number, perUsd: number): number {
    if (!(perUsd > 0)) return Math.round(usd * 100) / 100
    const raw = usd * perUsd
    if (raw < 100) return Math.ceil(raw * 100) / 100
    const step = Math.pow(10, Math.max(0, Math.floor(Math.log10(raw)) - 2))
    return Math.ceil(raw / step) * step
}

export const formatMoney = (currency: string, amount: number): string =>
    `${currency} ${amount.toLocaleString('en-US', { maximumFractionDigits: amount < 100 ? 2 : 0 })}`

/** The money a country's spots are paid in: its own when a rate is set, else US dollars. */
export function spotCurrency(countryCode: string, perUsd: number): string {
    return perUsd > 0 ? countryByCode(countryCode)?.currency ?? 'USD' : 'USD'
}

/** True when an account's phone number belongs to this country (its dialling code), the test for "paid from here". */
export function phoneBelongsToCountry(phone: string | null | undefined, dialCodeOnAccount: string | null | undefined, countryCode: string): boolean {
    const country = countryByCode(countryCode)
    if (!country) return false
    const dial = (dialCodeOnAccount ?? '').replace(/\D/g, '')
    if (dial) return dial === country.dial
    if (!phone) return false
    const digits = toInternationalDigits(phone, null)
    return !!digits && digits.startsWith(country.dial) && country.dial.length >= 2
}
