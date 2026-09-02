/**
 * GENE Platform — admin user-analytics: who's signing up, from where, and
 * how the numbers move over time. Backs client/src/pages/AdminAnalytics.tsx.
 *
 * Reads REAL data only — `storage.getAllUsers()` (server/storage.ts, no new
 * IStorage method needed). No mock numbers, no invented history: signup
 * dates come from `createdAt` (see shared/schema.ts's v1.8 addition —
 * DynamoDB already wrote this on every account, it just wasn't declared in
 * the type before), and country comes from `countryCode` (v1.8 addition,
 * captured at signup — see client/src/components/auth/AuthModal.tsx). Both
 * are optional fields that don't exist on every account (older accounts,
 * or a user who skipped the phone step) — every aggregate below reports an
 * explicit `unknown`/`missing` bucket rather than silently dropping those
 * users, so the dashboard never implies more coverage than the data has.
 *
 * Strict-admin gated (see server/gene/admin-guard.ts) — this is
 * platform-wide user PII, not something agents should see.
 */
import type { Express, Request, Response, RequestHandler } from 'express'
import { storage } from '../storage'
import type { User } from '@shared/schema'

function dayKey(iso: string | undefined | null): string | null {
    if (!iso) return null
    const d = new Date(iso)
    if (isNaN(d.getTime())) return null
    return d.toISOString().slice(0, 10) // YYYY-MM-DD
}

export function registerUserAnalyticsRoutes(app: Express, requireStrictAdmin: RequestHandler): void {
    // GET /api/gene/analytics/users/overview — headline counts.
    app.get('/api/gene/analytics/users/overview', requireStrictAdmin, async (_req: Request, res: Response) => {
        try {
            const users: User[] = await storage.getAllUsers()

            const byRole: Record<string, number> = {}
            const byProvider: Record<string, number> = {}
            let verified = 0
            let withPhone = 0
            let withCountryCode = 0

            for (const u of users) {
                const role = u.role || 'normal'
                byRole[role] = (byRole[role] || 0) + 1

                const provider = (u as any).authProvider || 'local'
                byProvider[provider] = (byProvider[provider] || 0) + 1

                if (u.isVerified) verified += 1
                if (u.phoneNumber) withPhone += 1
                if ((u as any).countryCode) withCountryCode += 1
            }

            res.json({
                totalUsers: users.length,
                verifiedUsers: verified,
                usersWithPhone: withPhone,
                usersWithCountryCode: withCountryCode,
                byRole,
                byAuthProvider: byProvider,
            })
        } catch (error: any) {
            console.error('[gene/user-analytics] overview failed:', error)
            res.status(500).json({ message: 'Failed to load user analytics overview.' })
        }
    })

    // GET /api/gene/analytics/users/signups-over-time?days=30
    app.get('/api/gene/analytics/users/signups-over-time', requireStrictAdmin, async (req: Request, res: Response) => {
        try {
            const days = Math.min(365, Math.max(7, parseInt(String(req.query.days ?? '30'), 10) || 30))
            const users: User[] = await storage.getAllUsers()

            const counts: Record<string, number> = {}
            let undated = 0
            for (const u of users) {
                const key = dayKey((u as any).createdAt)
                if (!key) {
                    undated += 1
                    continue
                }
                counts[key] = (counts[key] || 0) + 1
            }

            const today = new Date()
            const series: Array<{ date: string; signups: number }> = []
            for (let i = days - 1; i >= 0; i--) {
                const d = new Date(today)
                d.setDate(d.getDate() - i)
                const key = d.toISOString().slice(0, 10)
                series.push({ date: key, signups: counts[key] || 0 })
            }

            res.json({
                days,
                series,
                // Accounts with no createdAt at all (pre-dating this field) —
                // shown so the dashboard is honest that the chart may
                // undercount true historical signups for old accounts.
                undatedAccountCount: undated,
            })
        } catch (error: any) {
            console.error('[gene/user-analytics] signups-over-time failed:', error)
            res.status(500).json({ message: 'Failed to load signups-over-time.' })
        }
    })

    // GET /api/gene/analytics/users/by-country — breakdown by phone country code.
    app.get('/api/gene/analytics/users/by-country', requireStrictAdmin, async (_req: Request, res: Response) => {
        try {
            const users: User[] = await storage.getAllUsers()
            const counts: Record<string, number> = {}
            let missing = 0

            for (const u of users) {
                const code = (u as any).countryCode as string | undefined
                if (!code) {
                    missing += 1
                    continue
                }
                counts[code] = (counts[code] || 0) + 1
            }

            const breakdown = Object.entries(counts)
                .map(([countryCode, count]) => ({ countryCode, count }))
                .sort((a, b) => b.count - a.count)

            res.json({
                totalUsers: users.length,
                missingCountryCode: missing,
                breakdown,
            })
        } catch (error: any) {
            console.error('[gene/user-analytics] by-country failed:', error)
            res.status(500).json({ message: 'Failed to load country breakdown.' })
        }
    })
}
