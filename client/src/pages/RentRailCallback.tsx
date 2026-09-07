import { useSearch, Link } from 'wouter'
import { useQuery } from '@tanstack/react-query'
import { PageSeo } from '@/components/seo/PageSeo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, CheckCircle2, AlertTriangle, Receipt, Clock } from 'lucide-react'

interface RentRailPayment {
    id: number
    tenantName: string
    landlordName?: string
    landlordPhone: string
    amount: number
    currency: string
    serviceFee: number
    netPayout: number
    status: 'pending_collection' | 'collected' | 'payout_pending_manual' | 'paid_out' | 'collection_failed'
    collectionError?: string
}

const PROCESSING_STATUSES = new Set(['pending_collection', 'collected'])

/**
 * Result page for RentRail.tsx's in-app IoTec payment flow — reached via a
 * local navigation (setLocation) once the shared payment gateway modal
 * reports success, not a provider redirect, so this just reads ?paymentId=
 * and polls its status. Payout to the landlord is admin-confirmed, not
 * automatic (see server/gene/rentrail.ts's doc comment), so `paid_out`
 * isn't the only "done" state worth a calm explanation — payout_pending_manual
 * is too, and isn't something to keep spinning on.
 */
export default function RentRailCallback() {
    const search = useSearch()
    const params = new URLSearchParams(search)
    const paymentId = params.get('paymentId')

    const { data: payment, isLoading } = useQuery<RentRailPayment>({
        queryKey: [`/api/gene/rentrail/payments/${paymentId}`],
        queryFn: async () => {
            const res = await fetch(`/api/gene/rentrail/payments/${paymentId}`)
            if (!res.ok) throw new Error('Payment not found')
            return res.json()
        },
        enabled: !!paymentId,
        refetchInterval: (query) => (query.state.data && PROCESSING_STATUSES.has(query.state.data.status) ? 2500 : false),
    })

    if (!paymentId || (isLoading && !payment)) {
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

    if (PROCESSING_STATUSES.has(payment.status)) {
        return (
            <StatusPage
                icon={<Loader2 className="h-12 w-12 text-accent animate-spin" />}
                title="Confirming your payment..."
                description="Please don't close this page."
            />
        )
    }

    // payout_pending_manual or paid_out — either way the tenant's charge succeeded.
    const isPaidOut = payment.status === 'paid_out'

    return (
        <div className="container mx-auto px-4 py-16 max-w-lg">
            <PageSeo title="Payment Complete — RentRail" description="Your rent payment was received." canonicalPath="/rentrail/callback" />
            <Card>
                <CardHeader className="text-center pb-2">
                    {isPaidOut ? (
                        <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto mb-3" />
                    ) : (
                        <Clock className="h-14 w-14 text-accent mx-auto mb-3" />
                    )}
                    <CardTitle className="text-xl">
                        {isPaidOut
                            ? `Rent sent to ${payment.landlordName || 'your landlord'}`
                            : `Payment received — sending to ${payment.landlordName || 'your landlord'}`}
                    </CardTitle>
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
                            <span>{isPaidOut ? 'Sent to landlord' : 'Due to landlord'}</span>
                            <span>{payment.netPayout.toLocaleString()} {payment.currency}</span>
                        </div>
                    </div>

                    {!isPaidOut && (
                        <div className="flex items-start gap-3 bg-muted/40 rounded-lg p-4">
                            <Clock className="h-5 w-5 flex-shrink-0 mt-0.5 text-accent" />
                            <div className="text-sm">
                                <p className="font-medium mb-1">Your payment is confirmed</p>
                                <p className="text-muted-foreground">
                                    Our team sends this to your landlord shortly. You don't need to do anything else —
                                    this page (and your account, if you're signed in) will show it as sent once it's
                                    done.
                                </p>
                            </div>
                        </div>
                    )}

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
}: {
    icon: React.ReactNode
    title: string
    description: string
    action?: React.ReactNode
}) {
    return (
        <div className="container mx-auto px-4 py-24 max-w-md text-center">
            <PageSeo title={`${title} — RentRail`} description={description} canonicalPath="/rentrail/callback" />
            <div className="flex justify-center mb-5">{icon}</div>
            <h1 className="text-xl font-display font-bold mb-2">{title}</h1>
            <p className="text-muted-foreground mb-6">{description}</p>
            {action}
        </div>
    )
}
