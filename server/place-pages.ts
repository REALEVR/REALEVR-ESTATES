import { AFRICAN_COUNTRIES, countryByCode, inferListingCountry, listingCity, slugify } from '../shared/africa'

export interface PopulatedPlace {
    code: string
    name: string
    slug: string
    count: number
    cities: Array<{ name: string; slug: string; count: number }>
}

/**
 * The countries and cities that actually have homes listed, with counts: what the
 * "homes in ..." pages, the footer links and the sitemap are built from. A place with
 * nothing listed is not advertised (thin pages help nobody and search engines notice).
 */
export function populatedPlaces(listings: Array<Record<string, any>>): PopulatedPlace[] {
    const byCountry = new Map<string, { count: number; cities: Map<string, number> }>()
    for (const p of listings) {
        const code = inferListingCountry(p)
        const row = byCountry.get(code) ?? { count: 0, cities: new Map<string, number>() }
        row.count++
        const city = listingCity(p)
        if (city) row.cities.set(city.name, (row.cities.get(city.name) ?? 0) + 1)
        byCountry.set(code, row)
    }
    return AFRICAN_COUNTRIES.filter((c) => byCountry.has(c.code))
        .map((c) => {
            const row = byCountry.get(c.code)!
            return {
                code: c.code,
                name: c.name,
                slug: slugify(c.name),
                count: row.count,
                cities: Array.from(row.cities.entries())
                    .sort((a, b) => b[1] - a[1])
                    .map(([name, count]) => ({ name, slug: slugify(name), count })),
            }
        })
        .sort((a, b) => b.count - a.count)
}

/** Paths for the sitemap: one per populated country and per populated city. */
export function placePagePaths(places: PopulatedPlace[]): string[] {
    return places.flatMap((p) => [`/homes/${p.slug}`, ...p.cities.map((c) => `/homes/${p.slug}/${c.slug}`)])
}

export { countryByCode }
