import type { Property } from '@shared/schema'
import {
    absolutePropertyImageUrl as sharedAbsolutePropertyImageUrl,
    buildPropertyJsonLd as sharedBuildPropertyJsonLd,
    buildPropertyMetaDescription as sharedBuildPropertyMetaDescription,
    buildPropertyPageTitle as sharedBuildPropertyPageTitle,
    truncatePlainText,
} from '@shared/seo'
import { getSiteUrl } from '@/lib/siteUrl'

// Thin client-side wrappers: the actual title/description/JSON-LD logic lives in
// shared/seo.ts so the server (server/social-preview.ts) builds byte-identical
// metadata for bots that can't run this component's client-side effects.
export { truncatePlainText }

export function buildPropertyPageTitle(p: Property): string {
    return sharedBuildPropertyPageTitle(p)
}

export function buildPropertyMetaDescription(p: Property): string {
    return sharedBuildPropertyMetaDescription(p)
}

export function absolutePropertyImageUrl(p: Property): string {
    return sharedAbsolutePropertyImageUrl(getSiteUrl(), p)
}

export function buildPropertyJsonLd(p: Property, propertyPath: string): Record<string, unknown> {
    return sharedBuildPropertyJsonLd(getSiteUrl(), p, propertyPath)
}
