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

type Status =
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
 * Get the transactions Status
 * @param accessToken
 * @param transactionId
 * @returns
 */
export async function getTransactionStatus(accessToken: string, transactionId: string): Promise<Status> {
    const res = await fetch('/api/payment/iotec/status', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            accessToken: accessToken,
            transactionId,
        }),
    })

    const data = await res.json()

    if (!res.ok) {
        console.error(data.message || 'Failed to Get Transaction Status.')
        return 'Failed'
    }

    if (data.status) {
        let _status = data.status! as Status

        return _status
    }

    return "Failed"
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
