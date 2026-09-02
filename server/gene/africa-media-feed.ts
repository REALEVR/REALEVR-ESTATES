/**
 * GENE Platform — Africa real estate media pulse.
 *
 * Backs the homepage hero's "Africa Real Estate Pulse" panel: a real,
 * honestly-sourced feed of real estate news from across Africa, mixed
 * client-side with the platform's own live listing photos.
 *
 * Same "never invent what you don't have" policy as
 * personal-agent.ts's world-news feed (which this module is deliberately
 * modeled on) and btc-payments.ts's live-rate requirement: without
 * NEWS_API_KEY (https://newsapi.org or a compatible provider using the
 * same query/response shape) configured, this endpoint returns
 * `{ configured: false, items: [] }` — never fabricated headlines, never
 * a fake "live" claim. The client falls back to showing only the
 * platform's own real listing photos in that case (see
 * AfricaRealEstatePulse.tsx), which is honestly always "live" since it's
 * this platform's actual current inventory.
 *
 * This endpoint is deliberately PUBLIC (no requireUser) — unlike
 * personal-agent.ts's authenticated /api/gene/agent/news, this feed is
 * meant to be visible to anonymous homepage visitors, which is the whole
 * point of putting it in the hero.
 */
import type { Express, Request, Response } from 'express'
import { readCollection, writeCollection, nextId, nowIso } from './store'

const NEWS_CACHE_COLLECTION = 'gene_africa_media_news_cache'
const NEWS_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour — same TTL as personal-agent.ts's world-news cache

// Real estate + property + housing market coverage across Africa, biased
// toward East Africa (this platform's actual current market) but not
// limited to it, since the user asked for "the whole of Africa."
const AFRICA_REAL_ESTATE_QUERY =
    '(real estate OR property market OR housing) AND (Africa OR Uganda OR Kenya OR Tanzania OR Rwanda OR Nigeria OR Ghana OR "South Africa")'

export interface AfricaNewsItem {
    title: string
    url: string
    source: string
    publishedAt: string
    description?: string
    imageUrl?: string
}

interface NewsCacheRow {
    id: number
    query: string
    fetchedAt: string
    items: AfricaNewsItem[]
}

// Exported (not just used internally) so other GENE modules — the AI
// workforce's Newsroom Analyst / Market Intelligence Scout agents in
// ai-workforce.ts — can reuse the same real, cached news source instead of
// hitting NewsAPI a second time for the same query.
export async function fetchAfricaRealEstateNews(): Promise<{
    configured: boolean
    items: AfricaNewsItem[]
    fetchedAt: string | null
}> {
    const apiKey = process.env.NEWS_API_KEY
    if (!apiKey) return { configured: false, items: [], fetchedAt: null }

    const rows = readCollection<NewsCacheRow>(NEWS_CACHE_COLLECTION)
    const cached = rows.find((r) => r.query === AFRICA_REAL_ESTATE_QUERY)
    if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < NEWS_CACHE_TTL_MS) {
        return { configured: true, items: cached.items, fetchedAt: cached.fetchedAt }
    }

    try {
        const url = new URL('https://newsapi.org/v2/everything')
        url.searchParams.set('q', AFRICA_REAL_ESTATE_QUERY)
        url.searchParams.set('language', 'en')
        url.searchParams.set('sortBy', 'publishedAt')
        url.searchParams.set('pageSize', '12')
        const response = await fetch(url.toString(), { headers: { 'X-Api-Key': apiKey } })
        if (!response.ok) {
            console.error('[gene/africa-media-feed] News API error', response.status, await response.text())
            return { configured: true, items: cached?.items ?? [], fetchedAt: cached?.fetchedAt ?? null }
        }
        const data: any = await response.json()
        const items: AfricaNewsItem[] = Array.isArray(data?.articles)
            ? data.articles
                  .filter((a: any) => a?.title && a.title !== '[Removed]')
                  .map((a: any) => ({
                      title: String(a.title ?? ''),
                      url: String(a.url ?? ''),
                      source: String(a.source?.name ?? 'Unknown'),
                      publishedAt: String(a.publishedAt ?? ''),
                      description: typeof a.description === 'string' ? a.description : undefined,
                      imageUrl: typeof a.urlToImage === 'string' && a.urlToImage ? a.urlToImage : undefined,
                  }))
            : []

        const fetchedAt = nowIso()
        const newRow: NewsCacheRow = { id: cached?.id ?? nextId(rows), query: AFRICA_REAL_ESTATE_QUERY, fetchedAt, items }
        const nextRows = cached ? rows.map((r) => (r.query === AFRICA_REAL_ESTATE_QUERY ? newRow : r)) : [...rows, newRow]
        writeCollection(NEWS_CACHE_COLLECTION, nextRows)

        return { configured: true, items, fetchedAt }
    } catch (err) {
        console.error('[gene/africa-media-feed] News fetch failed, serving stale cache if any:', err)
        return { configured: true, items: cached?.items ?? [], fetchedAt: cached?.fetchedAt ?? null }
    }
}

export function registerAfricaMediaFeedRoutes(app: Express): void {
    // GET /api/gene/africa-media-feed — public, no auth required (the
    // hero panel it backs is visible to anonymous visitors).
    // { configured: false, items: [] } when NEWS_API_KEY is unset — the
    // client treats that as "no news source configured yet" and shows
    // only the platform's own live listing photos instead.
    app.get('/api/gene/africa-media-feed', async (_req: Request, res: Response) => {
        try {
            const result = await fetchAfricaRealEstateNews()
            res.json(result)
        } catch (err) {
            console.error('[gene/africa-media-feed] GET /api/gene/africa-media-feed failed:', err)
            res.status(500).json({ configured: false, items: [], fetchedAt: null, message: 'Failed to load the Africa real estate feed.' })
        }
    })
}
