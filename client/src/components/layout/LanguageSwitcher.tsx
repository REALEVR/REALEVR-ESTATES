import { useState } from 'react'
import { Button } from '@/components/ui/button'

declare global {
    interface Window {
        google?: any
        googleTranslateElementInit?: () => void
    }
}

let scriptLoadPromise: Promise<void> | null = null

/** Loads Google's official Translate Element script once (cached across
 * every call/mount) and initializes it into #google_translate_element —
 * the same widget Google ships on any site, so it genuinely covers "all
 * languages," not a curated subset. Lazy: only fetched the first time a
 * visitor actually opens the switcher, not on every page load. */
function loadGoogleTranslate(): Promise<void> {
    if (scriptLoadPromise) return scriptLoadPromise
    scriptLoadPromise = new Promise((resolve) => {
        window.googleTranslateElementInit = () => {
            new window.google.translate.TranslateElement(
                { pageLanguage: 'en', autoDisplay: false },
                'google_translate_element'
            )
            resolve()
        }
        const script = document.createElement('script')
        script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit'
        script.async = true
        document.body.appendChild(script)
    })
    return scriptLoadPromise
}

/**
 * Wires up the header's globe icon — previously decorative, no onClick at
 * all (`<Button ...><i className="fas fa-globe" /></Button>`, going
 * nowhere) — to a real, working language switcher.
 *
 * client/index.html already sets `<html lang="en">`, so Chrome/Edge/Brave
 * already offer their own built-in "Translate this page?" prompt
 * automatically, with zero code here. This is the explicit, discoverable,
 * always-available fallback for everyone else (Safari, Firefox, or anyone
 * who dismissed the auto-prompt): Google's own Translate Element widget,
 * translating the live page in place — forms, the AI chat widget, sign-in,
 * everything keeps working, unlike redirecting to a translate.google.com
 * proxy page. The default widget's banner/branding chrome is suppressed via
 * the .goog-te-* rules in index.css, leaving just the language dropdown.
 */
export default function LanguageSwitcher() {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)

    const handleClick = async () => {
        if (open) {
            setOpen(false)
            return
        }
        setOpen(true)
        if (!window.google?.translate) {
            setLoading(true)
            await loadGoogleTranslate()
            setLoading(false)
        }
    }

    return (
        <div className="relative">
            <Button
                variant="ghost"
                size="icon"
                className="hidden md:flex rounded-full p-2 hover:bg-secondary"
                onClick={handleClick}
                aria-label="Translate this page"
                title="Translate this page"
            >
                <i className="fas fa-globe text-foreground"></i>
            </Button>
            {open && (
                <div className="absolute right-0 top-full mt-2 z-50 rounded-lg border border-border bg-card p-3 shadow-lg min-w-[200px]">
                    {loading && <p className="text-xs text-muted-foreground">Loading languages…</p>}
                    <div id="google_translate_element" />
                </div>
            )}
        </div>
    )
}
