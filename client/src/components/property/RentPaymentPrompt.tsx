import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Loader2, Phone, Wallet } from 'lucide-react'
import type { Property } from '@shared/schema'
import { useToast } from '@/hooks/use-toast'

interface RentPaymentPromptProps {
  property: Property
}

interface RevealedContact {
  uploaderName: string | null
  landlordName: string | null
  landlordPhone: string | null
}

/**
 * "Do you want to pay rent for this property using RentRail?" - shown on a
 * rental unit's page once the viewer has already paid to view it
 * (requiresTourPayment/hasValidPayment in PropertyDetails.tsx). That pay-
 * to-view gate is a SEPARATE thing from this: it unlocks the listing's own
 * details, not the landlord/manager's contact. This is the second,
 * distinct gate - the landlord/manager number is only ever revealed once a
 * viewer says yes here, via POST /api/properties/:id/rent-payment-intent,
 * which also fans a notification out to the agent, every admin, and the
 * landlord/manager themselves (see that route's own doc comment in
 * server/routes.ts) so everyone with a stake in this specific rent payment
 * knows it might be coming.
 */
export default function RentPaymentPrompt({ property }: RentPaymentPromptProps) {
  const { toast } = useToast()
  const [stage, setStage] = useState<'ask' | 'loading' | 'revealed' | 'declined'>('ask')
  const [reveal, setReveal] = useState<RevealedContact | null>(null)

  const handleYes = async () => {
    setStage('loading')
    try {
      const res = await fetch(`/api/properties/${property.id}/rent-payment-intent`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Failed to record your rent payment intent')
      setReveal({
        uploaderName: data.uploaderName ?? null,
        landlordName: data.landlordName ?? null,
        landlordPhone: data.landlordPhone ?? null,
      })
      setStage('revealed')
    } catch (err: any) {
      toast({ title: 'Something went wrong', description: err?.message, variant: 'destructive' })
      setStage('ask')
    }
  }

  if (stage === 'declined') return null

  if (stage === 'revealed' && reveal) {
    return (
      <Card className="border-accent/40 bg-accent/5">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-accent" />
            <h4 className="font-semibold">Pay rent for this property</h4>
          </div>
          <div className="text-sm space-y-1 text-muted-foreground">
            {reveal.uploaderName && (
              <p>
                <span className="font-medium text-foreground">Listed by:</span> {reveal.uploaderName}
              </p>
            )}
            {reveal.landlordName && (
              <p>
                <span className="font-medium text-foreground">Pay to (landlord/manager):</span> {reveal.landlordName}
              </p>
            )}
            {reveal.landlordPhone ? (
              <p className="flex items-center gap-1.5 font-medium text-foreground">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" /> {reveal.landlordPhone}
              </p>
            ) : (
              <p className="italic">
                No landlord/manager number was provided for this listing yet — contact the agent directly to arrange payment.
              </p>
            )}
          </div>
          <div className="text-xs text-muted-foreground border-t border-border pt-3 space-y-1">
            <p className="font-medium text-foreground">How to pay with RentRail:</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>Go to RentRail and enter the landlord/manager's mobile money number above.</li>
              <li>Enter the rent amount and complete the mobile money payment.</li>
              <li>Your receipt is saved to your RentRail history automatically.</li>
            </ol>
          </div>
          <Button asChild size="sm" className="w-full">
            <a href="/rentrail">Go to RentRail to pay</a>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Alert className="border-accent/40 bg-accent/5">
      <Wallet className="h-4 w-4 text-accent" />
      <AlertTitle>Do you want to pay rent for this property using RentRail?</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>Say yes and we'll show you exactly who to pay and how, right here.</p>
        <div className="flex gap-2">
          <Button size="sm" onClick={handleYes} disabled={stage === 'loading'}>
            {stage === 'loading' && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Yes, I want to pay rent
          </Button>
          <Button size="sm" variant="outline" onClick={() => setStage('declined')}>
            Not now
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}
