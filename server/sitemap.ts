/**
 * Dynamic sitemap generation (sitemaps.org + Google image extension).
 */

export type SitemapUrlEntry = {
    loc: string
    changefreq?: string
    priority?: string
    lastmod?: string
    images?: Array<{ loc: string; title: string }>
}

/** Minimal property shape for sitemap (avoids tight coupling to ORM types). */
export type PropertyForSitemap = {
    id: number | string
    title: string
    imageUrl: string
}

export function getCanonicalBaseUrl(): string {
    const raw = (process.env.BASE_URL || 'http://localhost:5000').trim()
    if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
        console.warn('[sitemap] BASE_URL should include scheme (https://). Using as-is.')
    }
    return raw.replace(/\/$/, '')
}

export function escapeXml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

export function toAbsoluteUrl(base: string, urlOrPath: string): string {
    if (!urlOrPath) return ''
    if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath
    const p = urlOrPath.startsWith('/') ? urlOrPath : `/${urlOrPath}`
    return `${base}${p}`
}

function pathToLoc(base: string, path: string): string {
    if (path === '/') return `${base}/`
    return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

const STATIC_PATHS: Array<{ path: string; changefreq: string; priority: string }> = [
    { path: '/', changefreq: 'weekly', priority: '1.0' },
    { path: '/bnbs', changefreq: 'daily', priority: '0.9' },
    { path: '/rental-units', changefreq: 'daily', priority: '0.9' },
    { path: '/for-sale', changefreq: 'daily', priority: '0.9' },
    { path: '/bank-sales', changefreq: 'daily', priority: '0.9' },
    { path: '/featured-properties', changefreq: 'daily', priority: '0.9' },
    { path: '/membership', changefreq: 'weekly', priority: '0.6' },
    { path: '/privacy', changefreq: 'monthly', priority: '0.3' },
    { path: '/terms', changefreq: 'monthly', priority: '0.3' },
    { path: '/host-responsibly', changefreq: 'monthly', priority: '0.4' },
    { path: '/about', changefreq: 'monthly', priority: '0.5' },
    { path: '/how-it-works', changefreq: 'monthly', priority: '0.5' },
    { path: '/help', changefreq: 'monthly', priority: '0.4' },
    { path: '/contact', changefreq: 'monthly', priority: '0.5' },
    { path: '/trust-safety', changefreq: 'monthly', priority: '0.4' },
    { path: '/agent/register', changefreq: 'monthly', priority: '0.5' },
]

export function getStaticSitemapEntries(base: string): SitemapUrlEntry[] {
    return STATIC_PATHS.map(({ path, changefreq, priority }) => ({
        loc: pathToLoc(base, path),
        changefreq,
        priority,
    }))
}

export function propertyToSitemapEntry(base: string, property: PropertyForSitemap): SitemapUrlEntry {
    const id = String(property.id)
    const loc = pathToLoc(base, `/property/${id}`)
    const imgLoc = toAbsoluteUrl(base, property.imageUrl)
    const images =
        imgLoc.length > 0
            ? [
                  {
                      loc: imgLoc,
                      title: property.title.slice(0, 200),
                  },
              ]
            : undefined

    return {
        loc,
        changefreq: 'weekly',
        priority: '0.8',
        images,
    }
}

export function buildSitemapXml(entries: SitemapUrlEntry[]): string {
    const lines: string[] = [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"`,
        `        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">`,
    ]

    for (const e of entries) {
        lines.push('  <url>')
        lines.push(`    <loc>${escapeXml(e.loc)}</loc>`)
        if (e.lastmod) lines.push(`    <lastmod>${escapeXml(e.lastmod)}</lastmod>`)
        if (e.changefreq) lines.push(`    <changefreq>${escapeXml(e.changefreq)}</changefreq>`)
        if (e.priority) lines.push(`    <priority>${escapeXml(e.priority)}</priority>`)
        if (e.images?.length) {
            for (const img of e.images) {
                lines.push('    <image:image>')
                lines.push(`      <image:loc>${escapeXml(img.loc)}</image:loc>`)
                lines.push(`      <image:title>${escapeXml(img.title)}</image:title>`)
                lines.push('    </image:image>')
            }
        }
        lines.push('  </url>')
    }

    lines.push('</urlset>')
    return lines.join('\n')
}

export function buildRobotsTxt(base: string): string {
    return [
        'User-agent: *',
        'Disallow: /api/',
        'Disallow: /admin',
        'Disallow: /auth',
        'Disallow: /dashboard',
        'Disallow: /profile',
        'Disallow: /agent/dashboard',
        'Disallow: /test-page',
        'Disallow: /verify-email',
        '',
        `Sitemap: ${base}/sitemap.xml`,
        '',
    ].join('\n')
}
