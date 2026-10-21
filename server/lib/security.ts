/**
 * Shared security pieces: response headers, which websites may call the API from a browser, request-rate limits, and the one
 * rule for "may this account change this listing". No new dependencies; everything is small enough to read in one sitting.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express'

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

/**
 * Headers that cost nothing and block whole classes of attack. There is deliberately no Content-Security-Policy here: the site
 * loads maps, analytics and video from several hosts, and a wrong policy would blank pages. Add one in report-only mode first.
 */
export function securityHeaders(): RequestHandler {
    return (req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('X-Frame-Options', 'SAMEORIGIN')
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
        // Camera, microphone and location are used by Kevin, room capture and "near you", on this site only.
        res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(self), payment=(self)')
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups')
        if (req.secure || String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() === 'https') {
            res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains')
        }
        next()
    }
}

// ---------------------------------------------------------------------------
// Cross-origin access
// ---------------------------------------------------------------------------

function allowedOrigins(): Set<string> {
    const set = new Set<string>(['https://estates.realevr.com', 'https://realevr.com', 'https://www.realevr.com'])
    for (const v of [process.env.BASE_URL, process.env.PUBLIC_URL, process.env.SITE_URL]) {
        try {
            if (v) set.add(new URL(v).origin)
        } catch {
            /* not a URL */
        }
    }
    for (const v of (process.env.CORS_ORIGINS ?? '').split(',')) {
        const t = v.trim()
        if (t) set.add(t)
    }
    return set
}

const LOCAL_DEV = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

/**
 * Only this site's own origins may read API answers from a browser, and only they may send the session cookie. The old
 * behaviour echoed back whatever origin asked, together with "allow credentials", which let any website the visitor opened
 * talk to the API as them. Requests with no Origin header (the phone app, curl, server to server) are unaffected.
 */
export function corsAllowlist(): RequestHandler {
    const allowed = allowedOrigins()
    const dev = process.env.NODE_ENV !== 'production'
    return (req, res, next) => {
        const origin = req.headers.origin
        if (origin && (allowed.has(origin) || (dev && LOCAL_DEV.test(origin)))) {
            res.header('Access-Control-Allow-Origin', origin)
            res.header('Access-Control-Allow-Credentials', 'true')
            res.header('Vary', 'Origin')
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization')
        } else if (origin) {
            res.header('Vary', 'Origin')
        }
        if (req.method === 'OPTIONS') return res.status(origin && !res.getHeader('Access-Control-Allow-Origin') ? 403 : 204).end()
        next()
    }
}

// ---------------------------------------------------------------------------
// Rate limits
// ---------------------------------------------------------------------------

/** The visitor's address. Behind Cloudflare the real one is in CF-Connecting-IP; otherwise the first forwarded address. */
export function clientIp(req: Request): string {
    const cf = req.headers['cf-connecting-ip']
    if (typeof cf === 'string' && cf) return cf.trim()
    const fwd = req.headers['x-forwarded-for']
    if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim()
    return req.ip || req.socket.remoteAddress || 'unknown'
}

interface Bucket {
    count: number
    resetAt: number
}

/**
 * A fixed-window limit per visitor address (plus an optional extra key such as the username being tried).
 * Held in memory: a restart clears it, and with several server copies each keeps its own count, which is acceptable for
 * slowing down password guessing and message floods, and is not a substitute for a firewall rule in front of the site.
 */
export function rateLimit(opts: { windowMs: number; max: number; ipMax?: number; name: string; key?: (req: Request) => string | null; message?: string }): RequestHandler {
    const buckets = new Map<string, Bucket>()
    let lastSweep = Date.now()
    return (req: Request, res: Response, next: NextFunction) => {
        const now = Date.now()
        if (now - lastSweep > 60_000) {
            lastSweep = now
            buckets.forEach((b, k) => {
                if (b.resetAt <= now) buckets.delete(k)
            })
            if (buckets.size > 50_000) buckets.clear()
        }
        const extra = opts.key?.(req)
        // Mobile carriers put many people behind one address, so the per-address ceiling can be higher than the per-account one.
        const keys: Array<[string, number]> = [[`ip:${clientIp(req)}`, opts.ipMax ?? opts.max], ...(extra ? ([[`k:${extra}`, opts.max]] as Array<[string, number]>) : [])]
        for (const [key, limit] of keys) {
            let b = buckets.get(key)
            if (!b || b.resetAt <= now) {
                b = { count: 0, resetAt: now + opts.windowMs }
                buckets.set(key, b)
            }
            b.count++
            if (b.count > limit) {
                res.setHeader('Retry-After', String(Math.max(1, Math.ceil((b.resetAt - now) / 1000))))
                return res.status(429).json({ message: opts.message ?? 'Too many attempts. Please wait a little and try again.' })
            }
        }
        next()
    }
}

// ---------------------------------------------------------------------------
// Who may change a listing
// ---------------------------------------------------------------------------

export interface Actor {
    id?: number | string
    role?: string | null
}

/** An administrator may change any listing; anyone else only their own. */
export function canManageProperty(user: Actor | null | undefined, property: { ownerId?: number | string | null } | null | undefined): boolean {
    if (!user || !property) return false
    if (user.role === 'admin') return true
    return property.ownerId != null && user.id != null && String(property.ownerId) === String(user.id)
}

/** Fields only an administrator may set on a listing: ownership, paid placement, and the numbers visitors trust. */
export const ADMIN_ONLY_PROPERTY_FIELDS = ['ownerId', 'isFeatured', 'viewCount', 'reviewCount', 'rating'] as const

export function stripAdminOnlyFields<T extends Record<string, any>>(updates: T, user: Actor | null | undefined): T {
    if (user?.role === 'admin') return updates
    const copy: Record<string, any> = { ...updates }
    for (const f of ADMIN_ONLY_PROPERTY_FIELDS) delete copy[f]
    return copy as T
}

/** A tour address must be this site's own file or an https page; never javascript:, data: or a plain-http page. */
export function isSafeTourUrl(url: unknown): url is string {
    if (typeof url !== 'string' || url.length > 2000) return false
    if (url.startsWith('/uploads/tours/') && !url.includes('..')) return true
    try {
        const u = new URL(url)
        return u.protocol === 'https:'
    } catch {
        return false
    }
}
