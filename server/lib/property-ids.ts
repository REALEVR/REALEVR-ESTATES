/**
 * Parsing for the `?ids=` batch lookup on GET /api/properties.
 *
 * Client widgets (recently viewed, compare, saved homes) only need a handful
 * of specific listings. Before this, they downloaded the full listing payload
 * and filtered it in the browser. `?ids=1,2,3` lets them ask for exactly what
 * they show, and each id becomes a single DynamoDB GetItem instead of a scan.
 *
 * Kept as a pure module so the rules are unit-testable without Express or AWS.
 */

/** Upper bound on ids per request: keeps one call from fanning out into
 *  hundreds of GetItem reads. 24 covers every current widget with room left. */
export const MAX_BATCH_PROPERTY_IDS = 24

/** Property ids come from generateId() (millisecond timestamps), so they are
 *  plain positive integers of at most 16 digits. Anything else is malformed. */
const PROPERTY_ID_PATTERN = /^[1-9]\d{0,15}$/

export type ParsedPropertyIds = { ok: true; ids: number[] } | { ok: false; error: string }

/**
 * Parse a comma-separated id list into unique numeric ids, in request order.
 *
 * - Whitespace around tokens and empty tokens (`1,,2,`) are ignored.
 * - Duplicates are dropped, keeping the first occurrence, so the response
 *   order matches what the caller asked for (recently-viewed order matters).
 * - Any malformed token rejects the whole request rather than being silently
 *   truncated (`12abc` is not id 12).
 */
export function parsePropertyIdList(raw: unknown): ParsedPropertyIds {
    if (typeof raw !== 'string') {
        return { ok: false, error: 'ids must be a single comma-separated list' }
    }

    const tokens = raw
        .split(',')
        .map((token) => token.trim())
        .filter((token) => token.length > 0)

    if (tokens.length === 0) {
        return { ok: false, error: 'ids must contain at least one property id' }
    }

    const invalid = tokens.find((token) => !PROPERTY_ID_PATTERN.test(token) || !Number.isSafeInteger(Number(token)))
    if (invalid !== undefined) {
        return { ok: false, error: `Invalid property id: ${invalid.slice(0, 32)}` }
    }

    const ids = Array.from(new Set(tokens.map(Number)))
    if (ids.length > MAX_BATCH_PROPERTY_IDS) {
        return { ok: false, error: `At most ${MAX_BATCH_PROPERTY_IDS} property ids per request` }
    }

    return { ok: true, ids }
}
