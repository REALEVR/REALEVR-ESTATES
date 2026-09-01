/**
 * GENE Platform — "Continue with Google" sign-in, as a real popup window
 * rather than a full-page redirect (the "make auth feel like a pop up"
 * ask). Entirely additive: does not touch server/auth.ts's local-strategy
 * login/register/session code, and only reuses `storage` (existing
 * getUserByEmail/getAllUsers/createUser/updateUser — no new IStorage
 * methods needed) plus auth.ts's exported `hashPassword`.
 *
 * ENV-GATED, GRACEFUL DEGRADE: without GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET
 * set, `registerGoogleAuthRoutes` still registers /api/auth/google so the
 * frontend's popup never hits a raw 404 — it opens, shows a clear "Google
 * sign-in isn't configured yet" message, and closes itself. No route ever
 * pretends Google sign-in works when it doesn't.
 *
 * SETUP (do this in Google Cloud Console, not from code):
 *   1. console.cloud.google.com → APIs & Services → OAuth consent screen
 *      → configure it (External, add your app name/logo/support email).
 *   2. Credentials → Create Credentials → OAuth client ID → Web application.
 *   3. Authorized redirect URI: <BASE_URL>/api/auth/google/callback
 *      (BASE_URL is the same env var server/sitemap.ts already reads —
 *      e.g. https://estates.realevr.com).
 *   4. Copy the Client ID + Client Secret into GOOGLE_CLIENT_ID /
 *      GOOGLE_CLIENT_SECRET on your host (Railway → Variables). No redeploy
 *      of this code is needed after that — it's read at request time.
 *
 * POPUP FLOW (how the frontend uses this):
 *   1. Open a popup window pointed at GET /api/auth/google.
 *   2. That redirects through Google, back to GET /api/auth/google/callback.
 *   3. The callback logs the user in (real session, same as local login —
 *      req.login + the shared session middleware from auth.ts) and responds
 *      with a tiny HTML page that does
 *      `window.opener.postMessage({source:'realevr-google-auth', ok, user|error}, <origin>)`
 *      then `window.close()`.
 *   4. The main window's message listener picks that up — see
 *      client/src/components/auth/AuthModal.tsx.
 *
 * ACCOUNT MATCHING: by googleId first (repeat sign-in), then by email
 * (links Google to an existing local account rather than creating a
 * duplicate — the existing username/history is preserved), else creates a
 * new account. New Google accounts are marked isVerified: true (Google
 * already verified the email) and get a random, never-shown password
 * (users.password stays NOT NULL; this account is only ever unlocked via
 * Google). KNOWN LIMITATION: account matching scans getAllUsers() rather
 * than a dedicated indexed lookup — the same approach getUserByEmail/
 * getUserByUsername already use under the hood (DynamoDB scanTable), so
 * this doesn't introduce a new class of slowness, just the same one.
 */
import type { Express, Request, Response } from 'express'
import passport from 'passport'
import { Strategy as GoogleStrategy, type Profile } from 'passport-google-oauth20'
import { randomBytes } from 'crypto'
import { storage } from '../storage'
import { hashPassword } from '../auth'
import { getCanonicalBaseUrl } from '../sitemap'

function isGoogleConfigured(): boolean {
    return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

/** Turns "Jane Doe" / "jane.doe@gmail.com" into a unique, URL-safe username
 * — sign-up's existing username-uniqueness rule (server/auth.ts's
 * /api/register) still applies, so a Google sign-up needs one too even
 * though the user never picks one themselves. */
async function generateUniqueUsername(seed: string): Promise<string> {
    const base = (seed.split('@')[0] || 'user').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'user'
    let candidate = base
    let suffix = 0
    // Small, bounded loop — collisions on a fresh base are rare; this is a
    // safety net, not an expected hot path.
    while (await storage.getUserByUsername(candidate)) {
        suffix += 1
        candidate = `${base}${suffix}`
        if (suffix > 50) {
            candidate = `${base}${randomBytes(3).toString('hex')}`
            break
        }
    }
    return candidate
}

async function findOrCreateGoogleUser(profile: Profile) {
    const googleId = profile.id
    const email = profile.emails?.[0]?.value
    const fullName = profile.displayName || email || 'RealEVR User'

    const allUsers = await storage.getAllUsers()

    const byGoogleId = allUsers.find((u: any) => u.googleId === googleId)
    if (byGoogleId) return byGoogleId

    if (email) {
        const byEmail = allUsers.find((u) => u.email?.toLowerCase() === email.toLowerCase())
        if (byEmail) {
            // Link Google to the existing local account rather than creating
            // a duplicate — preserves their existing listings/history.
            return storage.updateUser(byEmail.id, { googleId, authProvider: 'google' } as any)
        }
    }

    const username = await generateUniqueUsername(email || fullName)
    const randomPassword = randomBytes(24).toString('hex')
    const hashedPassword = await hashPassword(randomPassword)

    return storage.createUser({
        username,
        password: hashedPassword,
        email: email || `${username}@no-email.realevrestates.com`,
        fullName,
        role: 'normal',
        isVerified: true, // Google already verified this email address.
        googleId,
        authProvider: 'google',
    } as any)
}

function popupResponseHtml(payload: { ok: true; user: Record<string, unknown> } | { ok: false; error: string }): string {
    // Posts the result back to the window that opened this popup, then
    // closes itself. `'*'` targetOrigin would work but is deliberately
    // avoided — the opener's own origin is used via document.referrer /
    // window.location, so a malicious embedder can't intercept this by
    // opening the popup itself with a different opener.
    return `<!doctype html><html><body><script>
try {
  if (window.opener) {
    window.opener.postMessage(${JSON.stringify({ source: 'realevr-google-auth', ...payload })}, window.location.origin);
  }
} catch (e) {}
window.close();
</script>Signing you in — you can close this window.</body></html>`
}

export function registerGoogleAuthRoutes(app: Express): void {
    if (isGoogleConfigured()) {
        passport.use(
            new GoogleStrategy(
                {
                    clientID: process.env.GOOGLE_CLIENT_ID!,
                    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
                    callbackURL: `${getCanonicalBaseUrl()}/api/auth/google/callback`,
                },
                async (_accessToken, _refreshToken, profile: Profile, done) => {
                    try {
                        const user = await findOrCreateGoogleUser(profile)
                        done(null, user as any)
                    } catch (err) {
                        done(err as Error)
                    }
                }
            )
        )
    }

    app.get('/api/auth/google', (req: Request, res: Response, next) => {
        if (!isGoogleConfigured()) {
            return res.status(503).send(popupResponseHtml({ ok: false, error: 'Google sign-in is not configured yet.' }))
        }
        passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next)
    })

    app.get('/api/auth/google/callback', (req: Request, res: Response, next) => {
        if (!isGoogleConfigured()) {
            return res.status(503).send(popupResponseHtml({ ok: false, error: 'Google sign-in is not configured yet.' }))
        }
        passport.authenticate('google', { session: false }, (err: any, user: any) => {
            if (err || !user) {
                console.error('[gene/google-auth] callback failed:', err)
                return res.send(popupResponseHtml({ ok: false, error: 'Google sign-in failed. Please try again.' }))
            }
            req.login(user, (loginErr) => {
                if (loginErr) {
                    console.error('[gene/google-auth] req.login failed:', loginErr)
                    return res.send(popupResponseHtml({ ok: false, error: 'Could not start your session. Please try again.' }))
                }
                req.session.save(() => {
                    const { password, ...userWithoutPassword } = user
                    res.send(popupResponseHtml({ ok: true, user: userWithoutPassword }))
                })
            })
        })(req, res, next)
    })
}
