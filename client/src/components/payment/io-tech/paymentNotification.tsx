import { CheckCircle2, XCircle } from 'lucide-react'

interface PaymentNotificationProps {
    status: 'success' | 'failed'
    amount: string
    onClose: () => void
    onRetry?: () => void
}

export function PaymentNotification({ status, amount, onClose, onRetry }: PaymentNotificationProps) {
    const isSuccess = status === 'success'

    return (
        // Full-screen overlay — hard to miss, blocks everything behind it
        <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
            <div className="bg-white rounded-3xl border border-gray-100 shadow-2xl p-8 max-w-sm w-full text-center animate-in zoom-in-95 duration-200">
                {/* Icon */}
                <div
                    className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 ${
                        isSuccess ? 'bg-green-50' : 'bg-red-50'
                    }`}
                >
                    {isSuccess ? (
                        <CheckCircle2 className="h-8 w-8 text-green-700" />
                    ) : (
                        <XCircle className="h-8 w-8 text-red-700" />
                    )}
                </div>

                {/* Title */}
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                    {isSuccess ? 'Payment confirmed' : 'Payment not confirmed'}
                </h2>

                {/* Message */}
                <p className="text-sm text-gray-500 leading-relaxed mb-5">
                    {isSuccess ? (
                        <>
                            Your payment of{' '}
                            <strong className="text-gray-800">UGX {Number(amount).toLocaleString()}</strong> was
                            received. If your phone prompts again, you can safely ignore it.
                        </>
                    ) : (
                        <>
                            We could not verify your payment. If you were charged, please contact support with your
                            transaction details.
                        </>
                    )}
                </p>

                {/* Prompt warning banner */}
                <div className={`rounded-xl px-4 py-3 mb-6 ${isSuccess ? 'bg-green-50' : 'bg-red-50'}`}>
                    <p className={`text-xs font-semibold ${isSuccess ? 'text-green-800' : 'text-red-800'}`}>
                        {isSuccess
                            ? 'Any further prompts from your network are safe to dismiss'
                            : 'Do not approve any further prompts on your phone'}
                    </p>
                </div>

                {/* Actions */}
                {isSuccess ? (
                    <button
                        onClick={onClose}
                        className="w-full bg-green-900 text-green-100 font-semibold py-3 rounded-2xl hover:bg-green-800 transition-colors"
                    >
                        Done
                    </button>
                ) : (
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 bg-white text-gray-500 border border-gray-200 font-semibold py-3 rounded-2xl hover:bg-gray-50 transition-colors"
                        >
                            Close
                        </button>
                       
                    </div>
                )}
            </div>
        </div>
    )
}
