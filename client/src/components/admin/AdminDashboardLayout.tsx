import { type ReactNode } from 'react'
import { Link, useLocation } from 'wouter'
import { useAuth } from '@/hooks/use-auth'
import {
    LayoutDashboard,
    Building2,
    Video,
    Users,
    Wallet,
    Rocket,
    BarChart3,
    Megaphone,
    UserPlus,
    MessageSquare,
    Bell,
    Search,
} from 'lucide-react'

/**
 * Admin dashboard shell (GENE — admin-dashboard-rebuild), wrapping every
 * /admin/* page in one consistent sidebar + topbar chrome, in place of the
 * previous pattern of separate full-page routes only reachable from a
 * profile dropdown menu with no shared navigation between them. Every
 * destination that dropdown used to hold lives in the sidebar below instead
 * — see ProtectedAdminRoute (client/src/lib/protected-admin-route.tsx),
 * which wraps every admin page's Component in this layout, so no individual
 * admin page needs to import or render it itself.
 *
 * Visual structure (sidebar nav, topbar with search/notifications/avatar,
 * card-based content area) follows the reference dashboard design the
 * product owner supplied; the widgets living in the content area (see
 * AdminDashboardHome.tsx) are real data from /api/admin/overview, not the
 * reference's placeholder numbers.
 */

const NAV_ITEMS: Array<{ href: string; label: string; icon: typeof LayoutDashboard; roles: Array<'admin' | 'agent'> }> = [
    { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin'] },
    { href: '/admin/properties', label: 'Properties', icon: Building2, roles: ['admin', 'agent'] },
    { href: '/admin/virtual-tour-manager', label: 'Virtual Tours', icon: Video, roles: ['admin', 'agent'] },
    { href: '/admin/users', label: 'Users', icon: Users, roles: ['admin'] },
    { href: '/admin/messages', label: 'Messages', icon: MessageSquare, roles: ['admin'] },
    { href: '/admin/broker-applications', label: 'Broker Applications', icon: UserPlus, roles: ['admin'] },
    { href: '/admin/payout-approvals', label: 'Payout Approvals', icon: Wallet, roles: ['admin'] },
    { href: '/admin/boost-confirmations', label: 'Boost Confirmations', icon: Rocket, roles: ['admin', 'agent'] },
    { href: '/admin/analytics', label: 'User Analytics', icon: BarChart3, roles: ['admin'] },
    { href: '/admin/broadcast', label: 'Broadcast', icon: Megaphone, roles: ['admin'] },
]

export default function AdminDashboardLayout({ children }: { children: ReactNode }) {
    const [location] = useLocation()
    const { user } = useAuth()
    const role = (user?.role === 'admin' || user?.role === 'agent') ? user.role : 'admin'
    const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(role))
    const firstName = user?.fullName?.split(' ')[0] || user?.username || 'there'

    return (
        <div className="flex min-h-screen bg-secondary/30">
            {/* Sidebar */}
            <aside className="hidden md:flex md:w-64 md:flex-col border-r border-border bg-card px-4 py-6">
                <Link href="/" className="flex items-center gap-2 px-2 mb-8">
                    <span className="font-display font-bold text-lg text-foreground">RealEVR Admin</span>
                </Link>
                <nav className="flex-1 space-y-1">
                    {visibleItems.map((item) => {
                        const isActive = location === item.href
                        const Icon = item.icon
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                                    isActive
                                        ? 'bg-accent/15 text-accent'
                                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                                }`}
                            >
                                <Icon className="h-4 w-4 shrink-0" />
                                {item.label}
                            </Link>
                        )
                    })}
                </nav>
            </aside>

            {/* Main column */}
            <div className="flex-1 min-w-0 flex flex-col">
                {/* Topbar */}
                <header className="flex items-center justify-between gap-4 border-b border-border bg-card px-4 md:px-8 py-4">
                    <div>
                        <p className="text-sm text-muted-foreground">Welcome back</p>
                        <h1 className="text-lg font-display font-semibold text-foreground">
                            {firstName} <span aria-hidden>👋</span>
                        </h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            aria-label="Search"
                            className="hidden sm:flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-secondary"
                        >
                            <Search className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            aria-label="Notifications"
                            className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-secondary"
                        >
                            <Bell className="h-4 w-4" />
                        </button>
                        <div className="h-9 w-9 rounded-full bg-accent/15 flex items-center justify-center text-sm font-semibold text-accent">
                            {firstName.charAt(0).toUpperCase()}
                        </div>
                    </div>
                </header>

                {/* Mobile nav — the sidebar above is desktop-only; admin work on
                    a phone is realistically rare for this platform, so a simple
                    horizontal scroller beats building a second full nav. */}
                <nav className="md:hidden flex gap-2 overflow-x-auto border-b border-border bg-card px-4 py-2">
                    {visibleItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${
                                location === item.href
                                    ? 'bg-accent/15 text-accent'
                                    : 'bg-secondary text-muted-foreground'
                            }`}
                        >
                            {item.label}
                        </Link>
                    ))}
                </nav>

                <main className="flex-1 px-4 md:px-8 py-6">{children}</main>
            </div>
        </div>
    )
}
