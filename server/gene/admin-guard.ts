/**
 * GENE Platform — strict admin-only guard.
 *
 * `adminMiddleware` in server/routes.ts (passed into most `registerGene*`
 * functions) actually means "admin OR agent" — that's the right, looser
 * check for day-to-day property management, and existing modules that use
 * it (e.g. server/gene/referral-rewards.ts's payout approval routes) are
 * unaffected by this file.
 *
 * Money-approval routes added in this pass — agent listing payout approval
 * (server/gene/self-serve-listing.ts) and the WhatsApp marketing broadcast
 * trigger (server/gene/whatsapp-growth.ts) — are explicitly scoped to the
 * platform owner only, per their own request ("requests i can only approve
 * through the admin dashboard"). An 'agent' account approving its own (or a
 * peer's) payout would be a real conflict of interest, so these routes use
 * this strict `role === 'admin'` check instead of the shared, looser one.
 */
import type { Request, Response, NextFunction } from 'express'

export function requireStrictAdmin(req: Request, res: Response, next: NextFunction): void {
    if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
        res.status(401).json({ message: 'Sign in as an administrator first.' })
        return
    }
    const user = req.user as any
    if (user.role !== 'admin') {
        res.status(403).json({ message: 'This action is restricted to platform administrators.' })
        return
    }
    next()
}
