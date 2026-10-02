/**
 * "RealEVR Estates vs X" and "alternatives to X" pages: what people search when they are choosing where to look.
 *
 * Written to be fair and checkable. The RealEVR Estates column states only what the platform does today. The other
 * site is described in general terms from what it says about itself, with no claim about its prices, quality or
 * numbers, and every page tells the reader to check the other site for its current features. Last reviewed on the
 * date below; review it when the platform or the other site changes.
 */
export interface Comparison {
    slug: string
    /** Short name of the other site, as people write it. */
    other: string
    otherUrl: string
    /** What the other site is, in one plain line, from how it describes itself. */
    otherIs: string
    /** The region the comparison is aimed at. */
    region: string
    /** Who should pick the other site: honest, general. */
    chooseOther: string[]
    chooseUs: string[]
    description: string
}

export const COMPARE_REVIEWED = '2026-10-02'

/** What RealEVR Estates does today. Each is a fact about this platform only. */
export const REALEVR_FACTS: Array<{ label: string; value: string }> = [
    { label: '360° virtual tour', value: 'On every listing' },
    { label: 'Listing type', value: 'Rentals, BnBs, homes for sale and bank auctions' },
    { label: 'Bank auctions', value: 'Live bidding with verified bidders' },
    { label: 'Pay with Bitcoin', value: 'On homes for sale, with the seller’s agreement' },
    { label: 'Assistant', value: 'Kevin on the site and a WhatsApp concierge' },
    { label: 'Cost to list', value: 'Free' },
    { label: 'Where', value: 'Uganda first, listings across Africa' },
]

export const COMPARISONS: Comparison[] = [
    {
        slug: 'realevr-estates-vs-lamudi',
        other: 'Lamudi',
        otherUrl: 'https://www.lamudi.co.ug/',
        otherIs: 'a property portal with listings for rent and sale in Uganda',
        region: 'Uganda',
        chooseOther: ['You want to browse a large catalogue of listings from many agents in one place.', 'You mainly need photos and details and plan to visit every shortlisted home anyway.'],
        chooseUs: ['You want to walk through a home in 360° before you travel or pay a viewing fee.', 'You are interested in bank auctions, BnB stays, or asking to buy with Bitcoin.', 'You prefer to be helped on WhatsApp.'],
        description: 'RealEVR Estates vs Lamudi in Uganda: how a 360° virtual-tour platform differs from a classified property portal, and which to use for renting, buying or booking.',
    },
    {
        slug: 'realevr-estates-vs-buyrentkenya',
        other: 'BuyRentKenya',
        otherUrl: 'https://www.buyrentkenya.com/',
        otherIs: 'a property marketplace for buying and renting in Kenya',
        region: 'Kenya',
        chooseOther: ['You are searching only in Kenya and want a marketplace built around Kenyan agents and developers.', 'You just need to compare listings and prices quickly.'],
        chooseUs: ['You want a 360° virtual tour of every home before you visit.', 'You want one place for rentals, BnBs, homes for sale and bank auctions across Africa.', 'You want to ask to buy a home with Bitcoin.'],
        description: 'RealEVR Estates vs BuyRentKenya: a virtual-tour platform for homes across Africa compared with a Kenya-focused property marketplace. Which to use, and when.',
    },
    {
        slug: 'realevr-estates-vs-property24',
        other: 'Property24',
        otherUrl: 'https://www.property24.co.ke/',
        otherIs: 'a property portal that is part of a wider African property network',
        region: 'Kenya and Africa',
        chooseOther: ['You want a portal from a long-running multi-country property network.', 'You are looking mainly for listings from established estate agents.'],
        chooseUs: ['You want a 360° tour on every listing, not only photos.', 'You want live bank auctions and short-stay BnBs next to rentals and sales.', 'You want an assistant and WhatsApp help while you search.'],
        description: 'RealEVR Estates vs Property24: how a 360° virtual-tour platform compares with a multi-country property portal for finding a home in Africa.',
    },
    {
        slug: 'realevr-estates-vs-airbnb',
        other: 'Airbnb',
        otherUrl: 'https://www.airbnb.com/',
        otherIs: 'a global marketplace for booking short stays',
        region: 'Uganda and East Africa',
        chooseOther: ['You want a global brand, a large pool of reviews and the platform’s own booking protections.', 'You are travelling to many countries and want one account for all of them.'],
        chooseUs: ['You want to walk through a BnB in 360° before you book.', 'You also want to rent long term, buy, or bid in a bank auction in the same place.', 'You want to talk to someone on WhatsApp about a stay.'],
        description: 'RealEVR Estates vs Airbnb for stays in Uganda and East Africa: how a 360° BnB platform compares with a global booking marketplace, and which to use.',
    },
]

export const comparisonBySlug = (slug: string) => COMPARISONS.find((c) => c.slug === slug)
