/**
 * Tour health: does every property's virtual tour actually load?
 *
 * A broken tour is the worst thing a listing can show a visitor, and nobody finds out until someone complains.
 * This checks every listed property that has a tour, the way a visitor's browser would:
 *
 *   - the tour page answers (not 404/403/500, not empty, not an error page);
 *   - an outside host (Lapentor, Kuula, ...) is allowed to be shown inside our site (X-Frame-Options / CSP);
 *   - the scripts and stylesheets the page names exist (a half-uploaded 3D Vista export fails here);
 *   - for a phone-captured tour: tour.json is readable and the picture of every room is there.
 *
 * It runs at start-up and every few hours (see cron/index.ts), and straight away when a visitor's viewer
 * reports a failure (the report is only a nudge: the server checks for itself before saying anything).
 * When something is wrong, the administrators are told once through every channel they have: the bell in the
 * dashboard, email, and WhatsApp (admin-notify.ts). A tour that stays broken is mentioned again once a day;
 * one that comes back is reported as fixed. Every state change is kept for the admin page.
 */
import type { Express, Request, Response } from 'express'
import { readCollection, writeCollection, nowIso } from './store'
import { storage } from '../storage'
import { notifyAdminsEverywhere } from './admin-notify'
import { requireStrictAdmin } from './admin-guard'
import { getCanonicalBaseUrl } from '../sitemap'

const COLLECTION = 'gene_tour_health'
const REQUEST_TIMEOUT_MS = 20_000
const MAX_RESOURCES = 25
const MAX_ROOMS = 40
const RENOTIFY_MS = 24 * 60 * 60 * 1000
const REPORT_COOLDOWN_MS = 10 * 60 * 1000
const RETRY_AFTER_MS = 4_000

export interface TourCheck {
    ok: boolean
    /** One plain sentence an administrator can act on. */
    reason?: string
    /** How many files were looked at. */
    checked: number
}

export interface TourHealthRow {
    propertyId: number
    title: string
    tourUrl: string
    ok: boolean
    reason?: string
    firstFailedAt?: string
    lastCheckedAt: string
    lastNotifiedAt?: string
    /** Set when a failing tour came back, until the next message mentions it. */
    recoveredAt?: string
    recoveryAnnounced?: boolean
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response | globalThis.Response>

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

async function get(fetcher: Fetcher, url: string, method: 'GET' | 'HEAD' = 'GET'): Promise<globalThis.Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
        return (await fetcher(url, {
            method,
            redirect: 'follow',
            signal: controller.signal,
            headers: { 'user-agent': 'RealEVR-TourCheck/1.0', accept: method === 'GET' ? 'text/html,application/json,*/*' : '*/*' },
        })) as globalThis.Response
    } finally {
        clearTimeout(timer)
    }
}

/** Does this response forbid being shown inside `siteOrigin`? Returns the reason, or null if it is allowed. */
export function framingProblem(headers: { get(name: string): string | null }, pageOrigin: string, siteOrigin: string): string | null {
    if (pageOrigin === siteOrigin) return null
    const xfo = (headers.get('x-frame-options') || '').toLowerCase()
    if (xfo.includes('deny') || xfo.includes('sameorigin')) return 'The tour host refuses to be shown inside our site (X-Frame-Options), so it appears blank.'
    const csp = headers.get('content-security-policy') || ''
    const m = csp.match(/frame-ancestors([^;]*)/i)
    if (m) {
        const allowed = m[1].trim().toLowerCase()
        const ours = new URL(siteOrigin).host.toLowerCase()
        const ok = allowed.includes('*') || allowed.includes(siteOrigin.toLowerCase()) || allowed.split(/\s+/).some((s) => s.replace(/^https?:\/\//, '') === ours || s === `*.${ours.split('.').slice(-2).join('.')}`)
        if (!ok) return 'The tour host only allows certain websites to show it (frame-ancestors) and ours is not one of them, so it appears blank.'
    }
    return null
}

/** The scripts and stylesheets a page needs, as absolute URLs (images are not needed to start). */
export function criticalResources(html: string, pageUrl: string): string[] {
    const found = new Set<string>()
    const add = (raw: string) => {
        const value = raw.trim()
        if (!value || value.startsWith('data:') || value.startsWith('#') || value.startsWith('javascript:') || value.startsWith('mailto:')) return
        try {
            const abs = new URL(value, pageUrl)
            if (abs.protocol === 'http:' || abs.protocol === 'https:') {
                abs.hash = ''
                found.add(abs.toString())
            }
        } catch {
            /* a malformed reference is the page's problem, not a file to fetch */
        }
    }
    for (const m of Array.from(html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi))) add(m[1])
    for (const m of Array.from(html.matchAll(/<link\b[^>]*\brel\s*=\s*["']stylesheet["'][^>]*\bhref\s*=\s*["']([^"']+)["']/gi))) add(m[1])
    for (const m of Array.from(html.matchAll(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*\brel\s*=\s*["']stylesheet["']/gi))) add(m[1])
    return Array.from(found).slice(0, MAX_RESOURCES)
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length)
    let next = 0
    await Promise.all(
        Array.from({ length: Math.min(limit, items.length) }, async () => {
            while (next < items.length) {
                const i = next++
                out[i] = await fn(items[i])
            }
        })
    )
    return out
}

async function exists(fetcher: Fetcher, url: string): Promise<boolean> {
    try {
        let res = await get(fetcher, url, 'HEAD')
        // A few hosts do not answer HEAD; ask again properly before calling a file missing.
        if (res.status === 405 || res.status === 501 || res.status === 403) res = await get(fetcher, url, 'GET')
        return res.ok
    } catch {
        return false
    }
}

const lastSegment = (url: string) => {
    try {
        return decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).slice(-2).join('/'))
    } catch {
        return url
    }
}

export async function checkTourUrl(tourUrl: string, options: { fetcher?: Fetcher; siteOrigin?: string } = {}): Promise<TourCheck> {
    const fetcher: Fetcher = options.fetcher ?? ((u, i) => fetch(u, i))
    let siteOrigin = options.siteOrigin ?? ''
    if (!siteOrigin) {
        try {
            siteOrigin = new URL(getCanonicalBaseUrl()).origin
        } catch {
            siteOrigin = ''
        }
    }
    let checked = 0

    let url: URL
    try {
        url = new URL(tourUrl)
        if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol')
    } catch {
        return { ok: false, reason: 'The tour link is not a valid web address.', checked }
    }

    let page: globalThis.Response
    try {
        page = await get(fetcher, url.toString())
    } catch (err) {
        const timedOut = (err as { name?: string })?.name === 'AbortError'
        return { ok: false, reason: timedOut ? 'The tour page did not answer within 20 seconds.' : 'The tour page could not be reached.', checked }
    }
    checked++
    if (!page.ok) return { ok: false, reason: `The tour page returned an error (HTTP ${page.status}).`, checked }

    const finalUrl = page.url || url.toString()
    let pageOrigin = url.origin
    try {
        pageOrigin = new URL(finalUrl).origin
    } catch {
        /* keep the requested origin */
    }
    const framing = siteOrigin ? framingProblem(page.headers, pageOrigin, siteOrigin) : null
    if (framing) return { ok: false, reason: framing, checked }

    const type = (page.headers.get('content-type') || '').toLowerCase()
    const html = await page.text().catch(() => '')
    if (type && !type.includes('html') && !type.includes('xml')) return { ok: false, reason: `The tour link opens a ${type.split(';')[0]} file, not a tour page.`, checked }
    if (html.trim().length < 200) return { ok: false, reason: 'The tour page is empty.', checked }

    // Files the page cannot start without.
    const resources = criticalResources(html, finalUrl)
    const results = await mapLimit(resources, 6, async (r) => ({ r, ok: await exists(fetcher, r) }))
    checked += results.length
    const missing = results.filter((x) => !x.ok)
    if (missing.length) {
        const names = missing.slice(0, 3).map((m) => lastSegment(m.r)).join(', ')
        return { ok: false, reason: `${missing.length} file${missing.length === 1 ? '' : 's'} the tour needs ${missing.length === 1 ? 'is' : 'are'} missing (${names}${missing.length > 3 ? ', ...' : ''}).`, checked }
    }

    // A phone-captured tour: the room list and the picture of each room.
    if (/tour-app\.js/i.test(html) || /id=["']tour-root["']/i.test(html)) {
        const jsonUrl = new URL('tour.json', finalUrl).toString()
        let data: any
        try {
            const res = await get(fetcher, jsonUrl)
            checked++
            if (!res.ok) return { ok: false, reason: `The tour's room list (tour.json) is missing (HTTP ${res.status}).`, checked }
            data = await res.json()
        } catch {
            return { ok: false, reason: "The tour's room list (tour.json) could not be read.", checked }
        }
        const rooms: any[] = Array.isArray(data?.rooms) ? data.rooms : []
        if (rooms.length === 0) return { ok: false, reason: 'The tour has no rooms in it.', checked }
        const pictures: Array<{ name: string; url: string }> = []
        for (const room of rooms.slice(0, MAX_ROOMS)) {
            const name = String(room?.name || room?.slug || 'a room')
            const src = room?.mode === 'panorama' ? room?.panoUrl : Array.isArray(room?.photos) ? room.photos[0] : room?.panoUrl
            if (typeof src === 'string' && src) pictures.push({ name, url: new URL(src, finalUrl).toString() })
            else return { ok: false, reason: `The room "${name}" has no picture.`, checked }
        }
        const found = await mapLimit(pictures, 5, async (p) => ({ ...p, ok: await exists(fetcher, p.url) }))
        checked += found.length
        const lost = found.filter((f) => !f.ok)
        if (lost.length) return { ok: false, reason: `The picture of ${lost.slice(0, 3).map((l) => `"${l.name}"`).join(', ')}${lost.length > 3 ? ` and ${lost.length - 3} more` : ''} is missing.`, checked }
    }

    return { ok: true, checked }
}

/** One check, tried again after a few seconds if it fails, so a hiccup is not reported as a broken tour. */
export async function checkTourWithRetry(tourUrl: string, options: { fetcher?: Fetcher; siteOrigin?: string; wait?: number } = {}): Promise<TourCheck> {
    const first = await checkTourUrl(tourUrl, options)
    if (first.ok) return first
    await new Promise((r) => setTimeout(r, options.wait ?? RETRY_AFTER_MS))
    return checkTourUrl(tourUrl, options)
}

// ---------------------------------------------------------------------------
// State and messages
// ---------------------------------------------------------------------------

const readRows = (): TourHealthRow[] => readCollection<TourHealthRow>(COLLECTION)
const writeRows = (rows: TourHealthRow[]) => writeCollection(COLLECTION, rows)

interface Listed {
    id: number
    title: string
    tourUrl: string
}

async function listedTours(): Promise<Listed[]> {
    const all = await storage.getAllProperties()
    return all
        .filter((p: any) => p.isAvailable !== false && p.hasTour !== false && typeof p.tourUrl === 'string' && p.tourUrl.trim())
        .map((p: any) => ({ id: p.id, title: p.title || `Property ${p.id}`, tourUrl: p.tourUrl.trim() }))
}

/** Fold one result into the stored state. Returns what changed so the caller knows what to say. */
export function applyResult(
    prev: TourHealthRow | undefined,
    listed: Listed,
    result: TourCheck,
    now = nowIso(),
    nowMs = Date.now()
): { row: TourHealthRow; newlyFailed: boolean; stillFailing: boolean; recovered: boolean; remind: boolean } {
    const row: TourHealthRow = {
        ...(prev ?? { propertyId: listed.id, title: listed.title, tourUrl: listed.tourUrl, ok: true, lastCheckedAt: now }),
        propertyId: listed.id,
        title: listed.title,
        tourUrl: listed.tourUrl,
        ok: result.ok,
        reason: result.ok ? undefined : result.reason,
        lastCheckedAt: now,
    }
    const wasFailing = !!prev && prev.ok === false
    let newlyFailed = false
    let recovered = false
    let remind = false
    if (!result.ok) {
        if (!wasFailing || prev?.tourUrl !== listed.tourUrl) {
            row.firstFailedAt = now
            row.lastNotifiedAt = undefined
            newlyFailed = true
        } else {
            row.firstFailedAt = prev!.firstFailedAt ?? now
            const last = prev!.lastNotifiedAt ? Date.parse(prev!.lastNotifiedAt) : 0
            remind = nowMs - last >= RENOTIFY_MS
        }
        row.recoveredAt = undefined
        row.recoveryAnnounced = undefined
    } else if (wasFailing) {
        recovered = true
        row.recoveredAt = now
        row.recoveryAnnounced = false
        row.firstFailedAt = undefined
        row.lastNotifiedAt = undefined
    }
    return { row, newlyFailed, stillFailing: !result.ok && wasFailing, recovered, remind }
}

function adminLink(id: number) {
    return `/admin/virtual-tour-manager?propertyId=${id}`
}

export function buildMessage(
    failing: Array<{ id: number; title: string; reason?: string; since?: string; isNew: boolean }>,
    fixed: Array<{ id: number; title: string }>,
    totalChecked: number,
    siteUrl = ''
): { title: string; message: string; html: string; whatsapp: string } {
    const n = failing.length
    const title =
        n > 0
            ? `${n} virtual tour${n === 1 ? '' : 's'} not loading`
            : `${fixed.length} virtual tour${fixed.length === 1 ? '' : 's'} fixed`
    const lines = failing.slice(0, 15).map((f) => `• ${f.title} (#${f.id}): ${f.reason ?? 'does not load'}${f.isNew ? '' : ' [still broken]'}`)
    if (failing.length > 15) lines.push(`… and ${failing.length - 15} more.`)
    const fixedLines = fixed.slice(0, 10).map((f) => `• ${f.title} (#${f.id})`)
    const widespread = totalChecked >= 4 && failing.length / totalChecked >= 0.6
    const intro = widespread ? 'Most tours failed at once, so the tour storage or network may be down rather than the tours themselves.\n\n' : ''
    const message = [
        intro + (n > 0 ? `These tours do not load for visitors:\n${lines.join('\n')}` : ''),
        fixed.length ? `Back to working:\n${fixedLines.join('\n')}` : '',
        n > 0 ? `Open Virtual Tours in the admin dashboard to re-upload or reconnect them${siteUrl ? ` (${siteUrl}/admin/virtual-tour-manager)` : ''}.` : '',
    ]
        .filter(Boolean)
        .join('\n\n')
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
    const html =
        `${widespread ? '<p><strong>Most tours failed at once: the tour storage or network may be down rather than the tours themselves.</strong></p>' : ''}` +
        (n > 0 ? `<p>These virtual tours do not load for visitors:</p><ul>${failing.slice(0, 15).map((f) => `<li><strong>${esc(f.title)}</strong> (#${f.id}): ${esc(f.reason ?? 'does not load')}${f.isNew ? '' : ' <em>(still broken)</em>'}</li>`).join('')}</ul>` : '') +
        (fixed.length ? `<p>Back to working:</p><ul>${fixed.slice(0, 10).map((f) => `<li>${esc(f.title)} (#${f.id})</li>`).join('')}</ul>` : '') +
        (n > 0 ? `<p>Open <a href="${siteUrl}/admin/virtual-tour-manager">Virtual Tours</a> in the admin dashboard to re-upload or reconnect them.</p>` : '')
    const whatsapp = [
        n > 0 ? `⚠️ ${title}\n${lines.join('\n')}` : `✅ ${title}`,
        fixed.length && n > 0 ? `✅ Fixed:\n${fixedLines.join('\n')}` : fixed.length ? fixedLines.join('\n') : '',
    ]
        .filter(Boolean)
        .join('\n\n')
    return { title, message, html, whatsapp: whatsapp.slice(0, 1500) }
}

// ---------------------------------------------------------------------------
// Running it
// ---------------------------------------------------------------------------

export interface TourHealthSummary {
    checked: number
    failing: number
    newlyFailing: number
    fixed: number
    notified: boolean
    at: string
}

let running: Promise<TourHealthSummary> | null = null

export interface RunOptions {
    only?: number[]
    fetcher?: Fetcher
    siteOrigin?: string
    wait?: number
    /** Test seam: replaces notifyAdminsEverywhere. */
    notify?: typeof notifyAdminsEverywhere
}

export function runTourHealth(options: RunOptions = {}): Promise<TourHealthSummary> {
    if (running && !options.only) return running
    const job = doRun(options).finally(() => {
        if (running === job) running = null
    })
    if (!options.only) running = job
    return job
}

async function doRun(options: RunOptions): Promise<TourHealthSummary> {
    const notify = options.notify ?? notifyAdminsEverywhere
    const now = nowIso()
    let tours = await listedTours()
    if (options.only) tours = tours.filter((t) => options.only!.includes(t.id))
    const rows = readRows()
    const byId = new Map(rows.map((r) => [r.propertyId, r]))

    const results = await mapLimit(tours, 4, async (t) => ({ t, result: await checkTourWithRetry(t.tourUrl, { fetcher: options.fetcher, siteOrigin: options.siteOrigin, wait: options.wait }) }))

    const toTell: Array<{ id: number; title: string; reason?: string; since?: string; isNew: boolean }> = []
    const fixed: Array<{ id: number; title: string }> = []
    let newlyFailing = 0
    for (const { t, result } of results) {
        const outcome = applyResult(byId.get(t.id), t, result, now)
        byId.set(t.id, outcome.row)
        if (outcome.newlyFailed) {
            newlyFailing++
            toTell.push({ id: t.id, title: t.title, reason: result.reason, since: outcome.row.firstFailedAt, isNew: true })
        } else if (outcome.remind) {
            toTell.push({ id: t.id, title: t.title, reason: result.reason, since: outcome.row.firstFailedAt, isNew: false })
        }
        if (outcome.recovered) fixed.push({ id: t.id, title: t.title })
    }
    // Properties that no longer have a listed tour drop out of the table (they are not broken, just gone).
    const stillListed = options.only ? null : new Set(tours.map((t) => t.id))
    let nextRows = Array.from(byId.values()).filter((r) => (stillListed ? stillListed.has(r.propertyId) : true))

    let notified = false
    if (toTell.length || fixed.length) {
        const failingNow = nextRows.filter((r) => !r.ok).length
        const msg = buildMessage(toTell, fixed, results.length || tours.length)
        try {
            await notify({
                title: msg.title,
                message: msg.message,
                html: msg.html,
                whatsappMessage: msg.whatsapp,
                link: toTell[0] ? adminLink(toTell[0].id) : '/admin/virtual-tour-manager',
                data: { kind: 'tour-health', failing: failingNow },
            })
            notified = true
            const stamp = nowIso()
            const told = new Set(toTell.map((x) => x.id))
            nextRows = nextRows.map((r) => (told.has(r.propertyId) ? { ...r, lastNotifiedAt: stamp } : r))
            const fixedIds = new Set(fixed.map((x) => x.id))
            nextRows = nextRows.map((r) => (fixedIds.has(r.propertyId) ? { ...r, recoveryAnnounced: true } : r))
        } catch (err) {
            console.error('[tour-health] could not notify the administrators:', err)
        }
    }
    writeRows(nextRows)

    const summary: TourHealthSummary = {
        checked: results.length,
        failing: nextRows.filter((r) => !r.ok).length,
        newlyFailing,
        fixed: fixed.length,
        notified,
        at: now,
    }
    console.log(`[tour-health] checked ${summary.checked} tours: ${summary.failing} failing, ${summary.newlyFailing} new, ${summary.fixed} fixed${notified ? ', administrators told' : ''}`)
    return summary
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const lastReport = new Map<number, number>()

export function registerTourHealthRoutes(app: Express): void {
    // The state of every tour, for the admin page.
    app.get('/api/admin/tour-health', requireStrictAdmin, async (_req: Request, res: Response) => {
        try {
            const rows = readRows().sort((a, b) => Number(a.ok) - Number(b.ok) || a.title.localeCompare(b.title))
            const total = (await listedTours()).length
            res.json({ total, failing: rows.filter((r) => !r.ok).length, lastCheckedAt: rows.map((r) => r.lastCheckedAt).sort().pop() ?? null, rows })
        } catch (err) {
            console.error('[tour-health] list failed:', err)
            res.status(500).json({ message: 'Could not load the tour checks.' })
        }
    })

    // "Check now."
    app.post('/api/admin/tour-health/run', requireStrictAdmin, async (_req: Request, res: Response) => {
        try {
            res.json(await runTourHealth())
        } catch (err) {
            console.error('[tour-health] run failed:', err)
            res.status(500).json({ message: 'The check could not run.' })
        }
    })

    // A visitor's viewer says a tour did not load. This is only a nudge: the server looks for itself,
    // at most once per property every ten minutes, and says nothing unless the tour really is broken.
    app.post('/api/properties/:id/tour-report', async (req: Request, res: Response) => {
        const id = Number(req.params.id)
        if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Unknown property.' })
        const last = lastReport.get(id) ?? 0
        if (Date.now() - last < REPORT_COOLDOWN_MS) return res.status(202).json({ queued: false })
        lastReport.set(id, Date.now())
        if (lastReport.size > 2000) lastReport.clear()
        res.status(202).json({ queued: true })
        runTourHealth({ only: [id] }).catch((err) => console.error('[tour-health] report check failed:', err))
    })
}

/** Start-up check, a couple of minutes after boot so it never competes with the server starting. */
export function scheduleTourHealthAtStartup(): void {
    if (process.env.NODE_ENV !== 'production' || process.env.TOUR_HEALTH_DISABLED === '1') return
    setTimeout(() => {
        runTourHealth().catch((err) => console.error('[tour-health] start-up check failed:', err))
    }, 3 * 60 * 1000).unref()
}
