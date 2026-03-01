import React, { useEffect, useState } from 'react'
import { Phone, ArrowRight, ShieldCheck, Info, Loader2, CheckCircle2, XCircle, X } from 'lucide-react'
import { eventBus } from '@/lib/eventBus'
import { toast } from '@/hooks/use-toast'
import { paymentEmitter } from '@/lib/iotec-paymentpatch'

interface IoTecGatewayProps {
    accessToken: string
    amount: string
    onClose: () => void // add this
}

export function IoTecGatewayLight({ accessToken, amount, onClose }: IoTecGatewayProps) {
    const [transactionID, setTransactionID] = useState()
    const [phoneNumber, setPhoneNumber] = useState('')
    const [loading, setLoading] = useState(false)
    const [step, setStep] = useState<'input' | 'pending'>('input')
    const [error, setError] = useState<string | null>(null)
    const [didGetEndResult, setGotEndResult] = useState(false)

    /**
     * For the redirectURL
     */
    const searchParams = new URLSearchParams(window.location.search)
    const redirectUrl = searchParams.get('redirect')

    /**
     * Close the gateway
     */
    const handleClose = () => {
        // Leave this empty as requested
        /**
         * Lets go back to the homepage
         */
        onClose()
    }

    const finishPayment = () => {
        if (didGetEndResult) {
            /**
             * Here we assume the user actually entered the required options
             */

            /**
             * Since the user is completing
             * payment we actually save and send the transactionID for record keeping
             */
            

            paymentEmitter.emit('COMPLETED-PAYMENT', {
                transactionID: transactionID,
            })
        }
    }

    const collectPayment = async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await fetch('/api/payment/iotec/collect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    access_token: accessToken,
                    payer: phoneNumber,
                    payerNote: 'Payment for Invoice',
                    amount: parseInt(amount),
                    currency: 'UGX',
                }),
            })

            const data = await res.json()

            //when the data returns what we do we actually store the transactionID:

            if (data && data.id) {
                setTransactionID(data.id)
            } else {
                console.error('No Transaction ID found in the Payment Process')
            }

            if (res.ok) {
                setStep('pending')
                setGotEndResult(true)
            } else {
                setError(data.message || 'Transaction failed. Please try again.')
            }
        } catch (err) {
            setError('Network error: Could not connect to payment server.')
        } finally {
            setLoading(false)
        }
    }

    const getCarrier = (num: string) => {
        if (num.startsWith('077') || num.startsWith('078') || num.startsWith('076') || num.startsWith('074'))
            return 'MTN'
        if (num.startsWith('075') || num.startsWith('070')) return 'Airtel'
        return null
    }

    const carrier = getCarrier(phoneNumber)

    useEffect(() => {
        const off = eventBus.on('PAYMENT_MODEL', (data) => {
            if (data.status == 'RESPONDED-BACK') {
                console.log('Payment Officially Complete')
            }
        })

        return off
    }, [])

    return (
        <div className="fixed z-50 top-0 h-full w-full left-0 bg-gray-100/80 backdrop-blur-sm text-gray-900 flex items-center justify-center p-4 font-sans">
            <div className="relative max-w-4xl w-full grid grid-cols-1 md:grid-cols-12 gap-8 bg-white rounded-3xl p-8 border border-gray-200 shadow-2xl">
                {/* Top Close Button */}
                <button
                    onClick={handleClose}
                    className="absolute top-6 right-6 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                >
                    <X className="h-6 w-6" />
                </button>

                {/* Left Column */}
                <div className="md:col-span-7 space-y-8">
                    <header className="space-y-2">
                        <div className="flex items-center gap-2 font-bold text-xl mb-4">
                            <span className="bg-black text-white px-2 py-1 rounded text-sm">REALEVR-ESTATES</span>
                        </div>
                        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
                            {step === 'input' ? 'Complete Payment' : 'Authorize Payment'}
                        </h1>
                        <p className="text-gray-500">
                            {step === 'input'
                                ? 'Enter your Mobile Money number to initiate the payment.'
                                : 'Finalize the transaction on your mobile device.'}
                        </p>
                    </header>

                    {error && (
                        <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex items-center gap-3">
                            <XCircle className="h-5 w-5 text-red-600 shrink-0" />
                            <p className="text-sm text-red-700 font-medium">{error}</p>
                        </div>
                    )}

                    {step === 'input' ? (
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-gray-700">Phone Number</label>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <Phone className="h-5 w-5 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                                    </div>
                                    <input
                                        type="tel"
                                        placeholder="07XX XXX XXX"
                                        value={phoneNumber}
                                        onChange={(e) => {
                                            setPhoneNumber(e.target.value)
                                            if (error) setError(null)
                                        }}
                                        className="block w-full pl-11 pr-16 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-600 focus:bg-white outline-none transition-all text-lg"
                                    />
                                    {carrier && (
                                        <div className="absolute inset-y-0 right-4 flex items-center">
                                            <span
                                                className={`text-[10px] font-bold px-2 py-1 rounded-md ${
                                                    carrier === 'MTN'
                                                        ? 'bg-yellow-400 text-black'
                                                        : 'bg-red-600 text-white'
                                                }`}
                                            >
                                                {carrier}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3">
                                <Info className="h-5 w-5 text-blue-600 shrink-0" />
                                <p className="text-sm text-blue-800">
                                    A USSD prompt will be sent to <strong>{phoneNumber || 'your phone'}</strong> to
                                    authorize <strong>UGX {Number(amount).toLocaleString()}</strong>.
                                </p>
                            </div>

                            <button
                                onClick={collectPayment}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-lg shadow-blue-200"
                                disabled={phoneNumber.length < 10 || loading}
                            >
                                {loading ? <Loader2 className="animate-spin h-5 w-5" /> : 'Pay Now'}
                                {!loading && <ArrowRight className="h-5 w-5" />}
                            </button>
                        </div>
                    ) : (
                        /* PENDING SCREEN */
                        <div className="space-y-6 animate-in zoom-in-95 duration-300">
                            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 space-y-4">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-xs text-gray-500 uppercase tracking-wider font-bold">
                                            Payee Name
                                        </p>
                                        <p className="text-lg font-bold text-gray-900">ioTec Services Ltd</p>
                                    </div>
                                    <span className="px-3 py-1 bg-yellow-100 text-yellow-700 border border-yellow-200 rounded-full text-xs font-bold animate-pulse">
                                        Pending
                                    </span>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 uppercase tracking-wider font-bold">
                                        Amount to Pay
                                    </p>
                                    <p className="text-3xl font-bold text-gray-900 font-mono">
                                        UGX {Number(amount).toLocaleString()}
                                    </p>
                                </div>
                            </div>

                            <div className="text-center space-y-2">
                                <p className="text-blue-600 font-bold">Complete payment on phone</p>
                                <p className="text-sm text-gray-500 font-medium">
                                    Check your phone for the PIN prompt to authorize.
                                </p>
                            </div>

                            <div className="space-y-3">
                                <button
                                    onClick={finishPayment}
                                    className="w-full bg-gray-900 text-white hover:bg-black font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg"
                                >
                                    <CheckCircle2 className="h-5 w-5" />
                                    Confirm Payment
                                </button>

                                {/* New Option to Close once complete */}
                                <button
                                    onClick={handleClose}
                                    className="w-full bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 font-semibold py-3 rounded-2xl transition-all"
                                >
                                    Return to Merchant
                                </button>
                            </div>
                        </div>
                    )}

                    <footer className="flex items-center justify-center gap-4 text-gray-400 text-xs pt-4 border-t border-gray-100">
                        <div className="flex items-center gap-1 font-medium text-gray-400">
                            <ShieldCheck className="h-4 w-4" /> Secure by ioTec
                        </div>
                        <span>•</span>
                        <p className="font-medium">PCI-DSS Compliant</p>
                    </footer>
                </div>

                {/* Right Column: Order Summary */}
                <div className="md:col-span-5 bg-gray-50 rounded-2xl p-6 flex flex-col justify-between border border-gray-200">
                    <div className="space-y-6">
                        <h2 className="text-lg font-bold text-gray-800 border-b border-gray-200 pb-4">
                            Payment Details
                        </h2>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-500 font-medium">Transaction Token</span>
                                <span className="font-mono text-[10px] text-gray-400 truncate ml-4 max-w-[100px]">
                                    {accessToken}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-500 font-medium">Status</span>
                                <span
                                    className={`font-bold text-sm uppercase ${
                                        step === 'pending' ? 'text-yellow-600' : 'text-blue-600'
                                    }`}
                                >
                                    {step === 'pending' ? 'Awaiting Auth' : 'Initialized'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="mt-8 pt-6 border-t border-gray-200 space-y-4">
                        <div className="flex justify-between items-end">
                            <span className="text-gray-500 font-bold text-sm">Total Due</span>
                            <div className="text-right">
                                <p className="text-3xl font-black text-gray-900 leading-none tracking-tight">
                                    UGX {Number(amount).toLocaleString()}
                                </p>
                                <p className="text-[10px] text-gray-400 mt-1 font-bold uppercase tracking-widest">
                                    Local Currency
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default IoTecGatewayLight
