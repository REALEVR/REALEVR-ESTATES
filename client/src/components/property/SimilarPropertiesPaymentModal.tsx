import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
    intiateGateWay,
    makePaymentString,
    paymentEmitter,
    PaymentSources,
    sendPaymentRequest,
} from '@/lib/iotec-paymentpatch'
import { apiRequest } from '@/lib/queryClient'
import { toast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth'
import { useLocation } from 'wouter'
import { useInvalidateSimilarPropertiesPass } from '@/hooks/useSimilarPropertiesPass'
import { SIMILAR_PROPERTIES_PASS_PRICE_UGX } from '@shared/pricing'

interface SimilarPropertiesPaymentModalProps {
    isOpen: boolean
    onClose: () => void
    propertyId: number
    onUnlocked: () => void
}

/**
 * "Pay 20,000 [UGX] to view similar properties in your budget" — modeled on
 * PaymentModal.tsx's IoTec flow, but (unlike that component) actually
 * passes its real amount through to intiateGateWay() instead of a hardcoded
 * '15000', and confirms against similar-properties-pass.ts's own endpoint
 * rather than the generic tour-payment one, since this unlocks a different
 * thing (see that file's doc comment).
 */
export default function SimilarPropertiesPaymentModal({
    isOpen,
    onClose,
    propertyId,
    onUnlocked,
}: SimilarPropertiesPaymentModalProps) {
    const { user } = useAuth()
    const [, setLocation] = useLocation()
    const invalidatePassStatus = useInvalidateSimilarPropertiesPass()
    const [isLoading, setIsLoading] = useState(false)

    const _paymentSource = PaymentSources.paymentSimilarProperties
    const _eventPaymentString = makePaymentString(_paymentSource)

    const handlePayNow = async () => {
        if (!user) {
            onClose()
            setLocation('/auth')
            return
        }
        if (isLoading) return
        setIsLoading(true)
        try {
            const data = await sendPaymentRequest()
            if (!data.error) {
                onClose()
                intiateGateWay(data.accessToken, String(SIMILAR_PROPERTIES_PASS_PRICE_UGX), _paymentSource)
            } else {
                toast({ title: 'Payment Error', description: data.errorMessage, variant: 'destructive' })
            }
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        const handler = async (data: { transactionID: string }) => {
            try {
                await apiRequest('POST', '/api/gene/similar-properties/confirm', {
                    propertyId,
                    transactionId: data.transactionID,
                    amount: SIMILAR_PROPERTIES_PASS_PRICE_UGX,
                    currency: 'UGX',
                })
                invalidatePassStatus()
                toast({ title: 'Unlocked!', description: 'Similar properties in your budget are ready below.' })
                onUnlocked()
            } catch (err: any) {
                toast({ title: "Payment succeeded but unlock failed", description: err?.message, variant: 'destructive' })
            }
        }
        paymentEmitter.on(_eventPaymentString, handler)
        return () => {
            paymentEmitter.off(_eventPaymentString, handler)
        }
    }, [_eventPaymentString, propertyId, invalidatePassStatus, onUnlocked])

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Unlock Similar Properties</DialogTitle>
                    <DialogDescription>
                        Pay UGX {SIMILAR_PROPERTIES_PASS_PRICE_UGX.toLocaleString()} to see other properties like this one,
                        within your budget. Valid for 24 hours.
                    </DialogDescription>
                </DialogHeader>
                <div className="mt-6 space-y-4">
                    <div className="text-center">
                        <span className="text-2xl font-bold">UGX {SIMILAR_PROPERTIES_PASS_PRICE_UGX.toLocaleString()}</span>
                        <span className="text-gray-500 ml-2">/ 24 hours</span>
                    </div>
                    <div className="flex justify-end space-x-3">
                        <Button variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button onClick={handlePayNow} disabled={isLoading} className="bg-accent">
                            {isLoading ? 'Processing...' : 'Pay'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
