import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseCategoryTab, withCategoryTab } from './property-tabs.ts'

describe('parseCategoryTab', () => {
    it('returns a known tab unchanged', () => {
        assert.equal(parseCategoryTab('for_sale'), 'for_sale')
    })

    it('tolerates case and surrounding spaces', () => {
        assert.equal(parseCategoryTab('  Bank_Sales '), 'bank_sales')
    })

    it('falls back to all for missing, empty or unknown values', () => {
        assert.equal(parseCategoryTab(null), 'all')
        assert.equal(parseCategoryTab(''), 'all')
        assert.equal(parseCategoryTab('penthouses'), 'all')
    })
})

describe('withCategoryTab', () => {
    it('sets the tab and keeps other params', () => {
        const next = withCategoryTab(new URLSearchParams('q=kololo&beds=2'), 'rental_units')
        assert.equal(next.get('tab'), 'rental_units')
        assert.equal(next.get('q'), 'kololo')
        assert.equal(next.get('beds'), '2')
    })

    it('drops the param for the default tab', () => {
        const next = withCategoryTab(new URLSearchParams('tab=for_sale&q=ntinda'), 'all')
        assert.equal(next.has('tab'), false)
        assert.equal(next.get('q'), 'ntinda')
    })

    it('does not mutate the input params', () => {
        const input = new URLSearchParams('q=muyenga')
        withCategoryTab(input, 'for_sale')
        assert.equal(input.has('tab'), false)
    })
})
