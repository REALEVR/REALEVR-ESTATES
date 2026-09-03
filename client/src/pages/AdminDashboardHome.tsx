import { useEffect, useMemo, useState } from 'react'
import { Link } from 'wouter'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Wallet, Home, Users2, MapPin } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useToast } from '@/hooks/use-toast'
import type { Property } from '@shared/schema'

/**
 * Admin dashboard landing page ("Dashboard" in AdminDashboardLayout's
 * sidebar) — the revenue/property/sales overview from the reference design
 * the product owner supplied, rebuilt against real data from
 * /api/admin/overview instead of that reference's placeholder numbers.
 *
 * One deliberate honest gap vs. the reference: it included a literal map
 * ("Sales by Region"). Nothing in this codebase geocodes a property's
 * location string to real coordinates, so a map here would necessarily be
 * fake pins — instead this shows the same real breakdown (tour-payment
 * revenue by location) as a ranked list, which is the actual data a map
 * would have been visualizing anyway.
 */

interface TourPayment {
    id: number
    propertyId: number
    propertyTitle: string
    propertyLocation: string
    userName?: string
    userEmail?: string
    amount: number
    currency: string
    paymentTimestamp: string
}

interface AgentSubscription {
    isExpired: boolean
}

interface Overview {
    properties: Property[]
    tourPayments: TourPayment[]
    agentSubscriptions: AgentSubscription[]
}

async function fetchOverview(): Promise<Overview> {
    const res = await fetch('/api/admin/overview', { credentials: 'include' })
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message || 'Failed to load dashboard data')
    return res.json()
}

function formatMoney(amount: number, currency: string) {
    try {
        return new Intl.NumberFormat('en-UG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
    } catch {
        return `${currency} ${amount.toLocaleString()}`
    }
}

const DAY_MS = 24 * 60 * 60 * 1000

export default function AdminDashboardHome() {
    const { toast } = useToast()
    const [loading, setLoading] = useState(true)
    const [overview, setOverview] = useState<Overview | null>(null)

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const data = await fetchOverview()
                if (!cancelled) setOverview(data)
            } catch (err: any) {
                if (!cancelled) toast({ title: "Couldn't load dashboard", description: err?.message, variant: 'destructive' })
            } finally {
                if (!cancelled) setLoading(false)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [toast])

    // Every derived number below comes straight from overview.tourPayments /
    // overview.properties — no invented figures, no "from last week"
    // percentage unless it's a real computed comparison.
    const derived = useMemo(() => {
        const payments = overview?.tourPayments ?? []
        const properties = overview?.properties ?? []

        const primaryCurrency = payments[0]?.currency ?? 'UGX'
        const totalRevenue = payments.reduce((sum, p) => sum + (p.amount || 0), 0)

        const now = Date.now()
        const last7 = payments.filter((p) => now - new Date(p.paymentTimestamp).getTime() < 7 * DAY_MS)
        const prev7 = payments.filter((p) => {
            const age = now - new Date(p.paymentTimestamp).getTime()
            return age >= 7 * DAY_MS && age < 14 * DAY_MS
        })
        const last7Sum = last7.reduce((s, p) => s + (p.amount || 0), 0)
        const prev7Sum = prev7.reduce((s, p) => s + (p.amount || 0), 0)
        const weekOverWeekPct = prev7Sum > 0 ? Math.round(((last7Sum - prev7Sum) / prev7Sum) * 100) : null

        // Daily revenue series, last 30 days — real buckets, zero-filled so the
        // chart doesn't lie by connecting sparse points as if they were adjacent days.
        const days: Array<{ date: string; revenue: number }> = []
        for (let i = 29; i >= 0; i--) {
            const d = new Date(now - i * DAY_MS)
            const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            days.push({ date: key, revenue: 0 })
        }
        for (const p of payments) {
            const ageDays = Math.floor((now - new Date(p.paymentTimestamp).getTime()) / DAY_MS)
            if (ageDays >= 0 && ageDays < 30) {
                days[29 - ageDays].revenue += p.amount || 0
            }
        }

        const byLocation = new Map<string, number>()
        for (const p of payments) {
            byLocation.set(p.propertyLocation, (byLocation.get(p.propertyLocation) || 0) + (p.amount || 0))
        }
        const topLocations = Array.from(byLocation.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6)
        const maxLocationRevenue = topLocations[0]?.[1] ?? 0

        const recentProperties = [...properties]
            .filter((p) => p.title)
            .sort((a, b) => (b.id ?? 0) - (a.id ?? 0))
            .slice(0, 4)

        const recentPayments = [...payments]
            .sort((a, b) => new Date(b.paymentTimestamp).getTime() - new Date(a.paymentTimestamp).getTime())
            .slice(0, 7)

        const activeAgentSubs = (overview?.agentSubscriptions ?? []).filter((s) => !s.isExpired).length

        return {
            primaryCurrency,
            totalRevenue,
            weekOverWeekPct,
            days,
            topLocations,
            maxLocationRevenue,
            recentProperties,
            recentPayments,
            totalProperties: properties.length,
            activeAgentSubs,
        }
    }, [overview])

    if (loading) {
        return (
            <div className="flex justify-center py-24">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Stat cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                                <Wallet className="h-4 w-4" /> Total Revenue
                            </p>
                            {derived.weekOverWeekPct !== null && (
                                <span className={`text-xs font-medium ${derived.weekOverWeekPct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                    {derived.weekOverWeekPct >= 0 ? '+' : ''}
                                    {derived.weekOverWeekPct}%
                                </span>
                            )}
                        </div>
                        <p className="mt-2 text-2xl font-display font-bold text-foreground">
                            {formatMoney(derived.totalRevenue, derived.primaryCurrency)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">From tour-viewing payments</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                            <Home className="h-4 w-4" /> Total Properties
                        </p>
                        <p className="mt-2 text-2xl font-display font-bold text-foreground">{derived.totalProperties}</p>
                        <p className="text-xs text-muted-foreground mt-1">Live on the platform</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                            <Users2 className="h-4 w-4" /> Active Agent Subscriptions
                        </p>
                        <p className="mt-2 text-2xl font-display font-bold text-foreground">{derived.activeAgentSubs}</p>
                        <p className="text-xs text-muted-foreground mt-1">Not expired</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Revenue chart */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-base">Revenue — last 30 days</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {derived.totalRevenue === 0 ? (
                            <p className="text-sm text-muted-foreground py-12 text-center">No tour-viewing payments recorded yet.</p>
                        ) : (
                            <ResponsiveContainer width="100%" height={260}>
                                <LineChart data={derived.days}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                    <XAxis dataKey="date" fontSize={11} interval={4} />
                                    <YAxis fontSize={11} />
                                    <Tooltip formatter={(v: number) => formatMoney(v, derived.primaryCurrency)} />
                                    <Line type="monotone" dataKey="revenue" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>

                {/* Property list */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-base">Recent Properties</CardTitle>
                        <Link href="/admin/properties" className="text-xs text-accent font-medium">
                            See all
                        </Link>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {derived.recentProperties.length === 0 && (
                            <p className="text-sm text-muted-foreground">No properties yet.</p>
                        )}
                        {derived.recentProperties.map((p) => (
                            <div key={p.id} className="flex items-center gap-3">
                                <img
                                    src={p.imageUrl}
                                    alt={p.title}
                                    className="h-12 w-12 rounded-lg object-cover shrink-0 bg-secondary"
                                />
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-foreground truncate">{p.title}</p>
                                    <p className="text-xs text-muted-foreground truncate">{p.location}</p>
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Sales report */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-base">Recent Sales</CardTitle>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                        {derived.recentPayments.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-6 text-center">No payments recorded yet.</p>
                        ) : (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-muted-foreground border-b border-border">
                                        <th className="pb-2 font-medium">Customer</th>
                                        <th className="pb-2 font-medium">Property</th>
                                        <th className="pb-2 font-medium">Amount</th>
                                        <th className="pb-2 font-medium">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {derived.recentPayments.map((p) => (
                                        <tr key={p.id} className="border-b border-border last:border-0">
                                            <td className="py-2.5 pr-2">{p.userName || p.userEmail || 'Guest'}</td>
                                            <td className="py-2.5 pr-2 truncate max-w-[160px]">{p.propertyTitle}</td>
                                            <td className="py-2.5 pr-2 font-medium">{formatMoney(p.amount, p.currency)}</td>
                                            <td className="py-2.5">
                                                <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium px-2 py-0.5">
                                                    Paid
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </CardContent>
                </Card>

                {/* Revenue by location — the honest substitute for a map;
                    see file-top comment. */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-1.5">
                            <MapPin className="h-4 w-4" /> Revenue by Location
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {derived.topLocations.length === 0 && (
                            <p className="text-sm text-muted-foreground">No location data yet.</p>
                        )}
                        {derived.topLocations.map(([location, amount]) => (
                            <div key={location}>
                                <div className="flex justify-between text-xs mb-1">
                                    <span className="text-foreground font-medium truncate">{location}</span>
                                    <span className="text-muted-foreground">{formatMoney(amount, derived.primaryCurrency)}</span>
                                </div>
                                <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                                    <div
                                        className="h-full bg-accent rounded-full"
                                        style={{ width: `${derived.maxLocationRevenue > 0 ? (amount / derived.maxLocationRevenue) * 100 : 0}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
