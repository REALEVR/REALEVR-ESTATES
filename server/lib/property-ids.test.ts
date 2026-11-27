// Run with: npx tsx --test server/lib/property-ids.test.ts
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { MAX_BATCH_PROPERTY_IDS, parsePropertyIdList } from './property-ids'

describe('parsePropertyIdList', () => {
    test('parses a comma-separated list in request order', () => {
        assert.deepEqual(parsePropertyIdList('1732700000000,42,7'), { ok: true, ids: [1732700000000, 42, 7] })
    })

    test('ignores whitespace and empty tokens', () => {
        assert.deepEqual(parsePropertyIdList(' 3 , ,4,'), { ok: true, ids: [3, 4] })
    })

    test('drops duplicates but keeps the first position', () => {
        assert.deepEqual(parsePropertyIdList('5,9,5,2,9'), { ok: true, ids: [5, 9, 2] })
    })

    test('rejects a partially numeric token instead of truncating it', () => {
        const result = parsePropertyIdList('12,12abc')
        assert.equal(result.ok, false)
        assert.match(!result.ok ? result.error : '', /12abc/)
    })

    test('rejects zero, negatives, decimals and leading zeros', () => {
        for (const raw of ['0', '-4', '3.5', '007']) {
            assert.equal(parsePropertyIdList(raw).ok, false, raw)
        }
    })

    test('rejects ids beyond the safe integer range', () => {
        assert.equal(parsePropertyIdList('9999999999999999').ok, false)
    })

    test('rejects an empty list', () => {
        assert.equal(parsePropertyIdList(' , ').ok, false)
    })

    test('rejects repeated ?ids= params, which Express turns into an array', () => {
        assert.equal(parsePropertyIdList(['1', '2']).ok, false)
    })

    test('enforces the batch cap after de-duplication', () => {
        const atCap = Array.from({ length: MAX_BATCH_PROPERTY_IDS }, (_, i) => i + 1)
        assert.equal(parsePropertyIdList([...atCap, ...atCap].join(',')).ok, true)
        assert.equal(parsePropertyIdList([...atCap, MAX_BATCH_PROPERTY_IDS + 1].join(',')).ok, false)
    })

    test('truncates a long invalid token in the error message', () => {
        const result = parsePropertyIdList('x'.repeat(500))
        assert.equal(result.ok, false)
        assert.ok(!result.ok && result.error.length < 80)
    })
})
