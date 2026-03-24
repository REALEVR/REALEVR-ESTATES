import { useState, useCallback } from 'react'

type Gateway = 'flutterwave' | 'iotech'

interface PaymentState {
    isLoading: boolean
    error: string | null
    paymentUrl: string | null
    txRef: string | null
    paymentId: string | null
    gateway: Gateway | null
}

interface InitPaymentParams {
    amount: number
    currency?: string
    type?: 'deposit' | 'rent' | 'full' | 'subscription' | 'tour'
    gateway: Gateway
    redirectUrl?: string
    meta?: Record<string, any>
}

export function usePaymentGateway() {
    const [selectedGateway, setSelectedGateway] = useState<Gateway>(
        (localStorage.getItem('preferred_gateway') as Gateway) || 'flutterwave'
    )

    const [paymentState, setPaymentState] = useState<PaymentState>({
        isLoading: false,
        error: null,
        paymentUrl: null,
        txRef: null,
        paymentId: null,
        gateway: null,
    })

    const selectGateway = useCallback((gateway: Gateway) => {
        setSelectedGateway(gateway)
        localStorage.setItem('preferred_gateway', gateway)
    }, [])

    const initializePayment = useCallback(async (params: InitPaymentParams) => {
        setPaymentState({ isLoading: true, error: null, paymentUrl: null, txRef: null, paymentId: null, gateway: null })

        try {
            const res = await fetch('/api/payments/initialize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: params.amount,
                    currency: params.currency || 'UGX',
                    type: params.type || 'deposit',
                    gateway: params.gateway,
                    redirectUrl: params.redirectUrl || window.location.href,
                    meta: params.meta,
                }),
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.message || 'Failed to initialize payment')
            }

            setPaymentState({
                isLoading: false,
                error: null,
                paymentUrl: data.paymentUrl,
                txRef: data.txRef,
                paymentId: data.paymentId,
                gateway: data.gateway,
            })

            return { success: true, ...data }
        } catch (error: any) {
            setPaymentState({
                isLoading: false,
                error: error.message,
                paymentUrl: null,
                txRef: null,
                paymentId: null,
                gateway: null,
            })
            return { success: false, error: error.message }
        }
    }, [])

    const redirectToPayment = useCallback((paymentUrl: string) => {
        window.location.href = paymentUrl
    }, [])

    const reset = useCallback(() => {
        setPaymentState({
            isLoading: false,
            error: null,
            paymentUrl: null,
            txRef: null,
            paymentId: null,
            gateway: null,
        })
    }, [])

    return {
        selectedGateway,
        selectGateway,
        paymentState,
        initializePayment,
        redirectToPayment,
        reset,
    }
}
