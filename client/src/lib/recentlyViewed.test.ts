// Run with: npx tsx --test client/src/lib/recentlyViewed.test.ts
// (No client test runner is wired up yet; see #191.)
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { RECENTLY_VIEWED_MAX, parseRecentlyViewed, withRecentlyViewed } from './recentlyViewed'

describe('withRecentlyViewed', () => {
    it('puts a newly viewed home first', () => {
        assert.deepEqual(withRecentlyViewed([3, 2], 7), [7, 3, 2])
    })

    it('moves a re-viewed home to the front instead of duplicating it', () => {
        assert.deepEqual(withRecentlyViewed([3, 7, 2], 7), [7, 3, 2])
    })

    it('caps the list at the maximum', () => {
        const full = Array.from({ length: RECENTLY_VIEWED_MAX }, (_, i) => i + 1)
        const next = withRecentlyViewed(full, 99)
        assert.equal(next.length, RECENTLY_VIEWED_MAX)
        assert.equal(next[0], 99)
        assert.ok(!next.includes(RECENTLY_VIEWED_MAX))
    })

    it('does not mutate the input list', () => {
        const ids = [1, 2]
        withRecentlyViewed(ids, 3)
        assert.deepEqual(ids, [1, 2])
    })

    it('ignores ids that are not positive integers', () => {
        assert.deepEqual(withRecentlyViewed([1], 0), [1])
        assert.deepEqual(withRecentlyViewed([1], Number.NaN), [1])
    })
})

describe('parseRecentlyViewed', () => {
    it('returns an empty list for missing or corrupt storage', () => {
        assert.deepEqual(parseRecentlyViewed(null), [])
        assert.deepEqual(parseRecentlyViewed('not json'), [])
        assert.deepEqual(parseRecentlyViewed('{"a":1}'), [])
    })

    it('keeps only valid, unique ids in order', () => {
        assert.deepEqual(parseRecentlyViewed('[5, "6", 5, -1, 2.5, 4]'), [5, 4])
    })
})
