/**
 * Framework-agnostic SEO metadata — shared between the client (dynamic,
 * post-hydration tags via PageSeo) and the server (static tags served to
 * link-preview / search bots that don't execute JavaScript, see
 * server/social-preview.ts). Keeping this in one place means a bot and a
 * browser never see different titles/descriptions for the same URL.
 */
import type { Property } from './schema'

export const SITE_NAME = 'RealEVR Estates'
export const DEFAULT_OG_IMAGE_PATH = '/og-default.jpg'
const MAX_META_DESC = 160

export function truncatePlainText(text: string, max: number): string {
    const plain = text.replace(/\s+/g, ' ').trim()
    if (plain.length <= max) return plain
    return `${plain.slice(0, max - 1).trim()}…`
}

function toAbsoluteUrl(base: string, urlOrPath: string): string {
    if (!urlOrPath) return ''
    if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath
    const path = urlOrPath.startsWith('/') ? urlOrPath : `/${urlOrPath}`
    return `${base}${path}`
}

/** Static, hand-written metadata for the handful of high-traffic, shareable routes. */
export type CategoryPageKey =
    | 'home'
    | 'bnbs'
    | 'bankSales'
    | 'forSale'
    | 'rentalUnits'
    | 'featuredProperties'
    | 'allProperties'
    | 'newListings'

export const CATEGORY_PAGE_META: Record<CategoryPageKey, { path: string; title: string; description: string }> = {
    home: {
        path: '/',
        title: 'RealEVR Estates | Virtual Tours for Rentals, BnBs, For Sale & Bank Properties',
        description:
            'Discover rental units, vacation BnBs, properties for sale, and bank sales with virtual tours. Search by location, price, and amenities on RealEVR Estates.',
    },
    bnbs: {
        path: '/bnbs',
        title: 'BnBs & Vacation Rentals | RealEVR Estates',
        description:
            'Browse furnished BnBs and short-term rentals with virtual tours. Search by area, price, and amenities on RealEVR Estates.',
    },
    bankSales: {
        path: '/bank-sales',
        title: 'Bank Sales & Property Auctions | RealEVR Estates',
        description:
            'Browse bank auction and distressed properties with virtual tours. View schedules, bids, and bank details on RealEVR Estates.',
    },
    forSale: {
        path: '/for-sale',
        title: 'Properties For Sale | RealEVR Estates',
        description:
            'Explore homes and land for sale with virtual tours. Filter by price, area, and property type on RealEVR Estates.',
    },
    rentalUnits: {
        path: '/rental-units',
        title: 'Rental Units | RealEVR Estates',
        description:
            'Find apartments and houses for rent with virtual tours. Filter by bedrooms, bathrooms, area, and monthly rent on RealEVR Estates.',
    },
    featuredProperties: {
        path: '/featured-properties',
        title: 'Featured Properties | RealEVR Estates',
        description: 'Explore curated featured homes, rentals, and bank listings with immersive virtual tours on RealEVR Estates.',
    },
    allProperties: {
        path: '/properties',
        title: 'All Properties | RealEVR Estates',
        description:
            'Browse every rental, BnB, sale, and bank-sale listing on RealEVR Estates in one place — filter by type, area, and price.',
    },
    newListings: {
        path: '/new-listings',
        title: 'New Listings | RealEVR Estates',
        description: 'The newest rentals, BnBs, sale, and bank-sale listings added to RealEVR Estates.',
    },
}

export function buildPropertyPageTitle(p: Pick<Property, 'title' | 'location'>): string {
    const full = `${p.title} in ${p.location} | ${SITE_NAME}`
    if (full.length <= 72) return full
    return `${truncatePlainText(p.title, 48)} | ${SITE_NAME}`
}

export function buildPropertyMetaDescription(
    p: Pick<Property, 'propertyType' | 'bedrooms' | 'bathrooms' | 'location' | 'description'>
): string {
    const snippet = truncatePlainText(p.description, 100)
    const parts = [p.propertyType, `${p.bedrooms} bed, ${p.bathrooms} bath`, p.location, snippet].filter(Boolean)
    return truncatePlainText(parts.join(' · '), MAX_META_DESC)
}

export function absolutePropertyImageUrl(base: string, p: Pick<Property, 'imageUrl'>): string {
    return toAbsoluteUrl(base, p.imageUrl || '')
}

export function buildPropertyJsonLd(
    base: string,
    p: Pick<
        Property,
        'title' | 'description' | 'price' | 'currency' | 'isAvailable' | 'location' | 'imageUrl'
    >,
    propertyPath: string
): Record<string, unknown> {
    const url = toAbsoluteUrl(base, propertyPath)
    const image = absolutePropertyImageUrl(base, p)

    return {
        '@context': 'https://schema.org',
        '@type': 'RealEstateListing',
        name: p.title,
        description: truncatePlainText(p.description, 5000),
        url,
        ...(image ? { image } : {}),
        offers: {
            '@type': 'Offer',
            price: p.price,
            priceCurrency: p.currency || 'UGX',
            availability: p.isAvailable !== false ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        },
        address: {
            '@type': 'PostalAddress',
            streetAddress: p.location,
        },
    }
}

export function defaultOgImageUrl(base: string): string {
    return toAbsoluteUrl(base, DEFAULT_OG_IMAGE_PATH)
}
