import { useEffect } from 'react'
import { getSiteUrl } from '@/lib/siteUrl'

export type PageSeoProps = {
    title: string
    description?: string
    canonicalPath: string
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

function ensureCanonical(href: string) {
    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null
    if (!link) {
        link = document.createElement('link')
        link.rel = 'canonical'
        document.head.appendChild(link)
    }
    link.href = href
}

/**
 * Updates document title, meta description, canonical link, and injects JSON-LD for the current view (SPA).
 */
export function PageSeo({ title, description, canonicalPath, jsonLd }: PageSeoProps) {
    useEffect(() => {
        document.title = title

        const base = getSiteUrl()
        const path = canonicalPath.startsWith('/') ? canonicalPath : `/${canonicalPath}`
        const canonicalUrl = `${base}${path === '//' ? '/' : path}`

        if (description) {
            ensureMetaName('description', description)
        }

        ensureCanonical(canonicalUrl)

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
    }, [title, description, canonicalPath, jsonLd ? JSON.stringify(jsonLd) : ''])

    return null
}
