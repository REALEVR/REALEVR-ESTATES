import { useEffect, useState } from 'react'
import { Link } from 'wouter'
import { Button } from '@/components/ui/button'

const STORAGE_KEY = 'realevr_cookie_consent'

export type CookieConsentChoice = 'accepted' | 'declined'

/** Reads the visitor's recorded cookie-consent choice, if any. Exported so
 * other code (currently none — see CookiePolicy.tsx's honest accounting of
 * what this site actually stores) can check it before writing anything
 * that's genuinely optional, rather than everything defaulting to "on". */
export function getCookieConsent(): CookieConsentChoice | null {
    try {
        const value = localStorage.getItem(STORAGE_KEY)
        return value === 'accepted' || value === 'declined' ? value : null
    } catch {
        return null
    }
}

/** First-visit cookie notice — see docs/... none yet, see CookiePolicy.tsx
 * for what this site actually stores and why. Kept honest rather than
 * decorative: this site runs no third-party tracking to consent to, so
 * "Decline" doesn't need to disable anything invasive — it just records
 * the choice, same as "Accept" does, so the banner stops reappearing
 * either way. Strictly-necessary storage (the sign-in session) was never
 * gated on this choice, same as on virtually every site with accounts —
 * see CookiePolicy.tsx section 4. */
export default function CookieConsentBanner() {
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        if (getCookieConsent() === null) setVisible(true)
    }, [])

    const choose = (choice: CookieConsentChoice) => {
        try {
            localStorage.setItem(STORAGE_KEY, choice)
        } catch {
            // Storage unavailable (private browsing, etc.) — the banner just
            // won't remember the choice across reloads, which is a
            // degraded-but-safe fallback, not a broken one.
        }
        setVisible(false)
    }

    if (!visible) return null

    return (
        <div
            role="region"
            aria-label="Cookie notice"
            className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 backdrop-blur-sm shadow-[0_-4px_16px_rgba(0,0,0,0.08)]"
        >
            {/* pb includes env(safe-area-inset-bottom) on top of the normal
                py-4 — this banner sits flush at bottom-0, so without it the
                Accept/Decline buttons crowd right up against the home-
                indicator area on notched phones. */}
            <div
              className="container mx-auto px-4 sm:px-6 lg:px-8 pt-4 flex flex-col sm:flex-row items-center gap-4"
              style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
            >
                <p className="text-sm text-muted-foreground flex-1">
                    We use a small amount of essential browser storage to keep you signed in and remember things like
                    a paid tour-viewing pass. We don't run any third-party ad or tracking cookies.{' '}
                    <Link href="/cookies" className="text-accent hover:underline">
                        Read our Cookie Policy
                    </Link>
                    .
                </p>
                <div className="flex gap-2 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => choose('declined')}>
                        Decline
                    </Button>
                    <Button size="sm" onClick={() => choose('accepted')}>
                        Accept
                    </Button>
                </div>
            </div>
        </div>
    )
}
