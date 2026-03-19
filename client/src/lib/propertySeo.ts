import type { Property } from '@shared/schema'
import { getSiteUrl } from '@/lib/siteUrl'

const MAX_META_DESC = 160

export function truncatePlainText(text: string, max: number): string {
    const plain = text.replace(/\s+/g, ' ').trim()
    if (plain.length <= max) return plain
    return `${plain.slice(0, max - 1).trim()}…`
}

export function buildPropertyPageTitle(p: Property): string {
    const full = `${p.title} in ${p.location} | RealEVR Estates`
    if (full.length <= 72) return full
    return `${truncatePlainText(p.title, 48)} | RealEVR Estates`
}

export function buildPropertyMetaDescription(p: Property): string {
    const snippet = truncatePlainText(p.description, 100)
    const parts = [
        p.propertyType,
        `${p.bedrooms} bed, ${p.bathrooms} bath`,
        p.location,
        snippet,
    ].filter(Boolean)
    return truncatePlainText(parts.join(' · '), MAX_META_DESC)
}

export function absolutePropertyImageUrl(p: Property): string {
    const u = p.imageUrl || ''
    if (!u) return ''
    if (/^https?:\/\//i.test(u)) return u
    const base = getSiteUrl()
    const path = u.startsWith('/') ? u : `/${u}`
    return `${base}${path}`
}

export function buildPropertyJsonLd(p: Property, propertyPath: string): Record<string, unknown> {
    const base = getSiteUrl()
    const url = `${base}${propertyPath.startsWith('/') ? propertyPath : `/${propertyPath}`}`
    const image = absolutePropertyImageUrl(p)

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
            availability:
                p.isAvailable !== false
                    ? 'https://schema.org/InStock'
                    : 'https://schema.org/OutOfStock',
        },
        address: {
            '@type': 'PostalAddress',
            streetAddress: p.location,
        },
    }
}
