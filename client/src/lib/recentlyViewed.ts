/**
 * "Recently viewed" listings for the current browser.
 *
 * Stored on the device only: a list of property ids, newest first. It is a
 * convenience for a visitor comparing homes across sessions, not analytics,
 * so nothing here is sent to the server (view counts already go through
 * trackPropertyView). Storage may be missing or blocked (private mode, full
 * quota), so every access is guarded and failure just means an empty list.
 */

export const RECENTLY_VIEWED_STORAGE_KEY = 'recentlyViewedPropertyIds'
export const RECENTLY_VIEWED_MAX = 8

const isPropertyId = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value > 0

/** Parse a stored value, dropping anything that isn't a positive integer id. */
export function parseRecentlyViewed(raw: string | null): number[] {
    if (!raw) return []
    try {
        const parsed: unknown = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        return Array.from(new Set(parsed.filter(isPropertyId))).slice(0, RECENTLY_VIEWED_MAX)
    } catch {
        return []
    }
}

/**
 * A new list with `id` moved to the front. Re-viewing a home bumps it rather
 * than duplicating it, and the list never grows past `max`.
 */
export function withRecentlyViewed(ids: readonly number[], id: number, max = RECENTLY_VIEWED_MAX): number[] {
    if (!isPropertyId(id)) return [...ids]
    return [id, ...ids.filter((existing) => existing !== id)].slice(0, max)
}

export function readRecentlyViewed(): number[] {
    try {
        return parseRecentlyViewed(window.localStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY))
    } catch {
        return []
    }
}

/** Record a view and return the updated list. */
export function recordRecentlyViewed(id: number): number[] {
    const next = withRecentlyViewed(readRecentlyViewed(), id)
    try {
        window.localStorage.setItem(RECENTLY_VIEWED_STORAGE_KEY, JSON.stringify(next))
    } catch {
        // Storage blocked or full: the strip simply won't remember this view.
    }
    return next
}
