import { useSearch, Link } from 'wouter'
import { useQuery } from '@tanstack/react-query'
import { PageSeo } from '@/components/seo/PageSeo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, CheckCircle2, AlertTriangle, Receipt, Copy } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface RentRailPayment {
    id: number
    txRef: string
    tenantName: string
    landlordName?: string
    landlordPhone: string
    amount: number
    currency: string
    serviceFee: number
    netPayout: number
    status:
        | 'pending_collection'
        | 'collected'
        | 'payout_pending'
        | 'paid_out'
        | 'collection_failed'
        | 'payout_failed'
    collectionError?: string
    payoutError?: string
}

const PROCESSING_STATUSES = new Set(['pending_collection', 'collected', 'payout_pending'])

/**
 * Where Flutterwave redirects the tenant back to after checkout
 * (?ref=<txRef>&status=...&transaction_id=...). Immediately asks the
 * server to verify + finalize (server/gene/rentrail.ts's /verify), then
 * polls the payment's own status until it lands somewhere final — the
 * payout leg is asynchronous at Flutterwave, so "paid" on their checkout
 * page doesn't yet mean the landlord has the money.
 */
export default function RentRailCallback() {
    const search = useSearch()
    const { toast } = useToast()

    const params = new URLSearchParams(search)
    const txRef = params.get('ref') ?? ''
    const transactionId = params.get('transaction_id') ?? ''
    const flwStatus = params.get('status') ?? ''

    // Kick the verify endpoint once — this component only mounts once per
    // redirect, and the server side is idempotent regardless (finalizing a
    // payment that's already past 'pending_collection' is a no-op there).
    useQuery({
        queryKey: [`/api/gene/rentrail/verify?tx_ref=${txRef}&transaction_id=${transactionId}`],
        queryFn: async () => {
            const res = await fetch(`/api/gene/rentrail/verify?tx_ref=${encodeURIComponent(txRef)}&transaction_id=${encodeURIComponent(transactionId)}`)
            return res.json()
        },
        enabled: !!txRef && !!transactionId && flwStatus !== 'cancelled',
        retry: false,
        gcTime: 0,
        staleTime: Infinity,
    })

    const { data: payment, isLoading } = useQuery<RentRailPayment>({
        queryKey: [`/api/gene/rentrail/payments/by-ref/${txRef}`],
        queryFn: async () => {
            const res = await fetch(`/api/gene/rentrail/payments/by-ref/${encodeURIComponent(txRef)}`)
            if (!res.ok) throw new Error('Payment not found')
            return res.json()
        },
        enabled: !!txRef,
        refetchInterval: (query) => (query.state.data && PROCESSING_STATUSES.has(query.state.data.status) ? 2500 : false),
    })

    const copyRef = () => {
        navigator.clipboard.writeText(txRef)
        toast({ title: 'Copied', description: 'Payment reference copied.' })
    }

    if (flwStatus === 'cancelled') {
        return (
            <StatusPage
                icon={<AlertTriangle className="h-12 w-12 text-amber-500" />}
                title="Payment cancelled"
                description="You cancelled the payment before it completed. No money was charged."
                action={
                    <Button asChild>
                        <Link href="/rentrail">Try again</Link>
                    </Button>
                }
            />
        )
    }

    if (!txRef || (isLoading && !payment)) {
        return (
            <StatusPage
                icon={<Loader2 className="h-12 w-12 text-accent animate-spin" />}
                title="Checking your payment..."
                description="This only takes a moment."
            />
        )
    }

    if (!payment) {
        return (
            <StatusPage
                icon={<AlertTriangle className="h-12 w-12 text-destructive" />}
                title="We couldn't find that payment"
                description="If money left your account, contact support with your payment reference so we can look into it."
                action={
                    <Button asChild variant="outline">
                        <Link href="/rentrail">Back to Pay Rent</Link>
                    </Button>
                }
            />
        )
    }

    if (payment.status === 'collection_failed') {
        return (
            <StatusPage
                icon={<AlertTriangle className="h-12 w-12 text-destructive" />}
                title="Payment didn't go through"
                description={payment.collectionError || 'Your mobile money charge was not completed.'}
                action={
                    <Button asChild>
                        <Link href="/rentrail">Try again</Link>
                    </Button>
                }
            />
        )
    }

    if (payment.status === 'payout_failed') {
        return (
            <StatusPage
                icon={<AlertTriangle className="h-12 w-12 text-amber-500" />}
                title="Rent received — payout hit a snag"
                description="Your rent was collected, but sending it to your landlord didn't go through automatically. Our team has been notified and will resolve this — you do not need to pay again."
                footnote={`Reference: ${txRef}`}
            />
        )
    }

    if (PROCESSING_STATUSES.has(payment.status)) {
        return (
            <StatusPage
                icon={<Loader2 className="h-12 w-12 text-accent animate-spin" />}
                title={payment.status === 'payout_pending' ? 'Sending money to your landlord...' : 'Processing your payment...'}
                description="Please don't close this page."
            />
        )
    }

    // paid_out
    return (
        <div className="container mx-auto px-4 py-16 max-w-lg">
            <PageSeo title="Payment Complete — RentRail" description="Your rent payment was sent." canonicalPath="/rentrail/callback" />
            <Card>
                <CardHeader className="text-center pb-2">
                    <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto mb-3" />
                    <CardTitle className="text-xl">Rent sent to {payment.landlordName || 'your landlord'}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="bg-muted/40 rounded-lg p-4 space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Rent paid</span>
                            <span className="font-medium">{payment.amount.toLocaleString()} {payment.currency}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">RentRail service fee</span>
                            <span>{payment.serviceFee.toLocaleString()} {payment.currency}</span>
                        </div>
                        <div className="flex justify-between border-t border-border pt-2 font-medium">
                            <span>Sent to landlord</span>
                            <span>{payment.netPayout.toLocaleString()} {payment.currency}</span>
                        </div>
                    </div>

                    <div className="flex items-start gap-3 bg-accent/10 rounded-lg p-4">
                        <Receipt className="h-5 w-5 flex-shrink-0 mt-0.5 text-accent" />
                        <div className="text-sm">
                            <p className="font-medium mb-1">Ask your landlord for your EFRIS receipt</p>
                            <p className="text-muted-foreground">
                                Only your landlord can issue a valid EFRIS tax receipt for this payment — by law
                                they're required to. This page is your own record that you paid on time in the
                                meantime.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Reference: {txRef}</span>
                        <Button variant="ghost" size="sm" onClick={copyRef} className="h-auto py-1 px-2">
                            <Copy className="h-3 w-3 mr-1" /> Copy
                        </Button>
                    </div>

                    <Button asChild className="w-full">
                        <Link href="/rentrail">Make another payment</Link>
                    </Button>
                </CardContent>
            </Card>
        </div>
    )
}

function StatusPage({
    icon,
    title,
    description,
    action,
    footnote,
}: {
    icon: React.ReactNode
    title: string
    description: string
    action?: React.ReactNode
    footnote?: string
}) {
    return (
        <div className="container mx-auto px-4 py-24 max-w-md text-center">
            <PageSeo title={`${title} — RentRail`} description={description} canonicalPath="/rentrail/callback" />
            <div className="flex justify-center mb-5">{icon}</div>
            <h1 className="text-xl font-display font-bold mb-2">{title}</h1>
            <p className="text-muted-foreground mb-6">{description}</p>
            {action}
            {footnote && <p className="text-xs text-muted-foreground mt-4">{footnote}</p>}
        </div>
    )
}
