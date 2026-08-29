import { useEffect } from 'react'
import { getSiteUrl } from '@/lib/siteUrl'
import { DEFAULT_OG_IMAGE_PATH, SITE_NAME } from '@shared/seo'

export type PageSeoProps = {
    title: string
    description?: string
    canonicalPath: string
    /** Absolute or site-relative URL. Defaults to the site's default share image. */
    image?: string
    imageAlt?: string
    /** og:type — defaults to "website"; most social crawlers only reliably support a handful of types. */
    type?: 'website' | 'article'
    /** Single object or array of JSON-LD graphs */
    jsonLd?: Record<string, unknown> | Record<string, unknown>[]
}

function ensureMetaName(name: string, content: string) {
    let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null
    if (!el) {
        el = document.createElement('meta')
        el.setAttribute('name', name)
        document.head.appendChild(el)
    }
    el.setAttribute('content', content)
}

function ensureMetaProperty(property: string, content: string) {
    let el = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null
    if (!el) {
        el = document.createElement('meta')
        el.setAttribute('property', property)
        document.head.appendChild(el)
    }
    el.setAttribute('content', content)
}

function ensureCanonical(href: string) {
    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null
    if (!link) {
        link = document.createElement('link')
        link.rel = 'canonical'
        document.head.appendChild(link)
    }
    link.href = href
}

function toAbsoluteUrl(base: string, urlOrPath: string): string {
    if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath
    const path = urlOrPath.startsWith('/') ? urlOrPath : `/${urlOrPath}`
    return `${base}${path}`
}

/**
 * Updates document title, meta description, canonical link, Open Graph / Twitter Card tags,
 * and injects JSON-LD for the current view (SPA).
 *
 * Note: this only reaches crawlers that execute JavaScript (Googlebot, and browsers doing a
 * native share). Link-preview bots for WhatsApp/Facebook/Twitter/etc. generally do not run JS —
 * those are served correct tags server-side for the handful of shareable routes; see
 * server/social-preview.ts. Keep the two in sync when changing title/description conventions.
 */
export function PageSeo({ title, description, canonicalPath, image, imageAlt, type = 'website', jsonLd }: PageSeoProps) {
    useEffect(() => {
        document.title = title

        const base = getSiteUrl()
        const path = canonicalPath.startsWith('/') ? canonicalPath : `/${canonicalPath}`
        const canonicalUrl = `${base}${path === '//' ? '/' : path}`
        const imageUrl = toAbsoluteUrl(base, image || DEFAULT_OG_IMAGE_PATH)

        if (description) {
            ensureMetaName('description', description)
        }

        ensureCanonical(canonicalUrl)

        // Open Graph
        ensureMetaProperty('og:site_name', SITE_NAME)
        ensureMetaProperty('og:type', type)
        ensureMetaProperty('og:title', title)
        if (description) ensureMetaProperty('og:description', description)
        ensureMetaProperty('og:url', canonicalUrl)
        ensureMetaProperty('og:image', imageUrl)
        ensureMetaProperty('og:image:width', '1200')
        ensureMetaProperty('og:image:height', '630')
        ensureMetaProperty('og:image:alt', imageAlt || title)
        ensureMetaProperty('og:locale', 'en_UG')

        // Twitter Card
        ensureMetaName('twitter:card', 'summary_large_image')
        ensureMetaName('twitter:title', title)
        if (description) ensureMetaName('twitter:description', description)
        ensureMetaName('twitter:image', imageUrl)

        const prev = document.getElementById('jsonld-dynamic-seo')
        prev?.remove()

        if (jsonLd) {
            const script = document.createElement('script')
            script.type = 'application/ld+json'
            script.id = 'jsonld-dynamic-seo'
            const payload = Array.isArray(jsonLd) ? jsonLd : [jsonLd]
            script.textContent = JSON.stringify(payload.length === 1 ? payload[0] : payload)
            document.head.appendChild(script)
        }

        return () => {
            document.getElementById('jsonld-dynamic-seo')?.remove()
        }
    }, [title, description, canonicalPath, image, imageAlt, type, jsonLd ? JSON.stringify(jsonLd) : ''])

    return null
}
