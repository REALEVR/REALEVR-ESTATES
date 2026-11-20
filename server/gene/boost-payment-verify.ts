/**
 * Decides whether POST /api/gene/boost/:id/confirm-payment may activate a boost.
 *
 * That route is called by the browser (BoostPurchaseCard.tsx) after an IoTec
 * mobile-money payment. It used to activate the boost for any transactionId
 * string the browser sent, so a listing owner could get a Bronze/Silver/Gold
 * boost (UGX 10,000 / 25,000 / 50,000) without paying. It also wrote a fake
 * row into the payments table, which the admin revenue numbers read.
 *
 * The route now asks IoTec for the collection's status with the server's own
 * token (fetchIotecCollectionStatus) and then calls decideBoostPayment, which
 * does no I/O so it can be tested directly.
 */
import { request } from 'undici'

/** Same shape GET /api/payment/iotec/status accepts. */
export const IOTEC_TRANSACTION_ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/

export function isValidIotecTransactionId(value: unknown): value is string {
    return typeof value === 'string' && IOTEC_TRANSACTION_ID_PATTERN.test(value)
}

export interface IotecCollectionStatus {
    /** RequestStatus as IoTec reports it, e.g. 'Success', 'Pending', 'Failed'. */
    status: string
    /** Amount IoTec says it collected, or null when the gateway does not say. */
    amount: number | null
}

export type IotecStatusLookup = (transactionId: string) => Promise<IotecCollectionStatus>

export type BoostPaymentDecision = { ok: true } | { ok: false; httpStatus: number; message: string }

export interface BoostPaymentCheck {
    /** What IoTec says about the transaction. */
    report: IotecCollectionStatus
    /** The tier price stored on the purchase when it was created. */
    expectedAmountUgx: number
    /** True when this transaction already activated a different boost purchase. */
    transactionAlreadyUsed: boolean
}

export function decideBoostPayment({ report, expectedAmountUgx, transactionAlreadyUsed }: BoostPaymentCheck): BoostPaymentDecision {
    if (transactionAlreadyUsed) {
        return { ok: false, httpStatus: 409, message: 'This payment has already been used to activate another boost.' }
    }
    if (report.status !== 'Success') {
        return {
            ok: false,
            httpStatus: 402,
            message: `Payment not confirmed by the gateway (status: ${report.status || 'unknown'}).`,
        }
    }
    if (report.amount !== null && report.amount < expectedAmountUgx) {
        return { ok: false, httpStatus: 402, message: 'The gateway collected less than the price of this boost.' }
    }
    return { ok: true }
}

/** Looks up a collection with IoTec. Throws when IoTec cannot be reached or answers with an error. */
export async function fetchIotecCollectionStatus(transactionId: string, getToken: () => Promise<string>): Promise<IotecCollectionStatus> {
    const { statusCode, body } = await request(`https://pay.iotec.io/api/collections/status/${encodeURIComponent(transactionId)}`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${await getToken()}`,
            'Content-Type': 'application/json',
        },
    })
    const data = (await body.json()) as { status?: string; amount?: number | string }
    if (statusCode < 200 || statusCode >= 300 || !data?.status) {
        throw new Error(`IoTec status lookup failed (HTTP ${statusCode})`)
    }
    const gatewayAmount = Number(data.amount)
    return { status: data.status, amount: data.amount != null && Number.isFinite(gatewayAmount) ? gatewayAmount : null }
}
