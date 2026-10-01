import type { Request } from 'express'
import { inferListingCountry, placeFromCookieHeader, rankByPlace } from '../shared/africa'

/**
 * Listings as a visitor should see them: each carries its country, and they come
 * nearest-first by the place the browser told us about (the realevr_place cookie,
 * set from the visitor's time zone, a place they chose, or a location they shared):
 * their city first, then the rest of their country, then everywhere else, with the
 * original order (newest, most viewed, paid priority) kept inside each group. With no
 * cookie the order is unchanged.
 */
export function presentListings<T extends Record<string, any>>(req: Pick<Request, 'headers'>, list: T[]): Array<T & { country: string }> {
    const withCountry = list.map((p) => ({ ...p, country: inferListingCountry(p) }))
    return rankByPlace(withCountry, placeFromCookieHeader(req.headers.cookie))
}
