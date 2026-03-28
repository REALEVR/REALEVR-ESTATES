/**
 * The Idea of the iotech wallet comp.(API), its job is to actually get the current balance
 * of the wallet, store it right before the transaction to get snapshot of the current money
 * then when the transaction is complete, we're going to first check if the new amount is morethan the old
 * amount by the {money-to-be-paid} and we assume the payment was successfull, otherwise if they're
 *
 * equal we know the transaction was not complete
 */

async function getWalletBalance(accessToken: string): Promise<number> {
    const response = await fetch('/api/payment/iotec/wallet-b', {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
    })

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(error?.error ?? `Request failed with status ${response.status}`)
    }

    const data = await response.json()
    return data.walletBalance
}

function isTransactionComplete(
    balanceBeforePayment: number,
    balanceAfterPayment: number,
    expectedAmount: number,
    tolerance: number = 0.01 // to handle floating point drift
): boolean {
    const actualDeduction = balanceBeforePayment - balanceAfterPayment
    return Math.abs(actualDeduction - expectedAmount) <= tolerance
}
