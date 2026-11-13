/**
 * Strict parsing of numeric record ids that arrive in URLs (req.params / req.query).
 *
 * `parseInt` is too forgiving for ids: "12abc" -> 12, "1e9" -> 1, "-5" -> -5, " 7" -> 7.
 * A malformed link would then quietly load (or edit) a different record than the one
 * the URL names. Route handlers already reject NaN with a 400, so this returns NaN for
 * anything that is not a plain positive integer instead of throwing — callers keep
 * their existing `isNaN(id)` guard and just swap the parser.
 */

// Ids are millisecond timestamps (see generateId in dynamodb.ts): 13 digits today.
// 16 digits is the most that can still be a safe integer, so longer input is rejected
// before Number() can round it to a neighbouring id.
const ROUTE_ID_PATTERN = /^[1-9]\d{0,15}$/

export function parseRouteId(raw: unknown): number {
    if (typeof raw !== 'string' || !ROUTE_ID_PATTERN.test(raw)) return NaN
    const id = Number(raw)
    return Number.isSafeInteger(id) ? id : NaN
}
