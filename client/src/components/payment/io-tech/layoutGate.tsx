import React, { useEffect, useState, useRef } from 'react'
import { Phone, ArrowRight, ShieldCheck, Info, Loader2, XCircle, X, Wifi } from 'lucide-react'
import { getTransactionStatus, makePaymentString, paymentEmitter } from '@/lib/iotec-paymentpatch'
import { useToast } from '@/hooks/use-toast'
import { PaymentNotification } from './paymentNotification'

interface IoTecGatewayProps {
    accessToken: string
    amount: string
    source: string
    onClose: () => void
}

const TOKEN_LIFETIME_MS = 300_000  // 300 seconds
const POLL_INTERVAL_MS  = 6_000   // poll every 6 seconds

export function IoTecGatewayLight({ accessToken, amount, onClose, source }: IoTecGatewayProps) {
    const { toast } = useToast()

    const [transactionID, setTransactionID] = useState<string | null>(null)
    const [phoneNumber, setPhoneNumber]     = useState('')
    const [loading, setLoading]             = useState(false)
    const [step, setStep]                   = useState<'input' | 'pending'>('input')
    const [error, setError]                 = useState<string | null>(null)
    const [notification, setNotification]   = useState<'success' | 'failed' | null>(null)
    const [notificationMessage, setNotificationMessage] = useState('Transaction...')

    // Countdown display — seconds remaining out of 300
    const [secondsLeft, setSecondsLeft] = useState<number | null>(null)

    // Refs
    const hasCollected    = useRef(false)
    const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const expiryTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
    const countdownRef    = useRef<ReturnType<typeof setInterval> | null>(null)
    const transactionRef  = useRef<string | null>(null) // mirrors transactionID for use inside closures

    // ── Cleanup ────────────────────────────────────────────────────────────────

    const stopPolling = () => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
        if (expiryTimerRef.current)  clearTimeout(expiryTimerRef.current)
        if (countdownRef.current)    clearInterval(countdownRef.current)
        pollIntervalRef.current = null
        expiryTimerRef.current  = null
        countdownRef.current    = null
    }

    const handleClose = () => {
        stopPolling()
        hasCollected.current   = false
        transactionRef.current = null
        onClose()
    }

    // ── Polling ────────────────────────────────────────────────────────────────

    const startPolling = (txID: string) => {
        transactionRef.current = txID

        // Countdown display
        setSecondsLeft(Math.floor(TOKEN_LIFETIME_MS / 1000))
        countdownRef.current = setInterval(() => {
            setSecondsLeft(prev => (prev !== null && prev > 0 ? prev - 1 : 0))
        }, 1000)

        // Auto-close when access token expires
        expiryTimerRef.current = setTimeout(() => {
            stopPolling()
            onClose()
        }, TOKEN_LIFETIME_MS)

        // Status polling
        pollIntervalRef.current = setInterval(async () => {
            try {
                const status = await getTransactionStatus(accessToken, transactionRef.current!)

                switch (status) {
                    case 'Success':
                        stopPolling()
                        paymentEmitter.emit(makePaymentString(source), { transactionID: transactionRef.current })
                        setNotification('success')
                        break

                    case 'Failed':
                        stopPolling()
                        setNotificationMessage('Transaction Failed')
                        setNotification('failed')
                        break

                    case 'RolledBack':
                        stopPolling()
                        setNotificationMessage('Transaction Rolled Back')
                        setNotification('failed')
                        break

                    case 'Cancelled':
                        stopPolling()
                        setNotificationMessage('Transaction Cancelled')
                        setNotification('failed')
                        break

                    case 'Rejected':
                        stopPolling()
                        setNotificationMessage('Transaction Rejected')
                        setNotification('failed')
                        break

                    // Pending / SentToVendor / AwaitingApproval / Scheduled — keep polling
                    default:
                        break
                }
            } catch (err: any) {
                // Non-fatal: log and retry on next interval
                console.warn('Poll error:', err?.message)
            }
        }, POLL_INTERVAL_MS)
    }

    // ── Collect payment ────────────────────────────────────────────────────────

    const collectPayment = async () => {
        if (hasCollected.current || loading) return
        hasCollected.current = true
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

            if (!res.ok) {
                setError(data.message || 'Transaction failed. Please try again.')
                hasCollected.current = false
                return
            }

            const txID = data?.id
            if (txID) {
                setTransactionID(txID)
                setStep('pending')
                startPolling(txID)
            } else {
                console.warn('No Transaction ID returned from payment API')
                setError('No transaction ID returned. Please try again.')
                hasCollected.current = false
            }
        } catch {
            setError('Network error: Could not connect to payment server.')
            hasCollected.current = false
        } finally {
            setLoading(false)
        }
    }

    // ── Carrier detection ──────────────────────────────────────────────────────

    const getCarrier = (num: string) => {
        if (num.startsWith('077') || num.startsWith('078') || num.startsWith('076') || num.startsWith('074'))
            return 'MTN'
        if (num.startsWith('075') || num.startsWith('070')) return 'Airtel'
        return null
    }

    const carrier = getCarrier(phoneNumber)

    // ── Effects ────────────────────────────────────────────────────────────────

    useEffect(() => {
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = ''
            stopPolling()
        }
    }, [])

    // ── Countdown helpers ──────────────────────────────────────────────────────

    const formatCountdown = (secs: number) => {
        const m = Math.floor(secs / 60).toString().padStart(2, '0')
        const s = (secs % 60).toString().padStart(2, '0')
        return `${m}:${s}`
    }

    const countdownUrgent = secondsLeft !== null && secondsLeft < 60

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <>
            {notification && (
                <PaymentNotification
                    message={notificationMessage}
                    status={notification}
                    amount={amount}
                    onClose={() => {
                        setNotification(null)
                        onClose()
                    }}
                    onRetry={notification === 'failed' ? () => {} : undefined}
                />
            )}

            <div className="fixed inset-0 z-50 bg-gray-100/80 backdrop-blur-sm text-gray-900 flex items-center justify-center font-sans overflow-y-auto">
                <div className="relative w-full h-full md:h-auto md:max-w-4xl md:m-4 bg-white md:rounded-3xl border-0 md:border md:border-gray-200 md:shadow-2xl flex flex-col md:grid md:grid-cols-12 overflow-y-auto">

                    {/* Close Button */}
                    <button
                        onClick={handleClose}
                        className="absolute top-4 right-4 z-10 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X className="h-6 w-6" />
                    </button>

                    {/* Left Column */}
                    <div className="md:col-span-7 space-y-6 p-6 sm:p-8 flex-1">
                        <header className="space-y-2 pr-8">
                            <div className="flex items-center gap-2 font-bold text-xl mb-4">
                                <span className="bg-black text-white px-2 py-1 rounded text-sm">REALEVR-ESTATES</span>
                            </div>
                            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900">
                                {step === 'input' ? 'Complete Payment' : 'Authorize Payment'}
                            </h1>
                            <p className="text-gray-500 text-sm sm:text-base">
                                {step === 'input'
                                    ? 'Enter your Mobile Money number to initiate the payment.'
                                    : 'Check your phone and enter your PIN to authorize.'}
                            </p>
                        </header>

                        {error && (
                            <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex items-center gap-3">
                                <XCircle className="h-5 w-5 text-red-600 shrink-0" />
                                <p className="text-sm text-red-700 font-medium">{error}</p>
                            </div>
                        )}

                        {step === 'input' ? (
                            <div className="space-y-5">
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
                                                <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${
                                                    carrier === 'MTN' ? 'bg-yellow-400 text-black' : 'bg-red-600 text-white'
                                                }`}>
                                                    {carrier}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3">
                                    <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
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
                            <div className="space-y-5 animate-in zoom-in-95 duration-300">

                                {/* Transaction card */}
                                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 space-y-4">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="text-xs text-gray-500 uppercase tracking-wider font-bold">Payee Name</p>
                                            <p className="text-lg font-bold text-gray-900">ioTec Services Ltd</p>
                                        </div>
                                        {/* Live polling badge replaces the static "Pending" badge */}
                                        <span className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded-full text-xs font-bold">
                                            <Wifi className="h-3 w-3 animate-pulse" />
                                            Checking...
                                        </span>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500 uppercase tracking-wider font-bold">Amount to Pay</p>
                                        <p className="text-2xl sm:text-3xl font-bold text-gray-900 font-mono">
                                            UGX {Number(amount).toLocaleString()}
                                        </p>
                                    </div>
                                </div>

                                {/* Polling status indicator */}
                                <div className="flex flex-col items-center gap-2 py-2">
                                    <div className="flex items-center gap-2 text-gray-500 text-sm font-medium">
                                        <Loader2 className="animate-spin h-4 w-4 text-blue-500" />
                                        Waiting for your authorization…
                                    </div>
                                    <p className="text-xs text-gray-400 text-center">
                                        This will update automatically once you approve on your phone.
                                    </p>
                                </div>

                                {/* Token expiry countdown */}
                                {secondsLeft !== null && (
                                    <div className={`flex items-center justify-center gap-2 text-xs font-mono font-bold px-4 py-2 rounded-xl border ${
                                        countdownUrgent
                                            ? 'bg-red-50 border-red-200 text-red-600'
                                            : 'bg-gray-50 border-gray-200 text-gray-500'
                                    }`}>
                                        {countdownUrgent ? '⚠ Session expiring — ' : 'Session expires in '}
                                        <span>{formatCountdown(secondsLeft)}</span>
                                    </div>
                                )}

                                <button
                                    onClick={handleClose}
                                    className="w-full bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 font-semibold py-3 rounded-2xl transition-all"
                                >
                                    Return to Merchant
                                </button>
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

                    {/* Right Column */}
                    <div className="md:col-span-5 bg-gray-50 md:rounded-r-3xl p-6 sm:p-8 flex flex-col justify-between border-t md:border-t-0 md:border-l border-gray-200">
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
                                    <span className={`font-bold text-sm uppercase ${
                                        step === 'pending' ? 'text-yellow-600' : 'text-blue-600'
                                    }`}>
                                        {step === 'pending' ? 'Awaiting Auth' : 'Initialized'}
                                    </span>
                                </div>
                                {transactionID && (
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-500 font-medium">Transaction ID</span>
                                        <span className="font-mono text-[10px] text-gray-400 truncate ml-4 max-w-[120px]">
                                            {transactionID}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="mt-8 pt-6 border-t border-gray-200 space-y-4">
                            <div className="flex justify-between items-end">
                                <span className="text-gray-500 font-bold text-sm">Total Due</span>
                                <div className="text-right">
                                    <p className="text-2xl sm:text-3xl font-black text-gray-900 leading-none tracking-tight">
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
        </>
    )
}

export default IoTecGatewayLight