import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Phone, Receipt, XCircle } from 'lucide-react'

/**
 * Shared receipt list for RentRail's Rent Pay tab — used by both
 * UserDashboard.tsx (perspective="tenant", from GET /my-payments) and
 * AgentDashboard.tsx (perspective="landlord", from GET /landlord-payments).
 * Same underlying record (server/gene/rentrail.ts's RentRailPayment), just
 * shown from whichever side the viewer is on: a tenant sees who they paid
 * and what they're owed; a landlord sees who paid them and what they'll
 * receive (already net of the service fee).
 */
export type RentRailStatus = 'pending_collection' | 'collected' | 'payout_pending_manual' | 'paid_out' | 'collection_failed'

export interface RentRailReceiptRow {
    id: number
    txRef: string
    tenantName: string
    tenantPhone: string
    landlordName?: string
    landlordPhone: string
    amount: number
    currency: string
    serviceFee: number
    netPayout: number
    status: RentRailStatus
    receiptSent: boolean
    createdAt: string
}

const STATUS_LABEL: Record<RentRailStatus, string> = {
    pending_collection: 'Awaiting payment',
    collected: 'Collected — finalizing',
    payout_pending_manual: 'Payment received — sending to landlord',
    paid_out: 'Paid out',
    collection_failed: 'Payment failed',
}

const STATUS_VARIANT: Record<RentRailStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    pending_collection: 'secondary',
    collected: 'secondary',
    payout_pending_manual: 'default',
    paid_out: 'outline',
    collection_failed: 'destructive',
}

export default function RentRailReceiptList({
    perspective,
    rows,
    isLoading,
}: {
    perspective: 'tenant' | 'landlord'
    rows: RentRailReceiptRow[]
    isLoading: boolean
}) {
    if (isLoading) {
        return (
            <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (rows.length === 0) {
        return (
            <Card>
                <CardContent className="text-center py-12">
                    <Receipt className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">
                        {perspective === 'tenant'
                            ? 'No rent payments yet — pay your rent through RentRail to see receipts here.'
                            : 'No rent payments received yet.'}
                    </p>
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="space-y-3">
            {rows.map((r) => {
                const counterpartLabel = perspective === 'tenant' ? 'Paid to' : 'Paid by'
                const counterpartName = perspective === 'tenant' ? r.landlordName || 'your landlord' : r.tenantName
                const counterpartPhone = perspective === 'tenant' ? r.landlordPhone : r.tenantPhone
                const headlineAmount = perspective === 'tenant' ? r.amount : r.netPayout

                return (
                    <Card key={r.id}>
                        <CardContent className="pt-6">
                            <div className="flex items-start justify-between gap-4 flex-wrap">
                                <div>
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        <h3 className="font-semibold">
                                            {counterpartLabel}: {counterpartName}
                                        </h3>
                                        <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                                    </div>
                                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                                        <Phone className="h-3.5 w-3.5" /> {counterpartPhone}
                                    </p>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        {new Date(r.createdAt).toLocaleString()} · Ref: {r.txRef}
                                    </p>
                                    {perspective === 'tenant' && r.status === 'paid_out' && !r.receiptSent && (
                                        <p className="text-sm mt-1 text-amber-600 flex items-start gap-1">
                                            <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                            The WhatsApp confirmation didn't go through, but this is your record that you paid.
                                        </p>
                                    )}
                                </div>
                                <div className="text-right">
                                    <p className="text-2xl font-bold">{headlineAmount.toLocaleString()} {r.currency}</p>
                                    {perspective === 'landlord' && (
                                        <p className="text-xs text-muted-foreground">
                                            of {r.amount.toLocaleString()} — {r.serviceFee.toLocaleString()} fee
                                        </p>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )
            })}
        </div>
    )
}
