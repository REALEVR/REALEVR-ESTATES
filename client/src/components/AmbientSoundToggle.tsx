import { useEffect } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useAmbientSound } from '@/hooks/useAmbientSound'
import { attemptWelcomeAmbient, consumeJustSignedInFlag, stopAmbient } from '@/lib/ambientSound'

/**
 * The soothing welcome ambience's only visible UI — a small floating
 * speaker toggle, shown only while signed in (see client/src/lib/ambientSound.ts
 * for the actual audio engine and why sign-in success is wired in from
 * several places rather than here). Mounted once, site-wide, in App.tsx.
 *
 * Bottom-left is deliberately empty real estate on this site — the AI
 * assistant launcher, WhatsApp FAB, RentRail agent launcher, and
 * scroll-to-top button all live in the bottom-right corner already.
 */
export default function AmbientSoundToggle() {
    const { user } = useAuth()
    const { enabled, playing, needsGesture, toggle } = useAmbientSound()

    // Picks up the breadcrumb left by use-auth.tsx's traditional-login
    // path right before its window.location.href reload — this component's
    // first mount after that fresh page load is the only place that
    // breadcrumb can be consumed (see ambientSound.ts's doc comment).
    useEffect(() => {
        if (user && consumeJustSignedInFlag()) {
            attemptWelcomeAmbient()
        }
    }, [user])

    // A "welcome" cue has no reason to keep playing for a signed-out
    // visitor — stop it the moment they sign out.
    useEffect(() => {
        if (!user) stopAmbient()
    }, [user])

    if (!user) return null

    return (
        <button
            type="button"
            onClick={toggle}
            aria-label={enabled ? 'Turn off ambient welcome sound' : 'Turn on ambient welcome sound'}
            title={enabled ? (playing ? 'Ambient sound playing — tap to mute' : 'Ambient sound on') : 'Ambient sound off — tap to play'}
            className={`fixed bottom-24 left-5 z-40 flex h-11 w-11 items-center justify-center rounded-full shadow-lg transition-all hover:scale-105 md:bottom-5 ${
                enabled ? 'bg-accent text-accent-foreground' : 'bg-white text-gray-500 border border-gray-200'
            }`}
        >
            {enabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
            {/* Autoplay was blocked (see needsGesture in ambientSound.ts) —
                this pulse invites the tap that starts it, since a click here
                always counts as a genuine user gesture. */}
            {enabled && needsGesture && !playing && (
                <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-primary animate-ping" />
            )}
        </button>
    )
}
