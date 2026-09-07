import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, Banknote, Wallet, Clock, XCircle, Phone } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

/**
 * Admin-only queue for RentRail's manual payout leg (server/gene/rentrail.ts)
 * — mirrors AdminPayoutApprovals.tsx's pattern for the same underlying
 * reason: no automated IoTec disbursement API is verified in this codebase,
 * so an admin sends the landlord their share by hand (mobile money, same
 * numbers shown here) and confirms it below.
 */
type RentRailStatus = 'pending_collection' | 'collected' | 'payout_pending_manual' | 'paid_out' | 'collection_failed'

interface RentRailPayment {
    id: number
    tenantName: string
    tenantPhone: string
    landlordName?: string
    landlordPhone: string
    landlordPhoneLocal: string
    amount: number
    currency: string
    serviceFee: number
    netPayout: number
    status: RentRailStatus
    collectionError?: string
    payoutConfirmedBy?: string
    payoutConfirmedAt?: string
    receiptSent: boolean
    receiptDeliveryError?: string
    createdAt: string
}

const STATUS_LABEL: Record<RentRailStatus, string> = {
    pending_collection: 'Awaiting tenant payment',
    collected: 'Collected — finalizing',
    payout_pending_manual: 'Awaiting payout',
    paid_out: 'Paid out',
    collection_failed: 'Collection failed',
}

const STATUS_VARIANT: Record<RentRailStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    pending_collection: 'secondary',
    collected: 'secondary',
    payout_pending_manual: 'default',
    paid_out: 'outline',
    collection_failed: 'destructive',
}

function formatAge(iso: string): string {
    const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000
    if (hours < 1) return 'just now'
    if (hours < 48) return `${Math.round(hours)}h ago`
    return `${Math.round(hours / 24)}d ago`
}

export default function AdminRentRailPayouts() {
    const { toast } = useToast()
    const [rows, setRows] = useState<RentRailPayment[]>([])
    const [loading, setLoading] = useState(true)
    const [actingOn, setActingOn] = useState<number | null>(null)
    const [tab, setTab] = useState<RentRailStatus | 'all'>('payout_pending_manual')

    const load = async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/gene/rentrail/admin/payments', { credentials: 'include' })
            const data = await res.json().catch(() => [])
            if (!res.ok) throw new Error(data?.message || 'Failed to load RentRail payments.')
            setRows(Array.isArray(data) ? data : [])
        } catch (err: any) {
            toast({ title: "Couldn't load RentRail payments", description: err?.message, variant: 'destructive' })
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        load()
    }, [])

    const markPaidOut = async (id: number) => {
        setActingOn(id)
        try {
            const res = await fetch(`/api/gene/rentrail/admin/payments/${id}/mark-paid-out`, {
                method: 'POST',
                credentials: 'include',
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data?.message || 'Action failed.')
            setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...data } : r)))
            toast({ title: 'Marked as paid out' })
        } catch (err: any) {
            toast({ title: 'Action failed', description: err?.message, variant: 'destructive' })
        } finally {
            setActingOn(null)
        }
    }

    const filtered = tab === 'all' ? rows : rows.filter((r) => r.status === tab)
    const pendingRows = rows.filter((r) => r.status === 'payout_pending_manual')
    const pendingTotal = pendingRows.reduce((sum, r) => sum + r.netPayout, 0)
    const paidTodayCount = rows.filter(
        (r) => r.status === 'paid_out' && r.payoutConfirmedAt && new Date(r.payoutConfirmedAt).toDateString() === new Date().toDateString()
    ).length

    return (
        <div className="container mx-auto px-4 py-8 max-w-4xl">
            <div className="mb-6">
                <h1 className="text-3xl font-bold flex items-center gap-2">
                    <Wallet className="h-7 w-7 text-accent" /> RentRail Payouts
                </h1>
                <p className="text-muted-foreground mt-1">
                    A tenant's rent is collected automatically. Sending the landlord their share (net of the service
                    fee) is manual for now — send it by mobile money to the number shown, then mark it paid out here.
                </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
                <Card className={pendingRows.length > 0 ? 'border-amber-500' : undefined}>
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" /> Awaiting payout
                        </CardDescription>
                        <CardTitle className="text-3xl">{pendingRows.length}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Total owed to landlords</CardDescription>
                        <CardTitle className="text-2xl">{pendingTotal.toLocaleString()} UGX</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Paid out today</CardDescription>
                        <CardTitle className="text-3xl">{paidTodayCount}</CardTitle>
                    </CardHeader>
                </Card>
            </div>

            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
                <TabsList className="flex-wrap h-auto">
                    <TabsTrigger value="payout_pending_manual">Awaiting payout</TabsTrigger>
                    <TabsTrigger value="paid_out">Paid</TabsTrigger>
                    <TabsTrigger value="collection_failed">Collection failed</TabsTrigger>
                    <TabsTrigger value="all">All</TabsTrigger>
                </TabsList>

                <TabsContent value={tab} className="mt-4 space-y-4">
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <p className="text-muted-foreground text-center py-12">Nothing here.</p>
                    ) : (
                        filtered.map((r) => (
                            <Card key={r.id}>
                                <CardContent className="pt-6">
                                    <div className="flex items-start justify-between gap-4 flex-wrap">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                <h3 className="font-semibold text-lg">{r.landlordName || 'Unnamed landlord'}</h3>
                                                <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                                            </div>
                                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                                                <Phone className="h-3.5 w-3.5" /> {r.landlordPhoneLocal || r.landlordPhone}
                                            </p>
                                            <p className="text-sm text-muted-foreground">
                                                Tenant: <span className="text-foreground">{r.tenantName}</span> ({r.tenantPhone})
                                            </p>
                                            <p className="text-sm text-muted-foreground mt-1">
                                                {new Date(r.createdAt).toLocaleString()} ({formatAge(r.createdAt)})
                                                {r.payoutConfirmedBy && ` · Paid by ${r.payoutConfirmedBy}`}
                                            </p>
                                            {r.collectionError && (
                                                <p className="text-sm mt-1 text-destructive flex items-start gap-1">
                                                    <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {r.collectionError}
                                                </p>
                                            )}
                                            {r.status === 'paid_out' && !r.receiptSent && (
                                                <p className="text-sm mt-1 text-amber-600 flex items-start gap-1">
                                                    <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                                    WhatsApp confirmation not delivered{r.receiptDeliveryError ? ` — ${r.receiptDeliveryError}` : ''}.
                                                    Tenant still has the result page as their record.
                                                </p>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            <p className="text-2xl font-bold">{r.netPayout.toLocaleString()} UGX</p>
                                            <p className="text-xs text-muted-foreground">
                                                of {r.amount.toLocaleString()} — {r.serviceFee.toLocaleString()} fee
                                            </p>
                                        </div>
                                    </div>

                                    {r.status === 'payout_pending_manual' && (
                                        <div className="flex gap-2 mt-4">
                                            <Button size="sm" onClick={() => markPaidOut(r.id)} disabled={actingOn === r.id}>
                                                {actingOn === r.id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                                ) : (
                                                    <Banknote className="h-4 w-4 mr-1" />
                                                )}
                                                Mark as paid out
                                            </Button>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        ))
                    )}
                </TabsContent>
            </Tabs>
        </div>
    )
}
