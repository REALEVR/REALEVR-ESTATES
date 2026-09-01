/**
 * GENE Platform — passwordless "magic link" session login.
 *
 * A landlord who comes through the self-serve listing flow
 * (self-serve-listing.ts) proves who they are with a WhatsApp OTP, not a
 * password — they never set one. This module is how they actually get INTO
 * their new agent dashboard afterwards: a short-lived, single-use token
 * that, when opened, establishes a real passport session (the exact same
 * `req.login` used by the existing email-verification auto-login in
 * server/auth.ts) and redirects straight into `/agent/dashboard`.
 *
 * Deliberately its own tiny module (not folded into self-serve-listing.ts
 * or whatsapp-concierge.ts) because BOTH of those need to issue links —
 * self-serve-listing.ts right after account creation, and
 * whatsapp-concierge.ts whenever a linked landlord texts "dashboard" for a
 * fresh one — and having them import from each other would be circular.
 *
 * Persistence: shared JSON-file collection store (see ./store.ts).
 */
import type { Express, Request, Response } from 'express'
import { nanoid } from 'nanoid'
import { readCollection, writeCollection, nextId, nowIso } from './store'
import { storage } from '../storage'
import { getCanonicalBaseUrl } from '../sitemap'

const COLLECTION = 'gene_magic_login_tokens'
const TOKEN_LIFETIME_MS = 30 * 60 * 1000 // 30 minutes

interface MagicLoginToken {
    id: number
    token: string
    userId: number
    createdAt: string
    expiresAt: string
    consumedAt: string | null
}

export interface IssuedMagicLink {
    token: string
    url: string
    expiresAt: string
}

/** Mints a fresh single-use login link for a user. Never invalidates any
 * link issued earlier — a landlord can have several valid links out at
 * once (e.g. one from the listing flow, one from a later "dashboard" text)
 * without either breaking the other. */
export function issueMagicLoginLink(userId: number): IssuedMagicLink {
    const rows = readCollection<MagicLoginToken>(COLLECTION)
    const token = nanoid(32)
    const expiresAt = new Date(Date.now() + TOKEN_LIFETIME_MS).toISOString()
    rows.push({ id: nextId(rows), token, userId, createdAt: nowIso(), expiresAt, consumedAt: null })
    // Opportunistic cleanup so this collection doesn't grow forever — drop
    // anything already expired or consumed more than a day ago.
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    const pruned = rows.filter((r) => {
        if (r.consumedAt && new Date(r.consumedAt).getTime() < cutoff) return false
        if (new Date(r.expiresAt).getTime() < cutoff) return false
        return true
    })
    writeCollection(COLLECTION, pruned)

    const base = getCanonicalBaseUrl()
    return { token, url: `${base}/api/gene/magic-login?token=${token}`, expiresAt }
}

export function registerMagicLoginRoutes(app: Express): void {
    app.get('/api/gene/magic-login', async (req: Request, res: Response) => {
        const token = typeof req.query.token === 'string' ? req.query.token : ''
        if (!token) return res.redirect('/auth?magicLink=missing')

        try {
            const rows = readCollection<MagicLoginToken>(COLLECTION)
            const idx = rows.findIndex((r) => r.token === token)
            if (idx === -1) return res.redirect('/auth?magicLink=invalid')

            const record = rows[idx]
            if (record.consumedAt) return res.redirect('/auth?magicLink=used')
            if (new Date(record.expiresAt).getTime() < Date.now()) return res.redirect('/auth?magicLink=expired')

            const user = await storage.getUser(record.userId)
            if (!user) return res.redirect('/auth?magicLink=invalid')

            // Single-use: mark consumed before logging in, so a retried/shared
            // link can't silently log a second person into the same account.
            rows[idx] = { ...record, consumedAt: nowIso() }
            writeCollection(COLLECTION, rows)

            req.login(user, (err) => {
                if (err) {
                    console.error('[gene/magic-login] req.login failed:', err)
                    return res.redirect('/auth?magicLink=error')
                }
                res.redirect('/agent/dashboard')
            })
        } catch (err) {
            console.error('[gene/magic-login] redemption failed:', err)
            res.redirect('/auth?magicLink=error')
        }
    })
}
