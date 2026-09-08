import { useEffect, useState } from 'react'
import { useLocation, Link } from 'wouter'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { apiRequest } from '@/lib/queryClient'
import {
    intiateGateWay,
    makePaymentString,
    paymentEmitter,
    PaymentSources,
    sendPaymentRequest,
} from '@/lib/iotec-paymentpatch'
import { PageSeo } from '@/components/seo/PageSeo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, Receipt, ShieldCheck, ArrowRight } from 'lucide-react'

/**
 * RentRail — pay any landlord's mobile money number directly, no listing on
 * RealEVR required. This is deliberately separate from the property-page
 * booking/deposit flows (BookingCalendarModal etc.): those pay for viewing
 * or booking a RealEVR listing; this pays actual rent to any landlord.
 *
 * Phase 1 / "Path A" per the build brief this implements: RentRail cannot
 * issue a valid EFRIS receipt on a landlord's behalf (only the registered
 * taxpayer can, against their own TIN) — so this doesn't pretend to. The
 * payment record this page produces is the tenant's own proof of what was
 * paid; the actual EFRIS receipt still has to come from the landlord, which
 * the result page after payment says plainly.
 *
 * Collection runs through the same IoTec mobile-money gateway every other
 * payment on this site already uses (see client/src/lib/iotec-paymentpatch.ts
 * and the global <IoTecGatewayLight> modal AppShell renders) — sendPaymentRequest
 * gets an access token, intiateGateWay opens that shared modal, and the
 * `paymentEmitter` event below fires once IoTec confirms the charge. The
 * payout to the landlord runs through IoTec's disbursements API
 * automatically, falling back to an admin sending it by hand only if that
 * doesn't go through (see server/gene/rentrail.ts's doc comment).
 */
const SERVICE_FEE_UGX = 1000

export default function RentRail() {
    const { user } = useAuth()
    const { toast } = useToast()
    const [, setLocation] = useLocation()
    const [landlordName, setLandlordName] = useState('')
    const [landlordPhone, setLandlordPhone] = useState('')
    const [tenantName, setTenantName] = useState(user?.fullName || '')
    const [tenantPhone, setTenantPhone] = useState(user?.phoneNumber || '')
    const [amount, setAmount] = useState('')
    const [confirmFullAmount, setConfirmFullAmount] = useState(false)
    const [acceptedPolicy, setAcceptedPolicy] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [pendingPaymentId, setPendingPaymentId] = useState<number | null>(null)

    const amountNum = Number(amount)
    const netToLandlord = Number.isFinite(amountNum) && amountNum > SERVICE_FEE_UGX ? amountNum - SERVICE_FEE_UGX : null

    // Fires once the shared IoTec gateway modal confirms this specific
    // payment's charge succeeded — see PaymentSources.paymentRentRail.
    useEffect(() => {
        const eventName = makePaymentString(PaymentSources.paymentRentRail)
        const handler = async (data: { transactionID: string }) => {
            if (pendingPaymentId === null) return
            try {
                await apiRequest('POST', `/api/gene/rentrail/payments/${pendingPaymentId}/collected`, {
                    transactionId: data.transactionID,
                })
            } catch (error) {
                // The result page re-fetches the payment's real status regardless,
                // so a failure to report it here just means that page shows
                // "processing" a little longer, never a lost payment.
                console.error('Failed to report RentRail collection:', error)
            }
            setLocation(`/rentrail/callback?paymentId=${pendingPaymentId}`)
        }
        paymentEmitter.on(eventName, handler)
        return () => {
            paymentEmitter.off(eventName, handler)
        }
    }, [pendingPaymentId, setLocation])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (isSubmitting) return

        if (!landlordPhone.trim() || !tenantPhone.trim() || !tenantName.trim() || !amount) {
            toast({ title: 'Missing details', description: 'Fill in your name, both phone numbers, and the rent amount.', variant: 'destructive' })
            return
        }
        if (!Number.isFinite(amountNum) || amountNum <= SERVICE_FEE_UGX) {
            toast({
                title: 'Invalid amount',
                description: `Amount must be more than the ${SERVICE_FEE_UGX} UGX service fee.`,
                variant: 'destructive',
            })
            return
        }
        if (!confirmFullAmount || !acceptedPolicy) {
            toast({
                title: 'Confirm before paying',
                description: 'Check both boxes below — that this is your full rent, and that you agree to the payment terms.',
                variant: 'destructive',
            })
            return
        }

        setIsSubmitting(true)
        try {
            const res = await apiRequest('POST', '/api/gene/rentrail/pay', {
                landlordName: landlordName.trim() || undefined,
                landlordPhone: landlordPhone.trim(),
                tenantName: tenantName.trim(),
                tenantPhone: tenantPhone.trim(),
                amount: amountNum,
                confirmedFullAmount: true,
                acceptedPolicy: true,
            })
            const data = await res.json()
            setPendingPaymentId(data.paymentId)

            const tokenResult = await sendPaymentRequest()
            if (tokenResult.error) {
                toast({ title: 'Payment error', description: tokenResult.errorMessage, variant: 'destructive' })
                setIsSubmitting(false)
                return
            }
            intiateGateWay(tokenResult.accessToken, `${amountNum}`, PaymentSources.paymentRentRail)
        } catch (error: any) {
            toast({
                title: 'Could not start payment',
                description: error?.message?.replace(/^\d+:\s*/, '') || 'Something went wrong. Please try again.',
                variant: 'destructive',
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="container mx-auto px-4 py-12 max-w-xl">
            <PageSeo
                title="RentRail — Pay Rent Instantly"
                description="Pay any landlord's mobile money number directly. A flat UGX 1,000 service fee, the rest goes straight to your landlord."
                canonicalPath="/rentrail"
            />

            <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-accent/10 mb-3">
                    <Receipt className="h-6 w-6 text-accent" />
                </div>
                <h1 className="text-2xl font-display font-bold mb-2">Pay your rent, instantly</h1>
                <p className="text-muted-foreground">
                    Enter your landlord's mobile money number. We keep a flat {SERVICE_FEE_UGX.toLocaleString()} UGX
                    service fee and send the rest to them.
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Rent payment details</CardTitle>
                    <CardDescription>Works for any landlord — they don't need to be listed on RealEVR.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="landlordName">Landlord's name (optional)</Label>
                                <Input
                                    id="landlordName"
                                    placeholder="e.g. Mrs. Nakato"
                                    value={landlordName}
                                    onChange={(e) => setLandlordName(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="landlordPhone">Landlord's mobile money number</Label>
                                <Input
                                    id="landlordPhone"
                                    placeholder="07XXXXXXXX"
                                    inputMode="tel"
                                    value={landlordPhone}
                                    onChange={(e) => setLandlordPhone(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="amount">Rent amount (UGX)</Label>
                            <Input
                                id="amount"
                                type="number"
                                min={SERVICE_FEE_UGX + 1}
                                placeholder="e.g. 500000"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                required
                            />
                            {netToLandlord !== null && (
                                <p className="text-xs text-muted-foreground">
                                    {SERVICE_FEE_UGX.toLocaleString()} UGX service fee ·{' '}
                                    <span className="font-medium text-foreground">
                                        {netToLandlord.toLocaleString()} UGX
                                    </span>{' '}
                                    goes to your landlord
                                </p>
                            )}
                        </div>

                        <div className="border-t border-border pt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="tenantName">Your name</Label>
                                <Input
                                    id="tenantName"
                                    placeholder="Your full name"
                                    value={tenantName}
                                    onChange={(e) => setTenantName(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="tenantPhone">Your mobile money number</Label>
                                <Input
                                    id="tenantPhone"
                                    placeholder="07XXXXXXXX"
                                    inputMode="tel"
                                    value={tenantPhone}
                                    onChange={(e) => setTenantPhone(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        <div className="border-t border-border pt-5 space-y-3">
                            <label className="flex items-start gap-2.5 text-sm cursor-pointer select-none">
                                <Checkbox
                                    checked={confirmFullAmount}
                                    onCheckedChange={(v) => setConfirmFullAmount(v === true)}
                                    className="mt-0.5"
                                />
                                <span>
                                    This is my <strong>full</strong> rent payment for this period — not a partial
                                    payment. RentRail doesn't support partial rent payments.
                                </span>
                            </label>
                            <label className="flex items-start gap-2.5 text-sm cursor-pointer select-none">
                                <Checkbox
                                    checked={acceptedPolicy}
                                    onCheckedChange={(v) => setAcceptedPolicy(v === true)}
                                    className="mt-0.5"
                                />
                                <span>
                                    I agree to RentRail's{' '}
                                    <Link href="/refund-policy" target="_blank" className="underline hover:text-accent">
                                        payment terms
                                    </Link>
                                    , including that the service fee is non-refundable and this is not a tax receipt.
                                </span>
                            </label>
                        </div>

                        <Button type="submit" className="w-full" disabled={isSubmitting || !confirmFullAmount || !acceptedPolicy}>
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting payment...
                                </>
                            ) : (
                                <>
                                    Continue to pay {amountNum > 0 ? `${amountNum.toLocaleString()} UGX` : ''}
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                </>
                            )}
                        </Button>

                        <p className="text-xs text-center text-muted-foreground">
                            You'll get a mobile money prompt on the next screen. The {SERVICE_FEE_UGX.toLocaleString()}{' '}
                            UGX service fee is non-refundable once the payment completes.
                        </p>
                    </form>
                </CardContent>
            </Card>

            <div className="mt-6 flex items-start gap-3 text-sm text-muted-foreground bg-muted/40 rounded-lg p-4">
                <ShieldCheck className="h-5 w-5 flex-shrink-0 mt-0.5 text-accent" />
                <p>
                    The moment your landlord's payout is confirmed, we send you a WhatsApp payment confirmation —
                    that's what the service fee covers. But under Ugandan law, only your landlord can issue a valid
                    EFRIS tax receipt, so that confirmation isn't one — ask your landlord for the real receipt
                    directly. Full details in{' '}
                    <Link href="/refund-policy" className="underline hover:text-accent">
                        our payment terms
                    </Link>
                    .
                </p>
            </div>
        </div>
    )
}
