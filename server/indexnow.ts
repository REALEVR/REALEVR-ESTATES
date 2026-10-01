/**
 * IndexNow: tells Bing, Yandex, Seznam, Naver and Yahoo (and the AI search tools built on them)
 * that pages exist or changed, so they are crawled within hours instead of waiting for a sitemap
 * to be found. No account or console is needed: the proof of ownership is a key file served from
 * our own domain. Google does not take part in IndexNow; for Google the sitemap is listed in
 * robots.txt (so it is discovered on its own) and can be submitted in Search Console.
 */
import { createHash } from 'crypto'
import type { Express } from 'express'

const ENDPOINT = 'https://api.indexnow.org/indexnow'
const BATCH = 9000 // the protocol allows 10,000 URLs per call
const REFRESH_MS = 6 * 60 * 60 * 1000
const FIRST_RUN_DELAY_MS = 90 * 1000

/** The key is public by design (it is served at /<key>.txt). Derived from the domain unless set. */
export function indexNowKey(baseUrl: string): string {
    const fromEnv = (process.env.INDEXNOW_KEY || '').trim()
    if (/^[a-zA-Z0-9-]{8,128}$/.test(fromEnv)) return fromEnv
    return createHash('sha256').update(`indexnow:${baseUrl}`).digest('hex').slice(0, 32)
}

function isPublicHost(baseUrl: string): boolean {
    try {
        const host = new URL(baseUrl).hostname
        return !/^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.)/.test(host) && host.includes('.')
    } catch {
        return false
    }
}

export function registerIndexNowKeyRoute(app: Express, getBaseUrl: () => string) {
    app.get('/:key([a-zA-Z0-9-]{8,128}).txt', (req, res, next) => {
        const key = indexNowKey(getBaseUrl())
        if (req.params.key !== key) return next()
        res.type('text/plain; charset=utf-8').send(key)
    })
}

/**
 * Submits every public URL once, then only the ones that are new since the last submission.
 * Never throws: indexing is a bonus, not something that may break the site.
 */
export function startIndexNowSubmitter(getBaseUrl: () => string, getUrls: () => Promise<string[]>) {
    if (process.env.NODE_ENV !== 'production' || process.env.INDEXNOW_DISABLED === '1') return
    const sent = new Set<string>()

    const run = async () => {
        try {
            const base = getBaseUrl().replace(/\/+$/, '')
            if (!isPublicHost(base)) return
            const fresh = (await getUrls()).filter((u) => !sent.has(u))
            if (!fresh.length) return
            const key = indexNowKey(base)
            for (let i = 0; i < fresh.length; i += BATCH) {
                const urlList = fresh.slice(i, i + BATCH)
                const res = await fetch(ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json; charset=utf-8' },
                    body: JSON.stringify({
                        host: new URL(base).hostname,
                        key,
                        keyLocation: `${base}/${key}.txt`,
                        urlList,
                    }),
                })
                if (res.status === 200 || res.status === 202) {
                    urlList.forEach((u) => sent.add(u))
                    console.log(`[indexnow] submitted ${urlList.length} URLs (HTTP ${res.status})`)
                } else {
                    console.warn(`[indexnow] not accepted (HTTP ${res.status}); will retry later`)
                }
            }
        } catch (err) {
            console.warn('[indexnow] submit failed:', (err as Error).message)
        }
    }

    setTimeout(run, FIRST_RUN_DELAY_MS).unref()
    setInterval(run, REFRESH_MS).unref()
}
