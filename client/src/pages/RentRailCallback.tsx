import { useSearch, Link } from 'wouter'
import { useQuery } from '@tanstack/react-query'
import { PageSeo } from '@/components/seo/PageSeo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, CheckCircle2, AlertTriangle, Receipt, Clock } from 'lucide-react'

type RentRailStatus = 'pending_collection' | 'collected' | 'payout_pending_manual' | 'payout_processing' | 'paid_out' | 'collection_failed'

interface RentRailPayment {
    id: number
    tenantName: string
    landlordName?: string
    landlordPhone: string
    amount: number
    currency: string
    serviceFee: number
    netPayout: number
    status: RentRailStatus
    collectionError?: string
    receiptSent: boolean
}

// While the tenant's own charge is still being confirmed — shows the
// generic "Confirming your payment..." page below.
const COLLECTING_STATUSES = new Set(['pending_collection', 'collected'])
// Keeps polling (every 2.5s) so this page updates live without a refresh —
// includes payout_processing since the automatic IoTec disbursement
// (server/gene/rentrail.ts's attemptAutoDisbursement) can take a moment to
// reach a terminal status; see checkAndUpdateDisbursementStatus, which this
// same GET re-checks on every poll.
const POLLING_STATUSES = new Set(['pending_collection', 'collected', 'payout_processing'])

/**
 * Result page for RentRail.tsx's in-app IoTec payment flow — reached via a
 * local navigation (setLocation) once the shared payment gateway modal
 * reports success, not a provider redirect, so this just reads ?paymentId=
 * and polls its status. Payout to the landlord is automatic by default now
 * (see server/gene/rentrail.ts's doc comment) but still falls back to
 * admin-confirmed if IoTec's side doesn't cooperate, so `paid_out` isn't
 * the only "done" state worth a calm explanation.
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
        refetchInterval: (query) => (query.state.data && POLLING_STATUSES.has(query.state.data.status) ? 2500 : false),
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

    if (COLLECTING_STATUSES.has(payment.status)) {
        return (
            <StatusPage
                icon={<Loader2 className="h-12 w-12 text-accent animate-spin" />}
                title="Confirming your payment..."
                description="Please don't close this page."
            />
        )
    }

    // payout_processing, payout_pending_manual, or paid_out — either way the tenant's charge succeeded.
    const isPaidOut = payment.status === 'paid_out'
    const isAutoProcessing = payment.status === 'payout_processing'

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
                            {isAutoProcessing ? (
                                <Loader2 className="h-5 w-5 flex-shrink-0 mt-0.5 text-accent animate-spin" />
                            ) : (
                                <Clock className="h-5 w-5 flex-shrink-0 mt-0.5 text-accent" />
                            )}
                            <div className="text-sm">
                                <p className="font-medium mb-1">Your payment is confirmed</p>
                                <p className="text-muted-foreground">
                                    {isAutoProcessing
                                        ? "We're sending this to your landlord's mobile money automatically right now — this page updates the moment it's done, no need to refresh."
                                        : "Our team sends this to your landlord shortly. You don't need to do anything else — this page (and your account, if you're signed in) will show it as sent once it's done."}
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="flex items-start gap-3 bg-accent/10 rounded-lg p-4">
                        <Receipt className="h-5 w-5 flex-shrink-0 mt-0.5 text-accent" />
                        <div className="text-sm">
                            <p className="font-medium mb-1">
                                {isPaidOut ? "We've sent you a WhatsApp payment confirmation" : "Ask your landlord for your EFRIS receipt"}
                            </p>
                            <p className="text-muted-foreground">
                                {isPaidOut
                                    ? payment.receiptSent
                                        ? "That WhatsApp message — and this page — are your own record of what you paid. Neither is a substitute for the official EFRIS tax receipt: only your landlord can issue that, using their own tax registration. Ugandan law requires them to give you one — ask directly."
                                        : "We couldn't deliver that WhatsApp confirmation, but this page is still your record of what you paid — worth a screenshot. Separately, only your landlord can issue the official EFRIS tax receipt; Ugandan law requires them to give you one — ask directly."
                                    : "Only your landlord can issue a valid EFRIS tax receipt for this payment — by law they're required to. This page is your own record that you paid on time in the meantime."}
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
