/**
 * Decides whether a POST /api/payment/iotect/record call may be trusted.
 *
 * That route is called by the browser after a mobile-money payment. It used to
 * believe whatever the browser sent: any visitor could post a made-up
 * transactionId with `amount: 15000` and get a 24-hour tour pass, a stored
 * "payment" and a "Tour payment received" alert to the admins, without paying.
 *
 * The route now asks IoTec itself for the collection's status, then calls
 * this function. It is kept free of I/O so it can be tested directly.
 */

/** Same shape the RentRail flow and GET /api/payment/iotec/status accept. */
export const IOTEC_TRANSACTION_ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/

export function isValidIotecTransactionId(value: unknown): value is string {
    return typeof value === 'string' && IOTEC_TRANSACTION_ID_PATTERN.test(value)
}

export interface IotecCollectionReport {
    /** RequestStatus as IoTec reports it, e.g. 'Success', 'Pending', 'Failed'. */
    status: string
    /** Amount IoTec says it collected, or null when the gateway does not say. */
    amount: number | null
}

export type RecordDecision =
    | { ok: true; amount: number }
    | { ok: false; httpStatus: number; message: string }

/**
 * @param report  what IoTec says about the transaction
 * @param claimedAmount  the amount the browser says was paid
 */
export function decideIotecRecord(report: IotecCollectionReport, claimedAmount: number): RecordDecision {
    if (!Number.isFinite(claimedAmount) || claimedAmount <= 0) {
        return { ok: false, httpStatus: 400, message: 'amount must be a positive number' }
    }
    if (report.status !== 'Success') {
        return {
            ok: false,
            httpStatus: 402,
            message: `Payment not confirmed by the gateway (status: ${report.status || 'unknown'}).`,
        }
    }
    if (report.amount !== null) {
        if (report.amount < claimedAmount) {
            return {
                ok: false,
                httpStatus: 402,
                message: 'The gateway collected less than the amount claimed for this payment.',
            }
        }
        // Record what was actually collected, not what the browser said.
        return { ok: true, amount: report.amount }
    }
    return { ok: true, amount: claimedAmount }
}
