import { test, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { debugLog, isRouteDebugEnabled, DEBUG_ROUTES_ENV } from './debug-log'

const original = process.env[DEBUG_ROUTES_ENV]

afterEach(() => {
    if (original === undefined) delete process.env[DEBUG_ROUTES_ENV]
    else process.env[DEBUG_ROUTES_ENV] = original
    mock.restoreAll()
})

test('isRouteDebugEnabled is off when the variable is unset or falsy', () => {
    assert.equal(isRouteDebugEnabled({}), false)
    assert.equal(isRouteDebugEnabled({ [DEBUG_ROUTES_ENV]: '0' }), false)
    assert.equal(isRouteDebugEnabled({ [DEBUG_ROUTES_ENV]: 'yes' }), false)
})

test('isRouteDebugEnabled accepts 1 and true (any case)', () => {
    assert.equal(isRouteDebugEnabled({ [DEBUG_ROUTES_ENV]: '1' }), true)
    assert.equal(isRouteDebugEnabled({ [DEBUG_ROUTES_ENV]: 'TRUE' }), true)
})

test('debugLog prints nothing by default', () => {
    delete process.env[DEBUG_ROUTES_ENV]
    const spy = mock.method(console, 'debug', () => {})
    debugLog('Incoming property data:', { phone: '+256700000000' })
    assert.equal(spy.mock.callCount(), 0)
})

test('debugLog prefixes and forwards details when enabled', () => {
    process.env[DEBUG_ROUTES_ENV] = '1'
    const spy = mock.method(console, 'debug', () => {})
    const detail = { id: 7 }
    debugLog('Getting property', detail)
    assert.equal(spy.mock.callCount(), 1)
    assert.deepEqual(spy.mock.calls[0].arguments, ['[DEBUG] Getting property', detail])
})
