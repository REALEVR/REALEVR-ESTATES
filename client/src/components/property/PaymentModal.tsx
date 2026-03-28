import React, { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
    intiateGateWay,
    makePaymentString,
    paymentEmitter,
    PaymentSources,
    sendPaymentRequest,
} from '@/lib/iotec-paymentpatch'
import { toast } from '@/hooks/use-toast'
import { eventBus } from '@/lib/eventBus'
import { recordTourPayment } from '@/lib/iotect-verify-pay'

interface PaymentModalProps {
    isOpen: boolean
    onClose: () => void
    propertyId: number
    propertyTitle: string
    paymentType: string
    amount: number
    successCallback: (response: any) => void
}

export default function PaymentModal({ isOpen, onClose, successCallback, propertyId }: PaymentModalProps) {
    const _paymentSource = PaymentSources.paymentModelProperty
    const _eventPaymentString = makePaymentString(_paymentSource)

    const [isLoading, setIsLoading] = React.useState(false)

    const handlePayNow = async () => {
        if (isLoading) return
        setIsLoading(true)
        try {
            const data = await sendPaymentRequest()
            if (!data.error) {
                onClose()
                intiateGateWay(data.accessToken, '15000', _paymentSource)
            } else {
                toast({
                    title: 'Payment Error',
                    description: data.errorMessage,
                    variant: 'destructive',
                })
            }
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        const handler = (data: { transactionID: string }) => {
            recordTourPayment({
                propertyId: `${propertyId}`,
                amount: 15000,
                currency: 'UGX',
                transactionId: data.transactionID!,
            })
            successCallback('Payment Successfull')
        }
        paymentEmitter.on(_eventPaymentString, handler)
        return () => {
            paymentEmitter.off(_eventPaymentString, handler)
        }
    }, [_eventPaymentString, propertyId, successCallback]) // ← add deps

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Unlock Premium Properties</DialogTitle>
                    <DialogDescription>
                        Pay UGX 15,000 to view up to 5 rental properties. This is a one-time payment valid for 24 hours.
                    </DialogDescription>
                </DialogHeader>
                <div className="mt-6 space-y-4">
                    <div className="text-center">
                        <span className="text-2xl font-bold">UGX 15,000</span>
                        <span className="text-gray-500 ml-2">/ 24 hours</span>
                    </div>
                    <div className="flex justify-end space-x-3">
                        <Button variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button onClick={handlePayNow} disabled={isLoading} className="bg-[#FF5A5F]">
                            {isLoading ? 'Processing...' : 'Pay'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
