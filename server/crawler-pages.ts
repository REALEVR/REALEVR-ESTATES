/**
 * Pages for crawlers: search engines (Googlebot, Bingbot), AI crawlers (GPTBot, ClaudeBot, PerplexityBot, ...) and
 * link-preview bots (WhatsApp, Facebook, X, LinkedIn, Slack, ...).
 *
 * The site is a single-page app. People get the app; many crawlers, and most AI crawlers, fetch the HTML and do not run
 * JavaScript, so without this they would see an empty shell. For those requests the server answers with finished HTML:
 * the page's real content, its title, description, canonical address and structured data, and ordinary links to the rest
 * of the site. It is the same content a person sees, rendered ahead of time ("dynamic rendering", which Google documents
 * as acceptable), and it only ever answers for public pages. Everyone else gets the app, untouched.
 *
 * Content pages (about, guides, legal, ...) are the real React pages rendered on the server (server/ssr/static-pages.tsx,
 * built to dist/ssr/static-pages.cjs). Listing pages, property pages, places and agents are built from the data here.
 * If the bundle is missing, content pages fall back to a short page with their title and description, so nothing breaks.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import type { Express, NextFunction, Request, Response } from 'express'
import type { storage as storageType } from './storage'
import {
    CATEGORY_PAGE_META,
    SITE_NAME,
    absoluteAgentImageUrl,
    absolutePropertyImageUrl,
    buildAgentPortfolioDescription,
    buildAgentPortfolioJsonLd,
    buildAgentPortfolioTitle,
    buildPlaceHomesMeta,
    buildPropertyJsonLd,
    buildPropertyMetaDescription,
    buildPropertyPageTitle,
    defaultOgImageUrl,
} from '../shared/seo'
import { PAGE_FAQS, faqJsonLd, type FaqPage } from '../shared/seo-faq'
import { cityBySlug, countryBySlug, inferListingCountry, listingCity } from '../shared/africa'
import { getCanonicalBaseUrl } from './sitemap'
import { getPublicAgentPortfolio } from './gene/agent-portfolio'

/** Search engines, AI crawlers and link-preview bots. Real people and unknown clients never match. */
export const CRAWLER_UA =
    /Googlebot|AdsBot-Google|Google-InspectionTool|GoogleOther|bingbot|BingPreview|msnbot|DuckDuckBot|YandexBot|Baiduspider|Slurp|Applebot|GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-Web|Claude-User|Claude-SearchBot|anthropic-ai|PerplexityBot|Perplexity-User|CCBot|Bytespider|Amazonbot|cohere-ai|Meta-ExternalAgent|Meta-ExternalFetcher|Diffbot|YouBot|facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|TelegramBot|WhatsApp|Discordbot|redditbot|Pinterest|Iframely|SkypeUriPreview|vkShare|W3C_Validator/i

const esc = (s: unknown) =>
    String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')

const jsonLdScript = (obj: unknown) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`

// ---------------------------------------------------------------------------
// The finished page
// ---------------------------------------------------------------------------

export interface CrawlerPage {
    title: string
    description: string
    /** Path such as /guides/x (no origin). */
    path: string
    image?: string
    type?: 'website' | 'article'
    jsonLd?: unknown[]
    /** The page's main content (already HTML). */
    body: string
    /** Tell crawlers not to index (used for empty or unknown places). */
    noindex?: boolean
}

const NAV: Array<[string, string]> = [
    ['/for-sale', 'Homes for sale'],
    ['/rental-units', 'Rental units'],
    ['/bnbs', 'BnBs and short stays'],
    ['/bank-sales', 'Bank auctions'],
    ['/guides', 'Guides'],
    ['/compare', 'Compare sites'],
    ['/how-it-works', 'How it works'],
    ['/about', 'About'],
    ['/help', 'Help'],
    ['/contact', 'Contact'],
]
const FOOTER: Array<[string, string]> = [
    ['/fees', 'Fees'],
    ['/partners', 'Partners'],
    ['/careers', 'Careers'],
    ['/trust-safety', 'Trust and safety'],
    ['/host-responsibly', 'Host responsibly'],
    ['/legal', 'Legal'],
    ['/terms', 'Terms'],
    ['/privacy', 'Privacy'],
    ['/cookies', 'Cookies'],
    ['/refund-policy', 'Refunds'],
    ['/homes/uganda', 'Homes in Uganda'],
    ['/homes/kenya', 'Homes in Kenya'],
    ['/homes/tanzania', 'Homes in Tanzania'],
    ['/homes/rwanda', 'Homes in Rwanda'],
]

const links = (items: Array<[string, string]>) => items.map(([p, l]) => `<a href="${p}">${esc(l)}</a>`).join(' · ')

/** Search Console / Bing ownership tags, when the owner has set them (see docs/SEO_PLAYBOOK.md). */
function verificationTags(): string {
    const g = (process.env.GOOGLE_SITE_VERIFICATION || '').trim()
    const b = (process.env.BING_SITE_VERIFICATION || '').trim()
    return [g && `<meta name="google-site-verification" content="${esc(g)}" />`, b && `<meta name="msvalidate.01" content="${esc(b)}" />`].filter(Boolean).join('\n')
}

export function organizationJsonLd(base: string) {
    const sameAs = (process.env.SEO_SAME_AS || '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => /^https:\/\//.test(s))
    return {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'Organization',
                '@id': `${base}/#organization`,
                name: SITE_NAME,
                url: base,
                logo: `${base}/icon-512.png`,
                ...(sameAs.length ? { sameAs } : {}),
            },
            {
                '@type': 'WebSite',
                '@id': `${base}/#website`,
                url: base,
                name: SITE_NAME,
                publisher: { '@id': `${base}/#organization` },
                potentialAction: { '@type': 'SearchAction', target: `${base}/properties?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
            },
        ],
    }
}

export function renderCrawlerHtml(page: CrawlerPage, base: string): string {
    const url = `${base}${page.path === '/' ? '/' : page.path}`
    const image = page.image || defaultOgImageUrl(base)
    const t = esc(page.title)
    const d = esc(page.description)
    const ld = [organizationJsonLd(base), ...(page.jsonLd ?? [])].map(jsonLdScript).join('\n')
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${t}</title>
<meta name="description" content="${d}" />
<meta name="robots" content="${page.noindex ? 'noindex,follow' : 'index,follow,max-image-preview:large,max-snippet:-1'}" />
<link rel="canonical" href="${esc(url)}" />
<link rel="icon" href="/favicon.ico" sizes="any" />
${verificationTags()}
<meta property="og:site_name" content="${esc(SITE_NAME)}" />
<meta property="og:type" content="${page.type ?? 'website'}" />
<meta property="og:title" content="${t}" />
<meta property="og:description" content="${d}" />
<meta property="og:url" content="${esc(url)}" />
<meta property="og:image" content="${esc(image)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:locale" content="en_UG" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${t}" />
<meta name="twitter:description" content="${d}" />
<meta name="twitter:image" content="${esc(image)}" />
${ld}
</head>
<body>
<header><p><a href="/">${esc(SITE_NAME)}</a></p><nav aria-label="Main">${links(NAV)}</nav></header>
<main>
${page.body}
</main>
<footer><nav aria-label="Footer">${links(FOOTER)}</nav><p>&copy; ${esc(SITE_NAME)}. Virtual tours of homes to rent, buy and book across Africa.</p></footer>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Content pages: the real React pages, rendered on the server
// ---------------------------------------------------------------------------

type StaticModule = { renderStaticPage: (path: string, base: string) => { html: string; seo: any } | null; STATIC_PATHS: string[] }
let staticModule: StaticModule | null | undefined

function loadStatic(): StaticModule | null {
    if (staticModule !== undefined) return staticModule
    try {
        const file = path.resolve(process.cwd(), 'dist', 'ssr', 'static-pages.cjs')
        staticModule = fs.existsSync(file) ? (createRequire(path.join(process.cwd(), 'noop.js'))(file) as StaticModule) : null
    } catch (err) {
        console.warn('[crawler-pages] could not load the rendered content pages, using the fallback page:', err)
        staticModule = null
    }
    return staticModule
}

/** Titles and descriptions for content pages, used only when the rendered bundle is missing. */
const FALLBACK_META: Record<string, [string, string]> = {
    '/about': ['About RealEVR Estates', 'RealEVR Estates puts a 360° virtual tour on every rental, BnB, home for sale and bank auction.'],
    '/how-it-works': ['How RealEVR Estates Works', 'How to find a home, take a 360° tour and rent, book or buy.'],
    '/help': ['Help Center | RealEVR Estates', 'Answers to common questions about tours, listings, payments and bookings.'],
    '/contact': ['Contact RealEVR Estates', 'Email, phone and WhatsApp for RealEVR Estates.'],
    '/trust-safety': ['Trust & Safety | RealEVR Estates', 'How RealEVR Estates keeps listings and payments safe.'],
}

function staticPage(p: string, base: string): CrawlerPage | null {
    const mod = loadStatic()
    const rendered = mod?.renderStaticPage(p, base)
    if (rendered && rendered.seo) {
        return {
            title: rendered.seo.title,
            description: rendered.seo.description ?? '',
            path: rendered.seo.canonicalPath ?? p,
            image: rendered.seo.image,
            type: rendered.seo.type,
            jsonLd: rendered.seo.jsonLd ? (Array.isArray(rendered.seo.jsonLd) ? rendered.seo.jsonLd : [rendered.seo.jsonLd]) : [],
            body: rendered.html,
        }
    }
    if (rendered) {
        // Rendered but the page declares no tags: use a plain title from the heading.
        const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(rendered.html)?.[1]?.replace(/<[^>]+>/g, '').trim() || SITE_NAME
        return { title: `${h1} | ${SITE_NAME}`, description: '', path: p, body: rendered.html }
    }
    const fb = FALLBACK_META[p]
    if (fb) return { title: fb[0], description: fb[1], path: p, body: `<h1>${esc(fb[0])}</h1><p>${esc(fb[1])}</p>` }
    return null
}

// ---------------------------------------------------------------------------
// Listing pages, from data
// ---------------------------------------------------------------------------

type Prop = {
    id: number
    title: string
    location: string
    price: number
    currency?: string | null
    bedrooms?: number | null
    bathrooms?: number | null
    category?: string | null
    propertyType?: string | null
    isAvailable?: boolean | null
    description?: string | null
    amenities?: string[] | null
    squareMeters?: number | null
    imageUrl?: string | null
    latitude?: number | null
    longitude?: number | null
    hasTour?: boolean | null
}

const money = (p: Prop) => `${p.currency || 'UGX'} ${Number(p.price).toLocaleString('en-US')}`
const perUnit = (p: Prop) => (p.category === 'rental_units' ? ' per month' : p.category === 'furnished_houses' || p.category === 'BnB' ? ' per night' : '')

function listHtml(props: Prop[], limit = 60): string {
    if (!props.length) return '<p>No homes are listed here right now. Check back soon, or browse all homes.</p>'
    return `<ul>${props
        .slice(0, limit)
        .map(
            (p) =>
                `<li><a href="/property/${p.id}">${esc(p.title)}</a> · ${esc(p.location)} · ${p.bedrooms ?? 0} bed, ${p.bathrooms ?? 0} bath · ${esc(money(p))}${perUnit(p)}${p.hasTour ? ' · 360° tour' : ''}</li>`
        )
        .join('')}</ul>`
}

function faqHtml(page: FaqPage): string {
    return `<section><h2>Questions people ask</h2>${PAGE_FAQS[page].map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join('')}</section>`
}

const CATEGORY_PAGES: Record<string, { key: keyof typeof CATEGORY_PAGE_META; h1: string; intro: string; filter: (p: Prop) => boolean; faq?: FaqPage }> = {
    '/for-sale': {
        key: 'forSale',
        h1: 'Homes and land for sale, with 360° virtual tours',
        intro: 'Walk through every home before you visit. You can also ask to buy a home with Bitcoin or another digital currency.',
        filter: (p) => p.category === 'for_sale',
        faq: 'forSale',
    },
    '/rental-units': {
        key: 'rentalUnits',
        h1: 'Apartments and houses to rent, with 360° virtual tours',
        intro: 'Filter by area, bedrooms and monthly rent, then tour each home online first.',
        filter: (p) => p.category === 'rental_units',
        faq: 'rentalUnits',
    },
    '/bnbs': {
        key: 'bnbs',
        h1: 'Furnished BnBs and short stays, with 360° virtual tours',
        intro: 'See the rooms before you book. Many hosts offer a lower monthly rate for long stays.',
        filter: (p) => p.category === 'furnished_houses' || p.category === 'BnB',
        faq: 'bnbs',
    },
    '/bank-sales': {
        key: 'bankSales',
        h1: 'Bank property auctions, with 360° virtual tours',
        intro: 'Repossessed properties sold by banks, with live bidding and verified bidders.',
        filter: (p) => p.category === 'bank_sales',
        faq: 'bankSales',
    },
    '/featured-properties': {
        key: 'featuredProperties',
        h1: 'Featured homes with 360° virtual tours',
        intro: 'A hand-picked selection of rentals, stays, homes for sale and bank auctions.',
        filter: (p) => !!(p as any).isFeatured,
    },
    '/properties': { key: 'allProperties', h1: 'Every home on RealEVR Estates', intro: 'Rentals, BnBs, homes for sale and bank auctions in one list.', filter: () => true },
    '/new-listings': { key: 'newListings', h1: 'New listings', intro: 'The newest homes added to RealEVR Estates.', filter: () => true },
}

async function categoryPage(p: string, storage: typeof storageType, base: string): Promise<CrawlerPage | null> {
    const def = CATEGORY_PAGES[p]
    if (!def) return null
    const meta = CATEGORY_PAGE_META[def.key]
    const all = ((await storage.getAllProperties()) as unknown as Prop[]).filter((x) => x.isAvailable !== false)
    let list = all.filter(def.filter)
    if (p === '/new-listings') list = [...list].sort((a, b) => b.id - a.id)
    const body = `<h1>${esc(def.h1)}</h1><p>${esc(def.intro)}</p><h2>${list.length} ${list.length === 1 ? 'home' : 'homes'} listed</h2>${listHtml(list)}${def.faq ? faqHtml(def.faq) : ''}<p><a href="/guides">Read our guides</a> · <a href="/how-it-works">How it works</a></p>`
    return {
        title: meta.title,
        description: meta.description,
        path: meta.path,
        body,
        jsonLd: [
            {
                '@context': 'https://schema.org',
                '@type': 'CollectionPage',
                name: meta.title,
                description: meta.description,
                url: `${base}${meta.path}`,
                mainEntity: { '@type': 'ItemList', itemListElement: list.slice(0, 30).map((x, i) => ({ '@type': 'ListItem', position: i + 1, url: `${base}/property/${x.id}`, name: x.title })) },
            },
            ...(def.faq ? [faqJsonLd(PAGE_FAQS[def.faq])] : []),
        ],
    }
}

async function homePage(storage: typeof storageType, base: string): Promise<CrawlerPage> {
    const meta = CATEGORY_PAGE_META.home
    const all = ((await storage.getAllProperties()) as unknown as Prop[]).filter((x) => x.isAvailable !== false)
    const sections: Array<[string, string, (p: Prop) => boolean]> = [
        ['/for-sale', 'Homes for sale', (p) => p.category === 'for_sale'],
        ['/rental-units', 'Rental units', (p) => p.category === 'rental_units'],
        ['/bnbs', 'BnBs and short stays', (p) => p.category === 'furnished_houses' || p.category === 'BnB'],
        ['/bank-sales', 'Bank auctions', (p) => p.category === 'bank_sales'],
    ]
    const body =
        `<h1>Virtual tours of homes to rent, buy and book across Africa</h1>` +
        `<p>RealEVR Estates puts a 360° virtual tour on every listing, so you can walk through a home on your phone, tablet, computer or VR headset before you visit. We started in Uganda and list homes across Africa.</p>` +
        sections.map(([href, label, f]) => `<section><h2><a href="${href}">${esc(label)}</a></h2>${listHtml(all.filter(f), 8)}</section>`).join('') +
        `<section><h2>Where can I find homes?</h2><p><a href="/homes/uganda">Uganda</a> · <a href="/homes/kenya">Kenya</a> · <a href="/homes/tanzania">Tanzania</a> · <a href="/homes/rwanda">Rwanda</a></p></section>` +
        faqHtml('home')
    return {
        title: meta.title,
        description: meta.description,
        path: '/',
        body,
        jsonLd: [{ '@context': 'https://schema.org', '@type': 'WebPage', name: meta.title, description: meta.description, url: `${base}/` }, faqJsonLd(PAGE_FAQS.home)],
    }
}

async function propertyPage(id: number, storage: typeof storageType, base: string): Promise<CrawlerPage | null> {
    const property = (await storage.getProperty(id)) as unknown as Prop | undefined
    if (!property) return null
    const propertyPath = `/property/${id}`
    const all = ((await storage.getAllProperties()) as unknown as Prop[]).filter((x) => x.isAvailable !== false && x.id !== id)
    const similar = all.filter((x) => x.category === property.category && x.location === property.location).slice(0, 6)
    const more = similar.length ? similar : all.filter((x) => x.category === property.category).slice(0, 6)
    const back = property.category === 'rental_units' ? '/rental-units' : property.category === 'for_sale' ? '/for-sale' : property.category === 'bank_sales' ? '/bank-sales' : '/bnbs'
    const kind = property.category === 'rental_units' ? 'for rent' : property.category === 'bank_sales' ? 'at bank auction' : property.category === 'for_sale' ? 'for sale' : 'to book'
    const body =
        `<h1>${esc(property.title)}</h1>` +
        `<p>${esc(property.propertyType || 'Property')} ${kind} in ${esc(property.location)}. ${property.bedrooms ?? 0} bedrooms, ${property.bathrooms ?? 0} bathrooms${property.squareMeters ? `, ${property.squareMeters} m²` : ''}. Price: ${esc(money(property))}${perUnit(property)}.</p>` +
        `<p>${esc(property.description || '')}</p>` +
        (property.amenities?.length ? `<h2>What amenities does it have?</h2><ul>${property.amenities.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : '') +
        `<h2>Where is it?</h2><p>${esc(property.location)}.</p>` +
        (property.category === 'for_sale' || property.category === 'bank_sales' ? `<h2>Can I buy it with Bitcoin?</h2><p>You can ask. The seller must agree to accept digital currency, and payment goes to an escrow or the seller’s lawyer on written instructions. See <a href="/guides/how-to-buy-a-house-with-bitcoin">how to buy a house with Bitcoin</a>.</p>` : '') +
        (more.length ? `<h2>Similar homes</h2>${listHtml(more, 6)}` : '') +
        `<p><a href="${back}">Back to the list</a></p>`
    return {
        title: buildPropertyPageTitle(property as any),
        description: buildPropertyMetaDescription(property as any),
        path: propertyPath,
        image: absolutePropertyImageUrl(base, property as any) || defaultOgImageUrl(base),
        body,
        jsonLd: [buildPropertyJsonLd(base, property as any, propertyPath)],
    }
}

async function placePage(countrySlug: string, citySlug: string | undefined, storage: typeof storageType, base: string): Promise<CrawlerPage | null> {
    const country = countryBySlug(countrySlug)
    if (!country) return null
    const city = citySlug ? cityBySlug(country, citySlug) : undefined
    if (citySlug && !city) return null
    const listings = ((await storage.getAllProperties()) as unknown as any[]).filter((p) => p.isAvailable !== false)
    const here = listings.filter((p) => inferListingCountry(p) === country.code && (!city || listingCity(p)?.name === city.name))
    const meta = buildPlaceHomesMeta({ country: country.name, city: city?.name, count: here.length })
    const where = city ? `${city.name}, ${country.name}` : country.name
    const body = `<h1>Homes in ${esc(where)}, with 360° virtual tours</h1><p>${esc(meta.description)}</p>${listHtml(here as Prop[])}<p><a href="/for-sale">Homes for sale</a> · <a href="/rental-units">Rental units</a> · <a href="/bnbs">BnBs</a></p>`
    return {
        title: meta.title,
        description: meta.description,
        path: `/homes/${countrySlug}${citySlug ? `/${citySlug}` : ''}`,
        body,
        // An empty place is a thin page: let people see it, but do not ask search engines to index it.
        noindex: here.length === 0,
        jsonLd: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: meta.title, description: meta.description, url: `${base}/homes/${countrySlug}${citySlug ? `/${citySlug}` : ''}` }],
    }
}

async function agentPage(username: string, base: string): Promise<CrawlerPage | null> {
    const data = await getPublicAgentPortfolio(username)
    if (!data) return null
    const agentPath = `/agent/${encodeURIComponent(username)}`
    const body = `<h1>${esc(data.agent.fullName)}</h1><p>${esc(data.portfolio.bio || '')}</p><p>${esc(buildAgentPortfolioDescription({ ...data.agent, ...data.stats }))}</p>`
    return {
        title: buildAgentPortfolioTitle(data.agent),
        description: buildAgentPortfolioDescription({ ...data.agent, ...data.stats }),
        path: agentPath,
        image: absoluteAgentImageUrl(base, data.portfolio.avatarUrl) || defaultOgImageUrl(base),
        body,
        jsonLd: [buildAgentPortfolioJsonLd(base, { ...data.agent, bio: data.portfolio.bio, avatarUrl: data.portfolio.avatarUrl }, agentPath)],
    }
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

export async function buildCrawlerPage(urlPath: string, storage: typeof storageType, base: string): Promise<CrawlerPage | null> {
    const p = urlPath.length > 1 ? urlPath.replace(/\/+$/, '') : urlPath
    if (p === '/') return homePage(storage, base)
    if (CATEGORY_PAGES[p]) return categoryPage(p, storage, base)
    let m = /^\/property\/(\d+)$/.exec(p)
    if (m) return propertyPage(Number(m[1]), storage, base)
    m = /^\/homes\/([^/]+)(?:\/([^/]+))?$/.exec(p)
    if (m) return placePage(m[1], m[2], storage, base)
    m = /^\/agent\/([^/]+)$/.exec(p)
    if (m && m[1] !== 'register' && m[1] !== 'dashboard') return agentPage(decodeURIComponent(m[1]), base)
    return staticPage(p, base)
}

export function registerCrawlerRoutes(app: Express, storage: typeof storageType) {
    // Only GET/HEAD from a known crawler, and only for public pages. Anything that fails falls through to the app.
    app.use(async (req: Request, res: Response, next: NextFunction) => {
        if ((req.method !== 'GET' && req.method !== 'HEAD') || !CRAWLER_UA.test(req.headers['user-agent'] || '')) return next()
        if (req.path.startsWith('/api/') || /\.[a-z0-9]{2,5}$/i.test(req.path)) return next()
        try {
            const base = getCanonicalBaseUrl()
            const page = await buildCrawlerPage(req.path, storage, base)
            if (!page) return next()
            res.set('Cache-Control', 'public, max-age=300').set('Vary', 'User-Agent').type('html').send(renderCrawlerHtml(page, base))
        } catch (err) {
            console.error('[crawler-pages] failed, falling through to the app:', err)
            next()
        }
    })
}
