/**
 * GENE Platform — "Continue with Google" sign-in. Two ways in, both ending
 * at the same findOrCreateGoogleUser account-matching logic below:
 *
 * 1. GOOGLE IDENTITY SERVICES (GIS) — the primary path as of the "don't
 *    make someone leave the page on mobile" ask. client/src/components/
 *    auth/GoogleSignInButton.tsx renders Google's own Sign In With Google
 *    button via the `accounts.google.com/gsi/client` script — clicking it
 *    shows Google's account chooser as a genuine in-viewport overlay (an
 *    iframe Google's own script manages, not a new browser window), so
 *    nothing ever navigates away or opens a separate tab, mobile included.
 *    That flow hands back a signed ID token ("credential") to
 *    POST /api/auth/google/onetap below, which verifies it server-side
 *    (google-auth-library's OAuth2Client.verifyIdToken — never trusts an
 *    unverified token) and logs the user in directly, no popup/redirect at
 *    all. GET /api/config/google-client-id exists because GIS needs the
 *    OAuth Client ID in the browser to initialize — that's the public half
 *    of the credential pair (Google's own docs treat it as embeddable in
 *    frontend code); the Client Secret never leaves this server.
 *
 * 2. REAL POPUP WINDOW (window.open) — the original implementation, kept
 *    as the automatic fallback GoogleSignInButton uses if the GIS script
 *    fails to load/init (blocked, offline, etc.). A real OAuth redirect
 *    through Google, in a popup window rather than navigating the main
 *    tab. On desktop this behaves like a real popup; on many mobile
 *    browsers `window.open` is downgraded to a full new tab instead
 *    (browser behavior this server can't control) — exactly the "has to
 *    leave the page" problem GIS above solves, which is why GIS is tried
 *    first and this is the fallback, not the other way around.
 *
 * ENV-GATED, GRACEFUL DEGRADE: without GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET
 * set, both paths still register their routes so the frontend never hits a
 * raw 404 — GET /api/config/google-client-id returns clientId: null (GIS
 * never initializes, GoogleSignInButton falls back to the popup path
 * immediately), and the popup shows a clear "Google sign-in isn't
 * configured yet" message and closes itself. No route ever pretends
 * Google sign-in works when it doesn't.
 *
 * SETUP (do this in Google Cloud Console, not from code):
 *   1. console.cloud.google.com → APIs & Services → OAuth consent screen
 *      → configure it (External, add your app name/logo/support email).
 *   2. Credentials → Create Credentials → OAuth client ID → Web application.
 *   3. Authorized redirect URI: <BASE_URL>/api/auth/google/callback
 *      (BASE_URL is the same env var server/sitemap.ts already reads —
 *      e.g. https://estates.realevr.com). Authorized JavaScript origin:
 *      <BASE_URL> itself (no path) — GIS checks this, separately from the
 *      redirect URI above.
 *   4. Copy the Client ID + Client Secret into GOOGLE_CLIENT_ID /
 *      GOOGLE_CLIENT_SECRET on your host (Railway → Variables). No redeploy
 *      of this code is needed after that — it's read at request time.
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
import { OAuth2Client } from 'google-auth-library'
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

interface GoogleIdentity {
    googleId: string
    email?: string
    fullName: string
}

/** Shared by both entry points (GIS ID-token verification and the classic
 * passport redirect strategy) — accepts a small, provider-agnostic shape
 * rather than passport's own Profile type, since only these three fields
 * are ever used regardless of which flow got them. */
async function findOrCreateGoogleUser({ googleId, email, fullName }: GoogleIdentity) {
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

    const newUser = await storage.createUser({
        username,
        password: hashedPassword,
        email: email || `${username}@no-email.realevrestates.com`,
        fullName,
        role: 'normal',
        isVerified: true, // Google already verified this email address.
        googleId,
        authProvider: 'google',
    } as any)

    // Fire-and-forget: this is a genuinely new account (not a repeat sign-in
    // or a link onto an existing one, both handled above), so admins should
    // hear about it the same way they do for every other sign-up path — see
    // gene/admin-notify.ts. Was previously the one signup path with no admin
    // notification at all.
    const { notifyAdminsOfNewSignup } = await import('./admin-notify')
    void notifyAdminsOfNewSignup(newUser as any)

    return newUser
}

function popupResponseHtml(
    payload: { ok: true; user: Record<string, unknown>; needsPhone?: boolean } | { ok: false; error: string }
): string {
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
                        const user = await findOrCreateGoogleUser({
                            googleId: profile.id,
                            email: profile.emails?.[0]?.value,
                            fullName: profile.displayName || profile.emails?.[0]?.value || 'RealEVR User',
                        })
                        done(null, user as any)
                    } catch (err) {
                        done(err as Error)
                    }
                }
            )
        )
    }

    // [PUBLIC] GET /api/config/google-client-id — the OAuth Client ID is the
    // public half of the credential pair (Google's own GIS docs have it
    // embedded directly in frontend script tags), so serving it here is not
    // a secret leak; the Client Secret never appears in any route response.
    // Same "config over env var" pattern as GET /api/config/whatsapp-business-number
    // (server/gene/whatsapp-growth.ts) — lets the frontend adapt without a
    // rebuild, and returns null cleanly (never an error) when unconfigured
    // so GoogleSignInButton just falls back to the popup flow immediately.
    app.get('/api/config/google-client-id', (_req: Request, res: Response) => {
        res.json({ clientId: process.env.GOOGLE_CLIENT_ID || null })
    })

    // [PUBLIC] POST /api/auth/google/onetap — the GIS ID-token flow's
    // landing point (see this file's top doc comment, path 1). Body:
    // { credential: <signed JWT from Google> }. Never trusts the token's
    // own claims without verifying its signature and audience first —
    // same "don't trust what the client hands you" posture as the
    // popup/redirect flow trusting only what Google's own callback
    // produces, never anything the browser could have forged.
    app.post('/api/auth/google/onetap', async (req: Request, res: Response) => {
        if (!isGoogleConfigured()) {
            return res.status(503).json({ message: 'Google sign-in is not configured yet.' })
        }
        const credential = typeof req.body?.credential === 'string' ? req.body.credential : ''
        if (!credential) {
            return res.status(400).json({ message: 'Missing credential.' })
        }

        try {
            const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
            const ticket = await client.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID })
            const payload = ticket.getPayload()
            if (!payload?.sub) {
                return res.status(401).json({ message: 'Could not verify that Google credential.' })
            }

            const user = await findOrCreateGoogleUser({
                googleId: payload.sub,
                email: payload.email,
                fullName: payload.name || payload.email || 'RealEVR User',
            })

            req.login(user as any, (loginErr) => {
                if (loginErr) {
                    console.error('[gene/google-auth] onetap req.login failed:', loginErr)
                    return res.status(500).json({ message: 'Could not start your session. Please try again.' })
                }
                req.session.save(() => {
                    const { password, ...userWithoutPassword } = user as any
                    res.json({ ok: true, user: userWithoutPassword, needsPhone: !(user as any).phoneNumber })
                })
            })
        } catch (err: any) {
            console.error('[gene/google-auth] onetap verification failed:', err)
            res.status(401).json({ message: 'Could not verify that Google credential.' })
        }
    })

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
                    // Google never gives us a phone number - flag it so the client can
                    // offer a one-time "add your WhatsApp number" prompt after landing.
                    // Covers both a brand-new Google account and an existing local
                    // account that just linked Google but never had a number on file.
                    res.send(
                        popupResponseHtml({
                            ok: true,
                            user: userWithoutPassword,
                            needsPhone: !user.phoneNumber,
                        })
                    )
                })
            })
        })(req, res, next)
    })
}
