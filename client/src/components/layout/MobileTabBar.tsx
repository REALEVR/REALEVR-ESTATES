import { useState } from 'react'
import { Link, useLocation } from 'wouter'
import { useAuth } from '@/hooks/use-auth'
import AuthModal from '@/components/auth/AuthModal'
import { Compass, Building2, PlusCircle, Receipt, UserCircle2 } from 'lucide-react'

/**
 * Phone bottom bar: five equal, plainly labelled places, like the apps people already
 * know. Every one is a page that exists today (no Favorites or Messages tab just to fill
 * the row). The active tab is ink with a small gold mark above it; the rest are quiet.
 * md:hidden: desktop has all of this in the header.
 */
const TABS = [
    { href: '/', label: 'Explore', icon: Compass, match: (p: string) => p === '/' || p.startsWith('/homes') },
    { href: '/properties', label: 'Homes', icon: Building2, match: (p: string) => p.startsWith('/properties') || p.startsWith('/property') },
    { href: '/list-your-property', label: 'List', icon: PlusCircle, match: (p: string) => p.startsWith('/list-your-property') },
    { href: '/rentrail', label: 'Pay rent', icon: Receipt, match: (p: string) => p.startsWith('/rentrail') },
] as const

export default function MobileTabBar() {
    const [location] = useLocation()
    const { user } = useAuth()
    const [authModalOpen, setAuthModalOpen] = useState(false)
    const isProfileActive = location.startsWith('/profile')

    return (
        <>
            <nav
                className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur-xl"
                style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
                aria-label="Primary"
            >
                <div className="grid h-16 grid-cols-5 items-stretch">
                    {TABS.map((tab) => (
                        <TabLink key={tab.href} {...tab} active={tab.match(location)} />
                    ))}
                    {user ? (
                        <TabLink href="/profile" label="Profile" icon={UserCircle2} active={isProfileActive} />
                    ) : (
                        <button type="button" onClick={() => setAuthModalOpen(true)} className={tabClass(false)}>
                            <UserCircle2 className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
                            <span className="text-[11px] font-medium">Sign in</span>
                        </button>
                    )}
                </div>
            </nav>

            <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} />
        </>
    )
}

const tabClass = (active: boolean) =>
    `relative flex min-h-[44px] flex-col items-center justify-center gap-0.5 transition-colors active:scale-95 ${
        active ? 'text-foreground' : 'text-muted-foreground'
    }`

function TabLink({
    href,
    label,
    icon: Icon,
    active,
}: {
    href: string
    label: string
    icon: typeof Compass
    active: boolean
}) {
    return (
        <Link href={href} className={tabClass(active)} aria-current={active ? 'page' : undefined}>
            {active && <span className="absolute top-0 h-[3px] w-8 rounded-b-full bg-[hsl(var(--gold))]" aria-hidden="true" />}
            <Icon className="h-6 w-6" strokeWidth={active ? 2.25 : 1.75} aria-hidden="true" />
            <span className={`text-[11px] ${active ? 'font-semibold' : 'font-medium'}`}>{label}</span>
        </Link>
    )
}
