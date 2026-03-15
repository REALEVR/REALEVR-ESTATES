import React, { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { intiateGateWay, paymentEmitter, sendPaymentRequest } from '@/lib/iotec-paymentpatch'
import { toast } from '@/hooks/use-toast'
import { eventBus } from '@/lib/eventBus'

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
    const handlePayNow = async () => {
        /**
         * Process Payments with IOTEC
         */

        sendPaymentRequest().then((data) => {
            if (!data.error) {
                intiateGateWay(data.accessToken, '15000')
            } else {
                toast({
                    title: 'Payment Error',
                    description: data.errorMessage,
                    variant: 'destructive',
                })
            }
        })
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

        paymentEmitter.on('COMPLETED-PAYMENT', handler)
        return () => {
            paymentEmitter.off('COMPLETED-PAYMENT', handler)
        }
    }, [])

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
                        <Button onClick={handlePayNow} className="bg-[#FF5A5F]">
                            Pay
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
