import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRouteId } from './ids.ts'

test('accepts plain positive integer ids, including 13-digit timestamp ids', () => {
    assert.equal(parseRouteId('1'), 1)
    assert.equal(parseRouteId('42'), 42)
    assert.equal(parseRouteId('1731484800000'), 1731484800000)
})

test('rejects ids with trailing junk that parseInt would truncate', () => {
    for (const raw of ['12abc', '12.5', '1e9', '0x1A', '7 ']) {
        assert.ok(Number.isNaN(parseRouteId(raw)), `expected NaN for ${JSON.stringify(raw)}`)
    }
})

test('rejects zero, negatives, signs, leading zeros and whitespace', () => {
    for (const raw of ['0', '-5', '+5', '007', ' 7', '']) {
        assert.ok(Number.isNaN(parseRouteId(raw)), `expected NaN for ${JSON.stringify(raw)}`)
    }
})

test('rejects ids too large to be represented exactly', () => {
    assert.ok(Number.isNaN(parseRouteId('9007199254740993')))
    assert.ok(Number.isNaN(parseRouteId('12345678901234567')))
    assert.equal(parseRouteId('9007199254740991'), Number.MAX_SAFE_INTEGER)
})

test('rejects non-string input such as repeated query params', () => {
    assert.ok(Number.isNaN(parseRouteId(undefined)))
    assert.ok(Number.isNaN(parseRouteId(['1', '2'])))
    assert.ok(Number.isNaN(parseRouteId(5)))
})
