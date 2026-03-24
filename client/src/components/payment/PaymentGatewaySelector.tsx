import React, { useState } from 'react'
import { CreditCard, Smartphone, Building2, Zap, ChevronRight, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface PaymentGatewaySelectorProps {
    amount: number
    currency?: string
    onSelect: (gateway: 'flutterwave' | 'iotech') => void
    onCancel?: () => void
    isLoading?: boolean
}

const gatewayDetails = {
    flutterwave: {
        name: 'Flutterwave',
        description: 'Africa\'s leading payment infrastructure',
        logo: '🌊',
        color: 'from-orange-500 to-yellow-400',
        borderColor: 'border-orange-200 hover:border-orange-400',
        bgColor: 'bg-orange-50',
        methods: [
            { icon: <CreditCard className="h-4 w-4" />, label: 'Card Payment' },
            { icon: <Smartphone className="h-4 w-4" />, label: 'Mobile Money' },
            { icon: <Building2 className="h-4 w-4" />, label: 'Bank Transfer' },
            { icon: <Zap className="h-4 w-4" />, label: 'USSD' },
        ],
        processingTime: '1-3 minutes',
        rating: 4.8,
    },
    iotech: {
        name: 'iOTECT Pay',
        description: 'Fast & secure local payments',
        logo: '⚡',
        color: 'from-blue-600 to-cyan-500',
        borderColor: 'border-blue-200 hover:border-blue-400',
        bgColor: 'bg-blue-50',
        methods: [
            { icon: <Smartphone className="h-4 w-4" />, label: 'Mobile Money' },
            { icon: <Zap className="h-4 w-4" />, label: 'USSD' },
            { icon: <CreditCard className="h-4 w-4" />, label: 'Bank Card' },
        ],
        processingTime: '1-2 minutes',
        rating: 4.7,
    },
}

export function PaymentGatewaySelector({
    amount,
    currency = 'UGX',
    onSelect,
    onCancel,
    isLoading = false,
}: PaymentGatewaySelectorProps) {
    const [selected, setSelected] = useState<'flutterwave' | 'iotech' | null>(null)

    const handleSelect = (gateway: 'flutterwave' | 'iotech') => {
        setSelected(gateway)
        onSelect(gateway)
    }

    return (
        <div className="space-y-4">
            <div className="text-center mb-6">
                <p className="text-sm text-gray-500">Amount to pay</p>
                <p className="text-3xl font-bold text-gray-900">
                    {currency} {amount.toLocaleString()}
                </p>
            </div>

            <p className="text-sm font-medium text-gray-700 mb-3">Select payment method:</p>

            <div className="grid gap-3">
                {(Object.entries(gatewayDetails) as [keyof typeof gatewayDetails, typeof gatewayDetails.flutterwave][]).map(
                    ([key, gateway]) => (
                        <button
                            key={key}
                            onClick={() => handleSelect(key)}
                            disabled={isLoading}
                            className={`w-full text-left border-2 rounded-xl p-4 transition-all duration-200 ${
                                selected === key
                                    ? 'border-primary bg-primary/5 shadow-md'
                                    : `${gateway.borderColor} bg-white`
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div
                                        className={`w-10 h-10 rounded-lg bg-gradient-to-br ${gateway.color} flex items-center justify-center text-xl`}
                                    >
                                        {gateway.logo}
                                    </div>
                                    <div>
                                        <p className="font-semibold text-gray-900">{gateway.name}</p>
                                        <p className="text-xs text-gray-500">{gateway.description}</p>
                                    </div>
                                </div>
                                <ChevronRight
                                    className={`h-5 w-5 transition-transform ${
                                        selected === key ? 'text-primary rotate-90' : 'text-gray-400'
                                    }`}
                                />
                            </div>

                            <div className={`mt-3 pt-3 border-t border-gray-100`}>
                                <div className="flex flex-wrap gap-2 mb-2">
                                    {gateway.methods.map((method, i) => (
                                        <span
                                            key={i}
                                            className={`flex items-center gap-1 text-xs ${gateway.bgColor} px-2 py-1 rounded-full text-gray-700`}
                                        >
                                            {method.icon}
                                            {method.label}
                                        </span>
                                    ))}
                                </div>
                                <div className="flex items-center justify-between text-xs text-gray-500">
                                    <span>⏱️ {gateway.processingTime}</span>
                                    <span>⭐ {gateway.rating}/5</span>
                                </div>
                            </div>
                        </button>
                    )
                )}
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                <Shield className="h-4 w-4 text-green-600 flex-shrink-0" />
                <span>All payments are secured and encrypted. Your financial data is never stored on our servers.</span>
            </div>

            {onCancel && (
                <Button variant="outline" className="w-full" onClick={onCancel} disabled={isLoading}>
                    Cancel
                </Button>
            )}
        </div>
    )
}

export default PaymentGatewaySelector
