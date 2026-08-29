/**
 * Server-rendered Open Graph / Twitter Card / JSON-LD tags for link-preview bots.
 *
 * Why this exists: the app is a client-rendered SPA (see server/vite.ts — every
 * unmatched route just gets the same static index.html, and PageSeo.tsx injects
 * real tags via a useEffect *after* React hydrates). Google's crawler runs that
 * JS and sees the tags fine, but the crawlers that generate link-preview cards —
 * WhatsApp, Facebook, Twitter/X, LinkedIn, Telegram, Slack, Discord, iMessage —
 * generally fetch the raw HTML and do not execute JavaScript. Today they all see
 * the same generic title with no image, on every page. For a platform whose
 * primary growth loop is "someone shares a property link", that's the single
 * biggest lever in reach — bigger than any further visual redesign.
 *
 * Approach: this is "dynamic rendering" — a long-established, non-deceptive
 * pattern (not cloaking) because the served content matches what a user would
 * eventually see, just rendered ahead of time for bots that can't run JS. It's
 * gated purely on User-Agent and only ever *adds* a served response for a small,
 * explicit allowlist of already-public routes; it never changes what real users
 * or Googlebot receive.
 *
 * Metadata source of truth is shared/seo.ts, imported by both this file and the
 * client's PageSeo/propertySeo — so a bot and a hydrated browser never disagree
 * about a URL's title/description.
 */
import type { Express, Request, Response, NextFunction } from 'express'
import type { storage as storageType } from './storage'
import {
    CATEGORY_PAGE_META,
    SITE_NAME,
    buildPropertyJsonLd,
    buildPropertyMetaDescription,
    buildPropertyPageTitle,
    defaultOgImageUrl,
    absolutePropertyImageUrl,
} from '../shared/seo'
import { getCanonicalBaseUrl } from './sitemap'

// Known link-unfurling / social-preview crawlers. Deliberately excludes Googlebot/
// Bingbot: those already execute JS and index the SPA correctly, so leaving them
// off this list means their rendering path never depends on this bot list staying
// current — the sole job here is fixing sharing previews for bots that can't.
const SOCIAL_BOT_UA = /facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|TelegramBot|WhatsApp|Discordbot|redditbot|Pinterest|Iframely|SkypeUriPreview|vkShare|Applebot|W3C_Validator/i

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

type MetaInput = {
    title: string
    description: string
    url: string
    image: string
    type?: 'website' | 'article'
    jsonLd?: Record<string, unknown> | Record<string, unknown>[]
}

function renderMetaHtml({ title, description, url, image, type = 'website', jsonLd }: MetaInput): string {
    const t = escapeHtml(title)
    const d = escapeHtml(description)
    const jsonLdScript = jsonLd
        ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`
        : ''

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${t}</title>
<meta name="description" content="${d}" />
<link rel="canonical" href="${escapeHtml(url)}" />
<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />
<meta property="og:type" content="${type}" />
<meta property="og:title" content="${t}" />
<meta property="og:description" content="${d}" />
<meta property="og:url" content="${escapeHtml(url)}" />
<meta property="og:image" content="${escapeHtml(image)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:locale" content="en_UG" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${t}" />
<meta name="twitter:description" content="${d}" />
<meta name="twitter:image" content="${image}" />
${jsonLdScript}
</head>
<body>
<h1>${t}</h1>
<p>${d}</p>
<p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>
</body>
</html>`
}

export function registerSocialPreviewRoutes(app: Express, storage: typeof storageType) {
    const isSocialBot = (req: Request) => SOCIAL_BOT_UA.test(req.headers['user-agent'] || '')

    // Only intercept for matched bots; everyone else (real users, Googlebot) falls
    // straight through to the normal SPA / static handling untouched.
    const guard = (handler: (req: Request, res: Response, next: NextFunction) => void | Promise<void>) =>
        async (req: Request, res: Response, next: NextFunction) => {
            if (!isSocialBot(req)) return next()
            try {
                await handler(req, res, next)
            } catch (error) {
                console.error('[social-preview] failed, falling through to SPA:', error)
                next()
            }
        }

    const base = () => getCanonicalBaseUrl()

    const categoryRoute = (routePath: string, meta: (typeof CATEGORY_PAGE_META)[keyof typeof CATEGORY_PAGE_META]) => {
        app.get(
            routePath,
            guard((_req, res, _next) => {
                const b = base()
                res.type('html').send(
                    renderMetaHtml({
                        title: meta.title,
                        description: meta.description,
                        url: `${b}${meta.path}`,
                        image: defaultOgImageUrl(b),
                        jsonLd: {
                            '@context': 'https://schema.org',
                            '@type': 'CollectionPage',
                            name: meta.title,
                            description: meta.description,
                            url: `${b}${meta.path}`,
                        },
                    })
                )
            })
        )
    }

    categoryRoute('/', CATEGORY_PAGE_META.home)
    categoryRoute('/bnbs', CATEGORY_PAGE_META.bnbs)
    categoryRoute('/bank-sales', CATEGORY_PAGE_META.bankSales)
    categoryRoute('/rental-units', CATEGORY_PAGE_META.rentalUnits)
    categoryRoute('/for-sale', CATEGORY_PAGE_META.forSale)
    categoryRoute('/featured-properties', CATEGORY_PAGE_META.featuredProperties)

    app.get(
        '/property/:id',
        guard(async (req, res, next) => {
            const id = parseInt(req.params.id, 10)
            if (!Number.isFinite(id)) return next()

            const property = await storage.getProperty(id)
            if (!property) return next()

            const b = base()
            const propertyPath = `/property/${id}`
            res.type('html').send(
                renderMetaHtml({
                    title: buildPropertyPageTitle(property),
                    description: buildPropertyMetaDescription(property),
                    url: `${b}${propertyPath}`,
                    image: absolutePropertyImageUrl(b, property) || defaultOgImageUrl(b),
                    jsonLd: buildPropertyJsonLd(b, property, propertyPath),
                })
            )
        })
    )
}
