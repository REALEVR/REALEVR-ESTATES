/**
 * Shared "Rewards" tab content — mounted identically in AgentDashboard.tsx
 * and UserDashboard.tsx ("share that across all dashboards"). Combines the
 * two independent earning mechanics:
 *   - Share points (server/gene/referral-rewards.ts): 100 shares to
 *     different WhatsApp numbers = 1,000 UGX.
 *   - Listing earnings (server/gene/listing-earnings.ts): agents earn a
 *     flat amount per property listed, claimable at 10,000 UGX. Normal
 *     users who haven't listed anything just see a zero balance here —
 *     harmless, and keeps one component instead of two per-role variants.
 */
import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Loader2, Gift, Building2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
    useRewardsBalance,
    useRequestPayout,
    useMyPayoutRequests,
    useListingEarningsBalance,
    useRequestListingPayout,
    useMyListingPayoutRequests,
} from '@/hooks/useRewards'

function PayoutForm({
    onSubmit,
    isPending,
}: {
    onSubmit: (input: { mobileMoneyNumber: string; provider: string }) => void
    isPending: boolean
}) {
    const [mobileMoneyNumber, setMobileMoneyNumber] = useState('')
    const [provider, setProvider] = useState('MTN')

    return (
        <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-end">
            <div className="flex-1 w-full">
                <Label className="text-xs">Mobile money number</Label>
                <Input value={mobileMoneyNumber} onChange={(e) => setMobileMoneyNumber(e.target.value)} placeholder="0772123456" />
            </div>
            <div className="w-full sm:w-32">
                <Label className="text-xs">Provider</Label>
                <Input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="MTN / Airtel" />
            </div>
            <Button
                disabled={isPending || !mobileMoneyNumber || !provider}
                onClick={() => onSubmit({ mobileMoneyNumber, provider })}
            >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Claim payout'}
            </Button>
        </div>
    )
}

function SharePointsCard() {
    const { toast } = useToast()
    const balanceQuery = useRewardsBalance(true)
    const payoutsQuery = useMyPayoutRequests(true)
    const requestPayout = useRequestPayout()
    const balance = balanceQuery.data

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Gift className="h-5 w-5 text-primary" /> Share Points
                </CardTitle>
                <CardDescription>
                    Share properties to 100 different WhatsApp numbers to claim 1,000 UGX.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {balanceQuery.isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : balance ? (
                    <>
                        <div className="grid grid-cols-3 gap-3 text-center">
                            <div className="p-3 border rounded-lg">
                                <p className="text-xl font-bold">{balance.uniqueWhatsappRecipients}</p>
                                <p className="text-xs text-muted-foreground">of {balance.minPayoutPoints} numbers</p>
                            </div>
                            <div className="p-3 border rounded-lg">
                                <p className="text-xl font-bold">{balance.availablePoints}</p>
                                <p className="text-xs text-muted-foreground">points available</p>
                            </div>
                            <div className="p-3 border rounded-lg">
                                <p className="text-xl font-bold">{balance.availableUgx.toLocaleString()}</p>
                                <p className="text-xs text-muted-foreground">UGX available</p>
                            </div>
                        </div>
                        <Progress value={Math.min(100, (balance.uniqueWhatsappRecipients / balance.minPayoutPoints) * 100)} />

                        {balance.canRequestPayout ? (
                            <PayoutForm
                                isPending={requestPayout.isPending}
                                onSubmit={(input) =>
                                    requestPayout.mutate(input, {
                                        onSuccess: () =>
                                            toast({ title: 'Payout requested', description: 'An admin will review and process it shortly.' }),
                                        onError: () => toast({ title: 'Failed to request payout', variant: 'destructive' }),
                                    })
                                }
                            />
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                Keep sharing — you need {balance.minPayoutPoints - balance.uniqueWhatsappRecipients} more distinct
                                numbers to unlock your payout.
                            </p>
                        )}
                    </>
                ) : null}

                {payoutsQuery.data && payoutsQuery.data.length > 0 && (
                    <div className="pt-2 border-t space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Your requests</p>
                        {payoutsQuery.data.map((r) => (
                            <div key={r.id} className="flex items-center justify-between text-sm">
                                <span>{r.ugxAmount.toLocaleString()} UGX</span>
                                <Badge variant="outline">{r.status.replace(/_/g, ' ')}</Badge>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

function ListingEarningsCard() {
    const { toast } = useToast()
    const balanceQuery = useListingEarningsBalance(true)
    const payoutsQuery = useMyListingPayoutRequests(true)
    const requestPayout = useRequestListingPayout()
    const balance = balanceQuery.data

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" /> Listing Earnings
                </CardTitle>
                <CardDescription>Earn money for every property you list. Claim once you reach 10,000 UGX.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {balanceQuery.isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : balance ? (
                    <>
                        <div className="grid grid-cols-2 gap-3 text-center">
                            <div className="p-3 border rounded-lg">
                                <p className="text-xl font-bold">{balance.totalListings}</p>
                                <p className="text-xs text-muted-foreground">properties listed</p>
                            </div>
                            <div className="p-3 border rounded-lg">
                                <p className="text-xl font-bold">{balance.availableUgx.toLocaleString()}</p>
                                <p className="text-xs text-muted-foreground">UGX available</p>
                            </div>
                        </div>
                        <Progress value={Math.min(100, (balance.availableUgx / balance.minPayoutUgx) * 100)} />

                        {balance.canRequestPayout ? (
                            <PayoutForm
                                isPending={requestPayout.isPending}
                                onSubmit={(input) =>
                                    requestPayout.mutate(input, {
                                        onSuccess: () =>
                                            toast({ title: 'Payout requested', description: 'An admin will review and process it shortly.' }),
                                        onError: () => toast({ title: 'Failed to request payout', variant: 'destructive' }),
                                    })
                                }
                            />
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                {(balance.minPayoutUgx - balance.availableUgx).toLocaleString()} UGX to go until you can claim.
                            </p>
                        )}
                    </>
                ) : null}

                {payoutsQuery.data && payoutsQuery.data.length > 0 && (
                    <div className="pt-2 border-t space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Your requests</p>
                        {payoutsQuery.data.map((r) => (
                            <div key={r.id} className="flex items-center justify-between text-sm">
                                <span>{r.ugxAmount.toLocaleString()} UGX</span>
                                <Badge variant="outline">{r.status.replace(/_/g, ' ')}</Badge>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

export default function RewardsPanel() {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SharePointsCard />
            <ListingEarningsCard />
        </div>
    )
}
