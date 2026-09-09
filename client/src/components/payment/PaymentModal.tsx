import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { Loader2, CreditCard, CheckCircle2 } from 'lucide-react'
import { FlutterWaveButton } from 'flutterwave-react-v3'



import {
    intiateGateWay,
    makePaymentString,
    paymentEmitter,
    PaymentSources,
    sendPaymentRequest,
} from '@/lib/iotec-paymentpatch'
import { eventBus } from '@/lib/eventBus'
import { recordTourPayment } from '@/lib/iotect-verify-pay'

type PaymentType = 'PropertyDeposit' | 'ViewingFee' | 'Subscription' | 'BnBBookingDeposit'

interface PaymentModalProps {
    isOpen: boolean

    onClose: () => void
    propertyId?: number
    propertyTitle?: string
    paymentType: PaymentType
    
    amount: number
    currency?: string
    successCallback?: (response: any) => void
}

export default function PaymentModal({
    isOpen,
    onClose,
    propertyId,
    propertyTitle,
    paymentType,
    amount,
    currency = 'UGX',
    successCallback,
}: PaymentModalProps) {
    const { toast } = useToast()
    const [isLoading, setIsLoading] = useState(false)
    const [isSuccess, setIsSuccess] = useState(false)

    const _paymentSource = PaymentSources.paymentModelClient
    const _eventPaymentString = makePaymentString(_paymentSource)

    // Get the Flutterwave public key from environment variables

    // Generate a random transaction reference for tracking

    const handlePaymentSuccess = async (response: any) => {
        if (response.status === 'successful') {
            setIsLoading(true)

            try {
                // In a production app, you would verify this payment with your backend
                // But for now, we'll just simulate a successful payment verification
                await new Promise((resolve) => setTimeout(resolve, 1000))

                setIsSuccess(true)

                if (successCallback) {
                    await successCallback(response)
                } else {
                    toast({
                        title: 'Payment Successful',
                        description: `Your payment of ${amount.toLocaleString()} ${currency} has been processed successfully.`,
                        duration: 5000,
                    })
                }
            } catch (error) {
                toast({
                    title: 'Payment Verification Failed',
                    description: 'There was an error verifying your payment. Please contact support.',
                    variant: 'destructive',
                })
            } finally {
                setIsLoading(false)
            }
        } else {
            toast({
                title: 'Payment Failed',
                description: 'Your payment could not be processed. Please try again.',
                variant: 'destructive',
            })
        }
    }

    const handlePaymentClose = () => {
        toast({
            title: 'Payment Cancelled',
            description: 'You have cancelled the payment process.',
            variant: 'destructive',
        })
    }

    // Fallback payment method when Flutterwave isn't available
    const handlePayNow = async () => {
        if (isLoading) return // ← guard against double clicks
        setIsLoading(true)
        try {
            const data = await sendPaymentRequest()
            if (!data.error) {
            onClose()
                intiateGateWay(data.accessToken, `${amount}`, _paymentSource)
            } else {
                toast({
                    title: 'Payment Error',
                    description: data.errorMessage,
                    variant: 'destructive',
                })
            }
        } finally {
            setIsLoading(false) // ← always clear loading
        }
    }
    useEffect(() => {
        const handler = (data: { transactionID: string }) => {
            recordTourPayment({
                propertyId: `${propertyId}`,
                amount: amount,
                currency: 'UGX',
                transactionId: data.transactionID!,
            })
            handlePaymentSuccess('successful')
        }
        paymentEmitter.on(_eventPaymentString, handler)
        return () => {
            paymentEmitter.off(_eventPaymentString, handler)
        }
    }, [_eventPaymentString, propertyId, amount]) // ← add deps

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="text-xl">
                        {isSuccess ? 'Payment Successful' : 'Complete Payment'}
                    </DialogTitle>
                    <DialogDescription>
                        {isSuccess
                            ? 'Your payment has been processed successfully.'
                            : paymentType === 'BnBBookingDeposit'
                            ? `Pay a 20% deposit (${amount.toLocaleString()} ${currency}) to secure your booking. This deposit is non-refundable.`
                            : paymentType === 'ViewingFee'
                            ? `Pay the standard viewing fee of ${amount.toLocaleString()} ${currency}.`
                            : `Complete your payment of ${amount.toLocaleString()} ${currency}.`}
                    </DialogDescription>
                </DialogHeader>

                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-8">
                        <Loader2 className="h-10 w-10 text-accent animate-spin mb-4" />
                        <p className="text-center text-gray-500">
                            Processing your payment...
                            <br />
                            Please do not close this window.
                        </p>
                    </div>
                ) : isSuccess ? (
                    // The single highest-value, highest-emotion moment in the app — a
                    // completed payment — used to just teleport in as a static icon.
                    // A brief scale+fade entrance (repo's own Reveal.tsx ease, reused
                    // here for cohesion rather than inventing a new curve; timing sits
                    // in AUDIT.md's 200-500ms modal-content budget) confirms the
                    // payment landed, which matters here beyond polish: an ambiguous
                    // success state is exactly what makes people second-guess whether
                    // it worked and re-attempt a payment that already went through.
                    // Governed by the app-wide MotionConfig reducedMotion="user" in
                    // App.tsx — no separate reduced-motion handling needed.
                    <motion.div
                        className="flex flex-col items-center justify-center py-8"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ duration: 0.4, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                        >
                            <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
                        </motion.div>
                        <p className="text-center text-gray-700 font-medium mb-2">Thank you for your payment!</p>
                        <p className="text-center text-gray-500 max-w-sm">
                            {paymentType === 'BnBBookingDeposit'
                                ? 'Owner contact details are now available. You can contact them directly to arrange your stay.'
                                : paymentType === 'ViewingFee'
                                ? 'You can now view up to 10 properties for the next 24 hours.'
                                : 'Your payment has been processed successfully.'}
                        </p>
                    </motion.div>
                ) : (
                    <div className="space-y-6 py-4">
                        <div className="bg-gray-50 rounded-lg p-4 text-center">
                            <p className="text-2xl font-bold">
                                {amount.toLocaleString()} {currency}
                            </p>
                            <p className="text-gray-500 text-sm">
                                {paymentType === 'BnBBookingDeposit'
                                    ? '20% Booking Deposit'
                                    : paymentType === 'ViewingFee'
                                    ? 'Property Viewing Fee (24 hours)'
                                    : 'Total Amount'}
                            </p>
                        </div>

                        <div className="flex flex-col space-y-4">
                            <div className="flex items-center justify-center">
                                {
                                    <Button
                                        onClick={handlePayNow}
                                        className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
                                    >
                                        <CreditCard className="mr-2 h-5 w-5" />
                                        Pay {amount.toLocaleString()} UGX Now
                                    </Button>
                                }
                            </div>

                            <p className="text-center text-gray-500 text-xs">
                                By clicking "Pay Now", you agree to our terms of service and payment policies.
                            </p>
                        </div>
                    </div>
                )}

                <DialogFooter>
                    {isSuccess ? (
                        <Button onClick={onClose} className="w-full">
                            Close
                        </Button>
                    ) : (
                        <Button onClick={onClose} variant="outline" className="w-full">
                            Cancel
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
