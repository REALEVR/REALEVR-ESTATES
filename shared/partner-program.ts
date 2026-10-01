/**
 * The partner programme, in one place so the careers page, the country pages, the fee schedule, the legal pages and
 * the server can never disagree: who can partner, what each kind of partner must show, what a bank-sale partner
 * pays in each country, and how live auctions treat fees.
 *
 * The partner fee numbers below are DEFAULTS. An administrator can change the fee for a tier or for a single country
 * in Admin > Partners; whatever is saved there is what the site then shows and charges.
 */
import { AUCTION_RULES } from './auction-rules'
import { WORLD_COUNTRIES, worldCountry, type WorldCountry } from './world'

export type PartnerRole = 'bank' | 'developer' | 'agency' | 'professional' | 'media'

export interface PartnerRoleInfo {
    id: PartnerRole
    title: string
    summary: string
    /** Only bank-sale partners pay a partner fee; the rest list free. */
    paysFee: boolean
    requirements: string[]
    youGet: string[]
}

export const PARTNER_ROLES: PartnerRoleInfo[] = [
    {
        id: 'bank',
        title: 'Bank or lender: bank-sale partner',
        summary: 'List repossessed and bank-sale properties and run them as live online auctions with vetted bidders.',
        paysFee: true,
        requirements: [
            'A licence to lend or take deposits in the country (or the parent bank\'s licence) and your registration number',
            'Written authority from the lender to list and sell: the officer who signs for the bank, and the bank\'s power of sale over each property',
            'A licensed auctioneer or court officer where the law of that country requires one to conduct a mortgagee sale',
            'Your provisions of sale for each property: reserve or starting price, closing date, how and when the balance is paid, taxes and fees, title position, viewing arrangements',
            'An anti-money-laundering contact, and acceptance of the Partner Terms and Auction Terms',
        ],
        youGet: [
            'Live auction pages that show the starting price, the closing date and live bids from vetted bidders, as anonymous aliases',
            'Bidders already identity-checked, source-of-funds checked and sanctions-screened, each having paid a non-refundable commitment fee',
            'Your listings with 360° virtual tours, in front of buyers across Africa and abroad',
            'Notifications to you on every milestone, automatically',
        ],
    },
    {
        id: 'developer',
        title: 'Developer or estate company',
        summary: 'Show off-plan and completed developments with virtual tours and reach buyers in Africa and the diaspora.',
        paysFee: false,
        requirements: ['Company registration number and a contact person', 'Planning or building permits for the project, available on request', 'Honest descriptions, prices and completion dates'],
        youGet: ['Free listings and virtual tours', 'A partner badge and a page on the Partners list', 'Leads sent straight to you'],
    },
    {
        id: 'agency',
        title: 'Real estate agency or agent network',
        summary: 'List rentals, homes for sale and short stays for many clients from one account.',
        paysFee: false,
        requirements: ['Business registration, and your agent licence where the country requires one', 'Authority from each owner to list their property', 'A contact person'],
        youGet: ['Free listings, virtual tours and lead alerts', 'A partner page and badge'],
    },
    {
        id: 'professional',
        title: 'Auctioneer, valuer, surveyor, law firm or conveyancer',
        summary: 'Be the professional that buyers and banks are pointed to for the legal and technical side of a sale.',
        paysFee: false,
        requirements: ['Your professional licence or membership number and the body that issued it', 'Professional indemnity cover where your profession requires it', 'A contact person'],
        youGet: ['A listing in the partner directory for your countries', 'Introductions to banks and buyers needing your service'],
    },
    {
        id: 'media',
        title: 'Photographer or virtual tour creator',
        summary: 'Capture 360° tours for listings and get paid by the owners and agents who need them.',
        paysFee: false,
        requirements: ['A portfolio or sample tours', 'Your contact details and the cities you cover'],
        youGet: ['A listing in the partner directory', 'Requests from owners who need tours made'],
    },
]

export const roleInfo = (id: string): PartnerRoleInfo | undefined => PARTNER_ROLES.find((r) => r.id === id)

/** Fee bands. Tier 1 is Uganda and its neighbours in the East African Community, tier 3 the highest-cost markets. */
export interface FeeTier {
    tier: 1 | 2 | 3 | 4
    label: string
    /** Default yearly partner fee for a bank-sale partner, in US dollars, per country it operates in. */
    defaultAnnualUsd: number
}

export const FEE_TIERS: FeeTier[] = [
    { tier: 1, label: 'Uganda and the East African Community', defaultAnnualUsd: 250 },
    { tier: 2, label: 'Rest of Africa', defaultAnnualUsd: 400 },
    { tier: 3, label: 'Europe, North America, Oceania, the Gulf and other high-income markets', defaultAnnualUsd: 750 },
    { tier: 4, label: 'Rest of the world', defaultAnnualUsd: 500 },
]

const EAC = new Set(['UG', 'KE', 'TZ', 'RW', 'BI', 'SS', 'CD', 'SO'])
const HIGH_INCOME_ASIA = new Set(['JP', 'KR', 'SG', 'HK', 'TW', 'AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'IL', 'BN'])
const LOWER_INCOME_EUROPE = new Set(['AL', 'BY', 'BA', 'MD', 'ME', 'MK', 'RS', 'RU', 'UA', 'XK', 'GE'])

export function tierOf(c: Pick<WorldCountry, 'code' | 'continent'>): 1 | 2 | 3 | 4 {
    if (EAC.has(c.code)) return 1
    if (c.continent === 'africa') return 2
    if (c.continent === 'europe') return LOWER_INCOME_EUROPE.has(c.code) ? 4 : 3
    if (c.continent === 'oceania') return c.code === 'AU' || c.code === 'NZ' ? 3 : 4
    if (c.code === 'US' || c.code === 'CA') return 3
    if (c.continent === 'asia') return HIGH_INCOME_ASIA.has(c.code) ? 3 : 4
    return 4
}

export interface FeeOverrides {
    /** Replacement yearly fee per tier. */
    tiers?: Partial<Record<'1' | '2' | '3' | '4', number>>
    /** Replacement yearly fee for single countries, by ISO code. */
    countries?: Record<string, number>
}

export function partnerFeeUsd(code: string, overrides: FeeOverrides = {}): number {
    const c = worldCountry(code)
    if (!c) return FEE_TIERS[3].defaultAnnualUsd
    const own = overrides.countries?.[c.code]
    if (typeof own === 'number' && own >= 0) return own
    const t = tierOf(c)
    const tierOverride = overrides.tiers?.[String(t) as '1' | '2' | '3' | '4']
    if (typeof tierOverride === 'number' && tierOverride >= 0) return tierOverride
    return FEE_TIERS.find((x) => x.tier === t)!.defaultAnnualUsd
}

/** What a bidder and a bank-sale partner need to know about money in auctions, for display. */
export const AUCTION_FEE_RULES: string[] = [
    `Every bidder is vetted first, then pays a one-off commitment fee of US$${AUCTION_RULES.commitmentFeeUsd.toLocaleString()} for each auction they want to bid in. It is non-refundable, even if they do not win, and is separate from the price.`,
    'The commitment fee is a platform fee paid to RealEVR Estates. It is not part of the sale price and is not paid to the bank.',
    `The bank (the seller) states the starting price, the closing date and its provisions of sale. Live bids are shown as they happen; a bid in the last ${AUCTION_RULES.softCloseMinutes} minutes extends the close by ${AUCTION_RULES.softCloseMinutes} minutes, so nobody wins by last-second sniping.`,
    'The winning bidder pays the balance to the bank, under the bank\'s provisions, within the days the bank states (14 by default). The bank, not RealEVR Estates, receives the sale price.',
    'If the winner does not complete, the bank decides what happens next under its provisions (for example offering the property to the next bidder, or re-auctioning).',
    'A bank-sale partner pays the yearly partner fee for each country it lists in. RealEVR Estates takes no commission on the sale price.',
]

export interface CountryProgram {
    code: string
    name: string
    continent: string
    slug: string
    tier: 1 | 2 | 3 | 4
    feeUsd: number
}

export function programForAllCountries(overrides: FeeOverrides = {}): CountryProgram[] {
    return WORLD_COUNTRIES.map((c) => ({
        code: c.code,
        name: c.name,
        continent: c.continent,
        slug: c.name
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, ''),
        tier: tierOf(c),
        feeUsd: partnerFeeUsd(c.code, overrides),
    }))
}
