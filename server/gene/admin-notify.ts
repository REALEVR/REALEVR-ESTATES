/**
 * GENE Platform — single source of truth for "tell the platform owner about
 * X", used by every existing admin-facing notification in this app: new
 * chat leads (chat.ts), new support messages (messaging.ts), new room-photo
 * uploads (room-capture.ts), pending self-serve listing payouts
 * (self-serve-listing.ts), daily social-post results (social/index.ts), and
 * new signups (auth.ts).
 *
 * BEFORE THIS FILE: each of those picked its own ad hoc SUBSET of channels
 * (some emailed only, one WhatsApped only, one in-app-only) — inconsistent,
 * and none of them reliably reached the owner's WhatsApp. `notifyAdminsEverywhere`
 * below fans every one of those events out to all three channels at once:
 *
 *   1. In-app notification (bell icon, server/models/Notification.ts) to
 *      every admin-role user account.
 *   2. Email — via email-service.ts's sendEmailToAdmins, which itself always
 *      includes the owner's guaranteed address(es) (see
 *      ADMIN_NOTIFICATION_EMAILS there) on top of whatever admin-role users
 *      exist in the DB, so this keeps working even if the DB roster is
 *      stale, empty, or missing an email.
 *   3. WhatsApp — to both of the owner's numbers (see
 *      ADMIN_WHATSAPP_NUMBERS below; env-overridable without a code change
 *      if those numbers ever change).
 *
 * All three are independent and best-effort: one channel failing
 * (unconfigured WhatsApp/email credentials, a DB hiccup, one bad number)
 * never blocks or fails the others, and none of them ever blocks the real
 * user-facing action that triggered the notification (a chat reply, a
 * signup, an upload) — every call site here is fire-and-forget.
 */
import { createNotification } from '../models/Notification'
import { sendEmailToAdmins } from '../email-service'
import { sendWhatsAppMessage } from './whatsapp'
import { normalizePhone } from './whatsapp-concierge'
import { storage } from '../storage'

/**
 * The platform owner's own numbers — WhatsApp notifications for every admin
 * event below go to both, regardless of who else has an admin account.
 * Overridable via ADMIN_WHATSAPP_NUMBERS (comma-separated) without a code
 * change if these numbers ever change.
 */
const DEFAULT_ADMIN_WHATSAPP_NUMBERS = ['256771891323', '256702742333']
export function getAdminWhatsappNumbers(): string[] {
    const raw = process.env.ADMIN_WHATSAPP_NUMBERS
    if (!raw) return DEFAULT_ADMIN_WHATSAPP_NUMBERS
    const parsed = raw
        .split(',')
        .map((n) => normalizePhone(n.trim()))
        .filter(Boolean)
    return parsed.length ? parsed : DEFAULT_ADMIN_WHATSAPP_NUMBERS
}

export interface AdminNotifyEvent {
    /** Short headline — used as the in-app notification title and the email subject. */
    title: string
    /** Plain-text body — used for the in-app notification, the WhatsApp message (unless whatsappMessage overrides it), and the email's plain-text fallback. */
    message: string
    /** Optional richer HTML email body; defaults to a plain `<p>` wrap of `message`. */
    html?: string
    /** Optional override text for WhatsApp specifically (e.g. with emoji/line breaks tuned for chat rather than email) — falls back to `title` + `message`. */
    whatsappMessage?: string
    /** Optional in-app deep link (e.g. `/admin`, `/admin/virtual-tour-manager?propertyId=...`). */
    link?: string
    /** Optional structured payload stored alongside the in-app notification. */
    data?: Record<string, any>
}

/**
 * Shared "a new account was just created" notification — used by every
 * account-creation path in the app, not just server/auth.ts's original
 * POST /api/register. Before this, AuthGate.tsx's sign-up tab (which calls
 * POST /api/ai/onboarding-register — the actual primary sign-up flow today)
 * and Google sign-in (server/gene/google-auth.ts's findOrCreateGoogleUser)
 * silently created accounts with NO admin notification at all — /api/register
 * was the only path that told admins about a new signup, even though most
 * real signups now go through one of the other two. Calling this from all
 * three closes that gap.
 */
export async function notifyAdminsOfNewSignup(user: {
    fullName?: string | null
    username?: string | null
    email?: string | null
    role?: string | null
}): Promise<void> {
    const name = user.fullName || user.username || 'A new user'
    await notifyAdminsEverywhere({
        title: `New signup: ${name}`,
        message: `New account: ${name} (${user.username ?? '—'}, ${user.email ?? '—'}), role: ${user.role ?? '—'}`,
        html: `<p>A new account was just created on RealEVR Estates.</p>
         <ul>
           <li><strong>Name:</strong> ${user.fullName || '—'}</li>
           <li><strong>Username:</strong> ${user.username ?? '—'}</li>
           <li><strong>Email:</strong> ${user.email ?? '—'}</li>
           <li><strong>Role:</strong> ${user.role ?? '—'}</li>
         </ul>`,
        whatsappMessage: `🆕 New signup: ${name}\n${user.email ?? user.username ?? ''} — role: ${user.role ?? '—'}`,
        link: '/admin/users',
    }).catch((err) => console.error('[gene/admin-notify] new-signup notification failed:', err))
}

/**
 * Fans one admin-facing event out to all three channels above. Never
 * throws — every channel is wrapped in its own try/catch so a failure in
 * one (e.g. WhatsApp not configured) never stops the others from firing.
 */
export async function notifyAdminsEverywhere(event: AdminNotifyEvent): Promise<void> {
    // 1. In-app (bell icon) — one row per admin-role user.
    try {
        const admins = (await storage.getAllUsers()).filter((u) => u.role === 'admin')
        await Promise.all(
            admins.map((admin) =>
                createNotification({
                    userId: String(admin.id),
                    title: event.title,
                    message: event.message,
                    type: 'system',
                    link: event.link,
                    data: event.data,
                }).catch((err) => console.error(`[gene/admin-notify] in-app failed for admin ${admin.id}:`, err))
            )
        )
    } catch (err) {
        console.error('[gene/admin-notify] in-app notification pass failed:', err)
    }

    // 2. Email — sendEmailToAdmins already merges the DB admin roster with
    //    the guaranteed owner address(es), see email-service.ts.
    try {
        await sendEmailToAdmins(event.title, event.html ?? `<p>${event.message}</p>`, event.message)
    } catch (err) {
        console.error('[gene/admin-notify] email failed:', err)
    }

    // 3. WhatsApp — both owner numbers, independently.
    try {
        const text = event.whatsappMessage ?? `${event.title}\n\n${event.message}`
        await Promise.all(
            getAdminWhatsappNumbers().map((number) =>
                sendWhatsAppMessage(number, text).catch((err) =>
                    console.error(`[gene/admin-notify] WhatsApp failed for ${number}:`, err)
                )
            )
        )
    } catch (err) {
        console.error('[gene/admin-notify] WhatsApp pass failed:', err)
    }
}
