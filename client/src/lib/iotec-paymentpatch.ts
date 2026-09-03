import { EventEmitter } from 'eventemitter3' // or mitt, tiny-emitter
export const paymentEmitter = new EventEmitter()

/**
 * Sources of PaymentHandle
 */

export const PaymentSources = {
    paymentModelClient: 'PAYMENT-MODEL-PAYMENT',
    paymentModelProperty: 'PAYMENT-MODEL-PROPERTY',
    paymentPropertyViewing: 'PAYMENT-PROPERTY-VIEWING',
    paymentTour: 'PAYMENT-TOUR',
    paymentSubscription: 'PAYMENT-SUBSCRIPTION',
    paymentSimilarProperties: 'PAYMENT-SIMILAR-PROPERTIES',
}

export const makePaymentString = (paymentSource: string) => {
    return `COMPLETED-PAYMENT-${paymentSource}`
}

/**
 * This one will actually send the payment 
    request to actually return the access token
 */
interface IReturnToken {
    error: boolean
    accessToken: string
    errorMessage: string
}
export async function sendPaymentRequest(): Promise<IReturnToken> {
    let accessToken = null
    try {
        console.log('WILL-FETCH-TOKEN')

        const res = await fetch('/api/payment/iotec/token', {
            method: 'POST',
        })
        console.log('DID-SEND-REQUEST')

        const data = await res.json()

        console.log('FETCHED-DATA', data)
        if (!data.access_token) {
            console.log('NO-WILL-FETCH-TOKEN')

            throw new Error('No access_token returned')
        }

        accessToken = data.access_token
        console.log('DID-RECIEIVE-TOKEN', accessToken)

        return {
            accessToken: accessToken,
            error: false,
            errorMessage: '',
        }
    } catch (err) {
        return {
            accessToken: accessToken,
            error: true,
            //@ts-ignore
            errorMessage: err.message,
        }
    }
}

export function intiateGateWay(accesstoken: string, amount: string, source: string) {
    paymentEmitter.emit('OPEN_PAYMENT_GATEWAY', {
        accessToken: accesstoken,
        amount: amount,
        source: source,
    })
}

export type Status =
    | 'Pending'
    | 'SentToVendor'
    | 'Success'
    | 'Failed'
    | 'AwaitingApproval'
    | 'RolledBack'
    | 'Scheduled'
    | 'Cancelled'
    | 'Rejected'

/**
 * Get the transaction status.
 * Throws on network or API errors so the caller can handle them.
 */
export async function getTransactionStatus(accessToken: string, transactionId: string): Promise<Status> {
    // FIX: GET requests cannot carry a body — pass values as query params instead
    const params = new URLSearchParams({ accessToken, transactionId })

    const res = await fetch(`/api/payment/iotec/status?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
    })

    const data = await res.json()

    if (!res.ok) {
        // FIX: Throw so the caller's catch block receives the real error
        throw new Error(data.message || 'Failed to get transaction status.')
    }

    if (data.status) {
        return data.status as Status
    }

    throw new Error('Transaction status missing from response.')
}

/**
 * Instead of generating P
 */

/**
 * goto a property based on the id
 */

export function gotoProperty(id: string) {
    let propertyString = `/property/${id}`
    window.location.href = propertyString
}
