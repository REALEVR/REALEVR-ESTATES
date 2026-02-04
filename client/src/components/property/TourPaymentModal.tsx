import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth'
import { useFlutterwave, FlutterWaveTypes } from 'flutterwave-react-v3'
import { Loader2, Eye, CreditCard, UserPlus } from 'lucide-react'
import type { Property } from '@shared/schema'
import Logo from '../../assets/logo.png'
import { generatePaymentLink, navigateUserToPaymentTile, sendPaymentRequest } from '@/lib/iotec-paymentpatch'

const tourPaymentSchema = z.object({
    email: z.string().email('Invalid email address'),
    fullName: z.string().min(2, 'Full name must be at least 2 characters'),
    phoneNumber: z.string().min(10, 'Phone number must be at least 10 characters'),
})

type TourPaymentFormValues = z.infer<typeof tourPaymentSchema>

interface TourPaymentModalProps {
    isOpen: boolean
    onClose: () => void
    property: Property
    onPaymentSuccess: () => void
}

export default function TourPaymentModal({ isOpen, onClose, property, onPaymentSuccess }: TourPaymentModalProps) {
    const { toast } = useToast()
    const { user, loginMutation } = useAuth()
    const [isProcessing, setIsProcessing] = useState(false)
    const [showLoginForm, setShowLoginForm] = useState(false)

    /**
     * This is the for viewing the tour
     */

    const form = useForm<TourPaymentFormValues>({
        resolver: zodResolver(tourPaymentSchema),
        defaultValues: {
            email: '',
            fullName: '',
            phoneNumber: '',
        },
    })

    // Flutterwave configuration
    const publicKey = import.meta.env.VITE_FLUTTERWAVE_PUBLIC_KEY
    // console.log('Flutterwave Public Key:', publicKey); // Debug log

 

    const handlePayForTour = async (data: TourPaymentFormValues) => {
        console.log('Processing payment for tour access...', data)
        setIsProcessing(true)

        /**
         * Process Payments with IOTEC
         */


        sendPaymentRequest().then((data) => {
            if (!data.error) {
                let _generatePaymentLink = generatePaymentLink(data.accessToken, '15000')
                navigateUserToPaymentTile(_generatePaymentLink)
            } else {
                toast({
                    title: 'jkPayment Error',
                    description: `data.errorMessage`,
                    variant: 'destructive',
                })
            }
        })
    }

    const handleExistingUserPayment = () => {
        setIsProcessing(true)
       
        

        sendPaymentRequest().then((data) => {
            if (!data.error) {
                let _generatePaymentLink = generatePaymentLink(data.accessToken, '15000')
                navigateUserToPaymentTile(_generatePaymentLink)
            } else {
                toast({
                    title: 'Payment Error',
                    description: `ssssssss`,
                    variant: 'destructive',
                })
            }
        })
    }

    const handlePaymentClose = () => {
        setIsProcessing(false)
        onClose()
    }

    useEffect(()=>{

        const zoneless = ()=>{
            window.addEventListener("payment-finished",()=>{
               handlePaymentClose()
            })  
        }
        zoneless();
    },[setIsProcessing])

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Eye className="h-5 w-5" />
                        View Virtual Tour
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="p-4 bg-blue-50 rounded-lg">
                        <h4 className="font-semibold text-blue-900 mb-2">Tour Access Required</h4>
                        <p className="text-sm text-blue-800">
                            To view the virtual tour for this property, a one-time payment of{' '}
                            <strong>UGX 15,0000</strong> is required.
                        </p>
                    </div>

                    {user ? (
                        // User is logged in
                        <div className="space-y-4">
                            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                                <p className="text-sm text-green-800">
                                    Welcome back, <strong>{user.fullName}</strong>! You're logged in and ready to pay.
                                </p>
                            </div>

                            <Button onClick={handleExistingUserPayment} disabled={isProcessing} className="w-full">
                                {isProcessing ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Processing Payment...
                                    </>
                                ) : (
                                    <>
                                        <CreditCard className="mr-2 h-4 w-4" />
                                        Pay 15,000 UGX to View Tour
                                    </>
                                )}
                            </Button>
                        </div>
                    ) : (
                        // User is not logged in
                        <div className="space-y-4">
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => setShowLoginForm(false)}
                                    className={!showLoginForm ? 'bg-blue-50 border-blue-200' : ''}
                                >
                                    <UserPlus className="mr-2 h-4 w-4" />
                                    Create Account & Pay
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => setShowLoginForm(true)}
                                    className={showLoginForm ? 'bg-blue-50 border-blue-200' : ''}
                                >
                                    Login & Pay
                                </Button>
                            </div>

                            {!showLoginForm ? (
                                // Create account form
                                <Form {...form}>
                                    <form onSubmit={form.handleSubmit(handlePayForTour)} className="space-y-4">
                                        <FormField
                                            control={form.control}
                                            name="fullName"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Full Name *</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Enter your full name" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="email"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Email *</FormLabel>
                                                    <FormControl>
                                                        <Input type="email" placeholder="Enter your email" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="phoneNumber"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Phone Number *</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Enter your phone number" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <Button type="submit" disabled={isProcessing} className="w-full">
                                            {isProcessing ? (
                                                <>
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                    Processing Payment...
                                                </>
                                            ) : (
                                                <>
                                                    <CreditCard className="mr-2 h-4 w-4" />
                                                    Pay 15,000 UGX to View Tour
                                                </>
                                            )}
                                        </Button>
                                    </form>
                                </Form>
                            ) : (
                                // Login form
                                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                                    <p className="text-sm text-yellow-800">
                                        Please login to your existing account first, then you can proceed with the
                                        payment.
                                    </p>
                                    <Button
                                        variant="outline"
                                        onClick={() =>
                                            (window.location.href =
                                                '/auth')
                                        }
                                        className="mt-3 w-full"
                                    >
                                        Go to Login
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="text-center">
                        <Button variant="ghost" onClick={handlePaymentClose} className="text-gray-500">
                            Cancel
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
