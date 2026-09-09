import { useState } from 'react'
import { Link, useLocation } from 'wouter'
import { useAuth } from '@/hooks/use-auth'
import AuthModal from '@/components/auth/AuthModal'
import { Home, Building2, Receipt, UserCircle2, Plus } from 'lucide-react'

/**
 * Mobile bottom tab bar — the one clearly-missing pattern this site's
 * mobile view didn't have: a persistent way to jump between top-level
 * destinations without opening Header.tsx's dropdown every time, plus an
 * elevated center action button, both borrowed from a reference app
 * screenshot the user liked (a floating "+" sitting on top of a bottom
 * tab row). Every destination here is a route that already exists —
 * this doesn't invent a Favorites or Messages tab just to fill the row,
 * since neither has a real page to send someone to yet.
 *
 * md:hidden — desktop already has all of this in Header's nav/dropdown,
 * so this is purely the small-screen affordance that was missing.
 */
const TABS = [
    { href: '/', label: 'Home', icon: Home, match: (p: string) => p === '/' },
    { href: '/properties', label: 'Properties', icon: Building2, match: (p: string) => p.startsWith('/properties') },
] as const

const TABS_RIGHT = [
    // glow: draws the eye to this always-visible, sign-up-free action —
    // see index.css's .pay-rent-glow and Header.tsx's matching desktop button.
    { href: '/rentrail', label: 'Pay Rent', icon: Receipt, match: (p: string) => p.startsWith('/rentrail'), glow: true },
] as const

export default function MobileTabBar() {
    const [location] = useLocation()
    const { user } = useAuth()
    const [authModalOpen, setAuthModalOpen] = useState(false)

    const profileHref = user ? '/profile' : undefined
    const isProfileActive = location.startsWith('/profile')

    return (
        <>
            <nav
                className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-background border-t border-border"
                style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
                aria-label="Primary"
            >
                <div className="relative grid grid-cols-5 items-center h-16">
                    {TABS.map((tab) => (
                        <TabLink key={tab.href} {...tab} active={tab.match(location)} />
                    ))}

                    {/* Elevated center action — "List a Property" is the one
                        action worth a floating button: it's the platform's own
                        highest-value CTA (already promoted in the footer) and,
                        unlike Home/Properties, isn't a place someone lands,
                        it's a thing someone does. `.shine` is this codebase's
                        own established treatment for exactly that tier of CTA
                        (see Hero.tsx's primary search button) — plain
                        bg-accent alone renders as flat "shiny silver" gray by
                        design (index.css), calm enough it wouldn't read as a
                        floating action button at all without it. */}
                    <div className="flex items-center justify-center">
                        <Link
                            href="/list-your-property"
                            aria-label="List a Property"
                            title="List a Property"
                            className="shine absolute -top-6 left-1/2 -translate-x-1/2 flex items-center justify-center w-14 h-14 rounded-full shadow-lg active:scale-95 transition-transform"
                        >
                            <Plus className="h-6 w-6" />
                        </Link>
                    </div>

                    {TABS_RIGHT.map((tab) => (
                        <TabLink key={tab.href} {...tab} active={tab.match(location)} />
                    ))}

                    {profileHref ? (
                        <TabLink href={profileHref} label="Profile" icon={UserCircle2} active={isProfileActive} />
                    ) : (
                        <button
                            type="button"
                            onClick={() => setAuthModalOpen(true)}
                            className="flex flex-col items-center justify-center gap-0.5 h-full text-muted-foreground"
                        >
                            <UserCircle2 className="h-5 w-5" />
                            <span className="text-[10px] font-medium">Sign In</span>
                        </button>
                    )}
                </div>
            </nav>

            <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} />
        </>
    )
}

function TabLink({
    href,
    label,
    icon: Icon,
    active,
    glow,
}: {
    href: string
    label: string
    icon: typeof Home
    active: boolean
    glow?: boolean
}) {
    return (
        <Link
            href={href}
            className={`flex flex-col items-center justify-center gap-0.5 h-full ${
                active ? 'text-accent' : 'text-muted-foreground'
            }`}
        >
            <Icon className={`h-5 w-5 ${glow ? 'pay-rent-glow rounded-full' : ''}`} strokeWidth={active ? 2.5 : 2} />
            <span className={`text-[10px] ${active ? 'font-semibold' : 'font-medium'}`}>{label}</span>
        </Link>
    )
}
