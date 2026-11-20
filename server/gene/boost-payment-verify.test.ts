import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decideBoostPayment, isValidIotecTransactionId } from './boost-payment-verify'

test('activates when IoTec reports Success for at least the tier price', () => {
    const decision = decideBoostPayment({ report: { status: 'Success', amount: 25000 }, expectedAmountUgx: 25000, transactionAlreadyUsed: false })
    assert.deepEqual(decision, { ok: true })
})

test('activates when IoTec reports Success without an amount', () => {
    const decision = decideBoostPayment({ report: { status: 'Success', amount: null }, expectedAmountUgx: 10000, transactionAlreadyUsed: false })
    assert.deepEqual(decision, { ok: true })
})

test('refuses a transaction IoTec has not confirmed', () => {
    for (const status of ['Pending', 'Failed', '']) {
        const decision = decideBoostPayment({ report: { status, amount: 50000 }, expectedAmountUgx: 50000, transactionAlreadyUsed: false })
        assert.equal(decision.ok, false)
        assert.equal(!decision.ok && decision.httpStatus, 402)
    }
})

test('refuses when IoTec collected less than the tier price (Bronze payment used for Gold)', () => {
    const decision = decideBoostPayment({ report: { status: 'Success', amount: 10000 }, expectedAmountUgx: 50000, transactionAlreadyUsed: false })
    assert.equal(decision.ok, false)
    assert.equal(!decision.ok && decision.httpStatus, 402)
})

test('refuses a transaction that already activated another boost', () => {
    const decision = decideBoostPayment({ report: { status: 'Success', amount: 50000 }, expectedAmountUgx: 10000, transactionAlreadyUsed: true })
    assert.equal(decision.ok, false)
    assert.equal(!decision.ok && decision.httpStatus, 409)
})

test('transaction ids must look like IoTec ids', () => {
    assert.equal(isValidIotecTransactionId('a1b2c3d4-e5f6-7890'), true)
    assert.equal(isValidIotecTransactionId('x'), false)
    assert.equal(isValidIotecTransactionId('../../etc/passwd'), false)
    assert.equal(isValidIotecTransactionId(12345678), false)
})
