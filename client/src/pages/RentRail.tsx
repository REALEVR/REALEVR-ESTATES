import { useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { apiRequest } from '@/lib/queryClient'
import { PageSeo } from '@/components/seo/PageSeo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Loader2, Receipt, ShieldCheck, ArrowRight } from 'lucide-react'
import { Link } from 'wouter'

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
 */
const SERVICE_FEE_UGX = 1000

export default function RentRail() {
    const { user } = useAuth()
    const { toast } = useToast()
    const [landlordName, setLandlordName] = useState('')
    const [landlordPhone, setLandlordPhone] = useState('')
    const [tenantName, setTenantName] = useState(user?.fullName || '')
    const [tenantPhone, setTenantPhone] = useState(user?.phoneNumber || '')
    const [amount, setAmount] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    const amountNum = Number(amount)
    const netToLandlord = Number.isFinite(amountNum) && amountNum > SERVICE_FEE_UGX ? amountNum - SERVICE_FEE_UGX : null

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

        setIsSubmitting(true)
        try {
            const res = await apiRequest('POST', '/api/gene/rentrail/pay', {
                landlordName: landlordName.trim() || undefined,
                landlordPhone: landlordPhone.trim(),
                tenantName: tenantName.trim(),
                tenantPhone: tenantPhone.trim(),
                amount: amountNum,
            })
            const data = await res.json()
            window.location.href = data.paymentLink
        } catch (error: any) {
            toast({
                title: 'Could not start payment',
                description: error?.message?.replace(/^\d+:\s*/, '') || 'Something went wrong. Please try again.',
                variant: 'destructive',
            })
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
                    Enter your landlord's mobile money number. We keep a flat {SERVICE_FEE_UGX} UGX service fee and
                    send the rest straight to them.
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

                        <Button type="submit" className="w-full" disabled={isSubmitting}>
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
                            You'll pay by mobile money on the next screen. The {SERVICE_FEE_UGX} UGX service fee is
                            non-refundable once the payment completes.
                        </p>
                    </form>
                </CardContent>
            </Card>

            <div className="mt-6 flex items-start gap-3 text-sm text-muted-foreground bg-muted/40 rounded-lg p-4">
                <ShieldCheck className="h-5 w-5 flex-shrink-0 mt-0.5 text-accent" />
                <p>
                    RentRail records this payment as your own proof of what you paid — but under Ugandan law, only
                    your landlord can issue a valid EFRIS tax receipt. After paying, we'll remind you to ask them for
                    it directly. Read{' '}
                    <Link href="/refund-policy" className="underline hover:text-accent">
                        our payment terms
                    </Link>
                    .
                </p>
            </div>
        </div>
    )
}
