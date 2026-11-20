/**
 * Opt-in verbose logging for route handlers.
 *
 * The property routes used to call console.log('[DEBUG] ...') on every
 * request, dumping request bodies, user objects and whole DynamoDB items
 * into production logs. That is noisy, slows hot paths (every property
 * read/view-count bump) and leaks personal data into log storage.
 *
 * debugLog() keeps those traces available for local troubleshooting but
 * prints nothing unless DEBUG_ROUTES=1 is set. The env var is read on each
 * call so it can be flipped in tests or a running dev shell without a
 * restart of this module.
 */

export const DEBUG_ROUTES_ENV = 'DEBUG_ROUTES'

export function isRouteDebugEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
    const value = env[DEBUG_ROUTES_ENV]
    return value === '1' || value?.toLowerCase() === 'true'
}

export function debugLog(message: string, ...details: unknown[]): void {
    if (!isRouteDebugEnabled()) return
    console.debug(`[DEBUG] ${message}`, ...details)
}
