// Run: npx tsx --test server/gene/iotec-record-verify.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decideIotecRecord, isValidIotecTransactionId } from './iotec-record-verify'

test('accepts a successful collection and records the gateway amount', () => {
    assert.deepEqual(decideIotecRecord({ status: 'Success', amount: 15000 }, 15000), { ok: true, amount: 15000 })
})

test('records the claimed amount when the gateway does not report one', () => {
    assert.deepEqual(decideIotecRecord({ status: 'Success', amount: null }, 15000), { ok: true, amount: 15000 })
})

test('rejects a transaction the gateway has not confirmed', () => {
    for (const status of ['Pending', 'Failed', 'RolledBack', 'Cancelled', 'Rejected', '']) {
        const result = decideIotecRecord({ status, amount: 15000 }, 15000)
        assert.equal(result.ok, false, status)
        if (!result.ok) assert.equal(result.httpStatus, 402)
    }
})

test('rejects a payment where the gateway collected less than claimed', () => {
    const result = decideIotecRecord({ status: 'Success', amount: 500 }, 15000)
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.httpStatus, 402)
})

test('rejects a non-positive or non-numeric claimed amount', () => {
    for (const claimed of [0, -1, Number.NaN]) {
        const result = decideIotecRecord({ status: 'Success', amount: 15000 }, claimed)
        assert.equal(result.ok, false)
        if (!result.ok) assert.equal(result.httpStatus, 400)
    }
})

test('transaction id format check', () => {
    assert.equal(isValidIotecTransactionId('a1b2c3d4-e5f6'), true)
    assert.equal(isValidIotecTransactionId('short'), false)
    assert.equal(isValidIotecTransactionId('../../etc/passwd'), false)
    assert.equal(isValidIotecTransactionId(12345678), false)
    assert.equal(isValidIotecTransactionId(undefined), false)
})
