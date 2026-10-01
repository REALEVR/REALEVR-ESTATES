/**
 * Africa, as the platform needs to know it: every country (its currency, phone
 * code, rough centre and main cities) plus the small pieces of geography that
 * make listings and discovery work across the continent:
 *
 *   - which country a listing is in (even an older one saved without a country),
 *   - which country/city a visitor is in, from their time zone (no permission
 *     needed) or from coordinates they chose to share,
 *   - how to put the nearest listings first,
 *   - how to turn a phone number typed in any African country into the
 *     international digits WhatsApp needs.
 *
 * Plain data and pure functions, used by both the server and the browser, so
 * the two always agree. Coordinates are approximate (good to a few kilometres
 * for cities, much looser for country centres): enough to rank "near you", not
 * to navigate.
 */

export interface AfricanCity {
    name: string
    lat: number
    lng: number
}

export interface AfricanCountry {
    code: string // ISO 3166-1 alpha-2
    name: string
    currency: string // ISO 4217
    dial: string // international dialling code, digits only
    lat: number
    lng: number
    /** IANA time zones that point at this country. */
    zones: string[]
    cities: AfricanCity[]
}

const c = (name: string, lat: number, lng: number): AfricanCity => ({ name, lat, lng })

export const AFRICAN_COUNTRIES: AfricanCountry[] = [
    { code: 'DZ', name: 'Algeria', currency: 'DZD', dial: '213', lat: 28.0, lng: 2.6, zones: ['Africa/Algiers'], cities: [c('Algiers', 36.75, 3.06), c('Oran', 35.7, -0.63)] },
    { code: 'AO', name: 'Angola', currency: 'AOA', dial: '244', lat: -12.3, lng: 17.5, zones: ['Africa/Luanda'], cities: [c('Luanda', -8.84, 13.23)] },
    { code: 'BJ', name: 'Benin', currency: 'XOF', dial: '229', lat: 9.3, lng: 2.3, zones: ['Africa/Porto-Novo'], cities: [c('Cotonou', 6.37, 2.43)] },
    { code: 'BW', name: 'Botswana', currency: 'BWP', dial: '267', lat: -22.3, lng: 24.7, zones: ['Africa/Gaborone'], cities: [c('Gaborone', -24.65, 25.91)] },
    { code: 'BF', name: 'Burkina Faso', currency: 'XOF', dial: '226', lat: 12.2, lng: -1.6, zones: ['Africa/Ouagadougou'], cities: [c('Ouagadougou', 12.37, -1.52)] },
    { code: 'BI', name: 'Burundi', currency: 'BIF', dial: '257', lat: -3.4, lng: 29.9, zones: ['Africa/Bujumbura'], cities: [c('Bujumbura', -3.38, 29.36)] },
    { code: 'CV', name: 'Cabo Verde', currency: 'CVE', dial: '238', lat: 16.0, lng: -24.0, zones: ['Atlantic/Cape_Verde'], cities: [c('Praia', 14.93, -23.51)] },
    { code: 'CM', name: 'Cameroon', currency: 'XAF', dial: '237', lat: 5.7, lng: 12.7, zones: ['Africa/Douala'], cities: [c('Douala', 4.05, 9.77), c('Yaoundé', 3.85, 11.5)] },
    { code: 'CF', name: 'Central African Republic', currency: 'XAF', dial: '236', lat: 6.6, lng: 20.9, zones: ['Africa/Bangui'], cities: [c('Bangui', 4.36, 18.56)] },
    { code: 'TD', name: 'Chad', currency: 'XAF', dial: '235', lat: 15.5, lng: 18.7, zones: ['Africa/Ndjamena'], cities: [c("N'Djamena", 12.13, 15.05)] },
    { code: 'KM', name: 'Comoros', currency: 'KMF', dial: '269', lat: -11.9, lng: 43.9, zones: ['Indian/Comoro'], cities: [c('Moroni', -11.7, 43.26)] },
    { code: 'CG', name: 'Congo', currency: 'XAF', dial: '242', lat: -0.7, lng: 15.2, zones: ['Africa/Brazzaville'], cities: [c('Brazzaville', -4.27, 15.28)] },
    { code: 'CD', name: 'DR Congo', currency: 'CDF', dial: '243', lat: -2.9, lng: 23.7, zones: ['Africa/Kinshasa', 'Africa/Lubumbashi'], cities: [c('Kinshasa', -4.44, 15.27), c('Lubumbashi', -11.66, 27.48)] },
    { code: 'CI', name: "Côte d'Ivoire", currency: 'XOF', dial: '225', lat: 7.5, lng: -5.5, zones: ['Africa/Abidjan'], cities: [c('Abidjan', 5.36, -4.01)] },
    { code: 'DJ', name: 'Djibouti', currency: 'DJF', dial: '253', lat: 11.8, lng: 42.6, zones: ['Africa/Djibouti'], cities: [c('Djibouti', 11.59, 43.15)] },
    { code: 'EG', name: 'Egypt', currency: 'EGP', dial: '20', lat: 26.8, lng: 30.8, zones: ['Africa/Cairo'], cities: [c('Cairo', 30.04, 31.24), c('Alexandria', 31.2, 29.92)] },
    { code: 'GQ', name: 'Equatorial Guinea', currency: 'XAF', dial: '240', lat: 1.6, lng: 10.5, zones: ['Africa/Malabo'], cities: [c('Malabo', 3.75, 8.78)] },
    { code: 'ER', name: 'Eritrea', currency: 'ERN', dial: '291', lat: 15.2, lng: 39.8, zones: ['Africa/Asmara', 'Africa/Asmera'], cities: [c('Asmara', 15.32, 38.93)] },
    { code: 'SZ', name: 'Eswatini', currency: 'SZL', dial: '268', lat: -26.5, lng: 31.5, zones: ['Africa/Mbabane'], cities: [c('Mbabane', -26.31, 31.14)] },
    { code: 'ET', name: 'Ethiopia', currency: 'ETB', dial: '251', lat: 9.1, lng: 40.5, zones: ['Africa/Addis_Ababa'], cities: [c('Addis Ababa', 9.03, 38.74)] },
    { code: 'GA', name: 'Gabon', currency: 'XAF', dial: '241', lat: -0.8, lng: 11.6, zones: ['Africa/Libreville'], cities: [c('Libreville', 0.39, 9.45)] },
    { code: 'GM', name: 'Gambia', currency: 'GMD', dial: '220', lat: 13.4, lng: -15.3, zones: ['Africa/Banjul'], cities: [c('Banjul', 13.45, -16.58)] },
    { code: 'GH', name: 'Ghana', currency: 'GHS', dial: '233', lat: 7.9, lng: -1.0, zones: ['Africa/Accra'], cities: [c('Accra', 5.6, -0.19), c('Kumasi', 6.69, -1.62)] },
    { code: 'GN', name: 'Guinea', currency: 'GNF', dial: '224', lat: 9.9, lng: -9.7, zones: ['Africa/Conakry'], cities: [c('Conakry', 9.64, -13.58)] },
    { code: 'GW', name: 'Guinea-Bissau', currency: 'XOF', dial: '245', lat: 11.8, lng: -15.2, zones: ['Africa/Bissau'], cities: [c('Bissau', 11.86, -15.6)] },
    { code: 'KE', name: 'Kenya', currency: 'KES', dial: '254', lat: 0.0, lng: 37.9, zones: ['Africa/Nairobi'], cities: [c('Nairobi', -1.29, 36.82), c('Mombasa', -4.04, 39.67), c('Kisumu', -0.09, 34.77)] },
    { code: 'LS', name: 'Lesotho', currency: 'LSL', dial: '266', lat: -29.6, lng: 28.2, zones: ['Africa/Maseru'], cities: [c('Maseru', -29.31, 27.48)] },
    { code: 'LR', name: 'Liberia', currency: 'LRD', dial: '231', lat: 6.4, lng: -9.4, zones: ['Africa/Monrovia'], cities: [c('Monrovia', 6.3, -10.8)] },
    { code: 'LY', name: 'Libya', currency: 'LYD', dial: '218', lat: 26.3, lng: 17.2, zones: ['Africa/Tripoli'], cities: [c('Tripoli', 32.89, 13.19)] },
    { code: 'MG', name: 'Madagascar', currency: 'MGA', dial: '261', lat: -18.8, lng: 46.9, zones: ['Indian/Antananarivo'], cities: [c('Antananarivo', -18.88, 47.51)] },
    { code: 'MW', name: 'Malawi', currency: 'MWK', dial: '265', lat: -13.3, lng: 34.3, zones: ['Africa/Blantyre'], cities: [c('Lilongwe', -13.98, 33.78), c('Blantyre', -15.79, 35.01)] },
    { code: 'ML', name: 'Mali', currency: 'XOF', dial: '223', lat: 17.6, lng: -4.0, zones: ['Africa/Bamako'], cities: [c('Bamako', 12.64, -8.0)] },
    { code: 'MR', name: 'Mauritania', currency: 'MRU', dial: '222', lat: 21.0, lng: -10.9, zones: ['Africa/Nouakchott'], cities: [c('Nouakchott', 18.08, -15.98)] },
    { code: 'MU', name: 'Mauritius', currency: 'MUR', dial: '230', lat: -20.3, lng: 57.6, zones: ['Indian/Mauritius'], cities: [c('Port Louis', -20.16, 57.5)] },
    { code: 'MA', name: 'Morocco', currency: 'MAD', dial: '212', lat: 31.8, lng: -7.1, zones: ['Africa/Casablanca'], cities: [c('Casablanca', 33.57, -7.59), c('Marrakech', 31.63, -8.01), c('Rabat', 34.02, -6.84)] },
    { code: 'MZ', name: 'Mozambique', currency: 'MZN', dial: '258', lat: -18.7, lng: 35.5, zones: ['Africa/Maputo'], cities: [c('Maputo', -25.97, 32.57)] },
    { code: 'NA', name: 'Namibia', currency: 'NAD', dial: '264', lat: -22.6, lng: 17.1, zones: ['Africa/Windhoek'], cities: [c('Windhoek', -22.56, 17.07)] },
    { code: 'NE', name: 'Niger', currency: 'XOF', dial: '227', lat: 17.6, lng: 8.1, zones: ['Africa/Niamey'], cities: [c('Niamey', 13.51, 2.11)] },
    { code: 'NG', name: 'Nigeria', currency: 'NGN', dial: '234', lat: 9.1, lng: 8.7, zones: ['Africa/Lagos'], cities: [c('Lagos', 6.52, 3.38), c('Abuja', 9.06, 7.49), c('Port Harcourt', 4.82, 7.03)] },
    { code: 'RW', name: 'Rwanda', currency: 'RWF', dial: '250', lat: -1.9, lng: 29.9, zones: ['Africa/Kigali'], cities: [c('Kigali', -1.95, 30.06)] },
    { code: 'ST', name: 'São Tomé and Príncipe', currency: 'STN', dial: '239', lat: 0.2, lng: 6.6, zones: ['Africa/Sao_Tome'], cities: [c('São Tomé', 0.34, 6.73)] },
    { code: 'SN', name: 'Senegal', currency: 'XOF', dial: '221', lat: 14.5, lng: -14.5, zones: ['Africa/Dakar'], cities: [c('Dakar', 14.72, -17.47)] },
    { code: 'SC', name: 'Seychelles', currency: 'SCR', dial: '248', lat: -4.7, lng: 55.5, zones: ['Indian/Mahe'], cities: [c('Victoria', -4.62, 55.45)] },
    { code: 'SL', name: 'Sierra Leone', currency: 'SLE', dial: '232', lat: 8.5, lng: -11.8, zones: ['Africa/Freetown'], cities: [c('Freetown', 8.48, -13.23)] },
    { code: 'SO', name: 'Somalia', currency: 'SOS', dial: '252', lat: 5.2, lng: 46.2, zones: ['Africa/Mogadishu'], cities: [c('Mogadishu', 2.05, 45.32)] },
    { code: 'ZA', name: 'South Africa', currency: 'ZAR', dial: '27', lat: -30.6, lng: 22.9, zones: ['Africa/Johannesburg'], cities: [c('Johannesburg', -26.2, 28.05), c('Cape Town', -33.92, 18.42), c('Durban', -29.86, 31.02), c('Pretoria', -25.75, 28.19)] },
    { code: 'SS', name: 'South Sudan', currency: 'SSP', dial: '211', lat: 7.9, lng: 30.2, zones: ['Africa/Juba'], cities: [c('Juba', 4.85, 31.58)] },
    { code: 'SD', name: 'Sudan', currency: 'SDG', dial: '249', lat: 12.9, lng: 30.2, zones: ['Africa/Khartoum'], cities: [c('Khartoum', 15.5, 32.56)] },
    { code: 'TZ', name: 'Tanzania', currency: 'TZS', dial: '255', lat: -6.4, lng: 34.9, zones: ['Africa/Dar_es_Salaam'], cities: [c('Dar es Salaam', -6.79, 39.21), c('Dodoma', -6.16, 35.75), c('Arusha', -3.39, 36.68), c('Mwanza', -2.52, 32.9)] },
    { code: 'TG', name: 'Togo', currency: 'XOF', dial: '228', lat: 8.6, lng: 0.8, zones: ['Africa/Lome'], cities: [c('Lomé', 6.17, 1.23)] },
    { code: 'TN', name: 'Tunisia', currency: 'TND', dial: '216', lat: 33.9, lng: 9.5, zones: ['Africa/Tunis'], cities: [c('Tunis', 36.81, 10.18)] },
    {
        code: 'UG', name: 'Uganda', currency: 'UGX', dial: '256', lat: 1.4, lng: 32.3, zones: ['Africa/Kampala'],
        cities: [c('Kampala', 0.35, 32.58), c('Entebbe', 0.05, 32.46), c('Jinja', 0.42, 33.2), c('Mbarara', -0.61, 30.65), c('Gulu', 2.77, 32.3), c('Mukono', 0.35, 32.76)],
    },
    { code: 'ZM', name: 'Zambia', currency: 'ZMW', dial: '260', lat: -13.1, lng: 27.8, zones: ['Africa/Lusaka'], cities: [c('Lusaka', -15.39, 28.32), c('Ndola', -12.97, 28.64)] },
    { code: 'ZW', name: 'Zimbabwe', currency: 'ZWL', dial: '263', lat: -19.0, lng: 29.2, zones: ['Africa/Harare'], cities: [c('Harare', -17.83, 31.05), c('Bulawayo', -20.15, 28.58)] },
]

export const DEFAULT_COUNTRY = 'UG' // where the platform started: the answer when nothing else is known

const BY_CODE = new Map(AFRICAN_COUNTRIES.map((x) => [x.code, x]))
const BY_ZONE = new Map(AFRICAN_COUNTRIES.flatMap((x) => x.zones.map((z) => [z, x] as const)))

export const isAfricanCountry = (code: unknown): code is string => typeof code === 'string' && BY_CODE.has(code.toUpperCase())
export const countryByCode = (code: string | null | undefined): AfricanCountry | undefined => (code ? BY_CODE.get(code.toUpperCase()) : undefined)
export const countryName = (code: string | null | undefined): string => countryByCode(code)?.name ?? ''
export const currencyForCountry = (code: string | null | undefined): string => countryByCode(code)?.currency ?? 'USD'

/** The currencies a listing in this country may be priced in: its own, and US dollars. */
export const currenciesForCountry = (code: string | null | undefined): string[] => {
    const own = currencyForCountry(code)
    return own === 'USD' ? ['USD'] : [own, 'USD']
}

/** A country from an IANA time zone name (what the browser knows without asking), when it is an African one. */
export function countryForTimezone(zone: string | null | undefined): AfricanCountry | undefined {
    return zone ? BY_ZONE.get(zone) : undefined
}

// ---------------------------------------------------------------------------
// Distance and place
// ---------------------------------------------------------------------------

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
    const rad = Math.PI / 180
    const dLat = (bLat - aLat) * rad
    const dLng = (bLng - aLng) * rad
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2
    return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Where a visitor is, as far as we know. `source` says how sure: a chosen place or shared position beats a guess. */
export interface Place {
    country: string // ISO code
    city?: string
    lat?: number
    lng?: number
    source: 'chosen' | 'geo' | 'timezone' | 'default'
}

/** The nearest known city to a point, and whether it is close enough to call "in" that city. */
export function nearestCity(lat: number, lng: number): { country: AfricanCountry; city: AfricanCity; km: number } | null {
    let best: { country: AfricanCountry; city: AfricanCity; km: number } | null = null
    for (const country of AFRICAN_COUNTRIES) {
        for (const city of country.cities) {
            const km = haversineKm(lat, lng, city.lat, city.lng)
            if (!best || km < best.km) best = { country, city, km }
        }
    }
    return best
}

/** A Place from coordinates: the city when one is within 80 km, else just the nearest country. Null outside Africa. */
export function placeFromCoordinates(lat: number, lng: number): Place | null {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
    const near = nearestCity(lat, lng)
    if (!near) return null
    // Beyond ~1,500 km from every African city this is not in Africa at all.
    if (near.km > 1500) return null
    return {
        country: near.country.code,
        ...(near.km <= 80 ? { city: near.city.name } : {}),
        lat,
        lng,
        source: 'geo',
    }
}

export function placeFromTimezone(zone: string | null | undefined): Place | null {
    const country = countryForTimezone(zone)
    return country ? { country: country.code, source: 'timezone' } : null
}

export function placeLabel(place: Place | null | undefined): string {
    if (!place) return ''
    const country = countryName(place.country)
    return place.city ? `${place.city}, ${country}` : country
}

// A place travels between browser and server in a cookie, so the server can order
// listings without every page having to pass it along.
export const PLACE_COOKIE = 'realevr_place'

export function serializePlace(place: Place): string {
    const round = (n: number | undefined) => (n === undefined ? '' : String(Math.round(n * 100) / 100))
    return [place.country, place.city ?? '', round(place.lat), round(place.lng), place.source].map((s) => encodeURIComponent(s)).join('|')
}

export function parsePlace(raw: string | null | undefined): Place | null {
    if (!raw) return null
    const [country, city, lat, lng, source] = raw.split('|').map((s) => {
        try {
            return decodeURIComponent(s)
        } catch {
            return ''
        }
    })
    if (!isAfricanCountry(country)) return null
    const sources = ['chosen', 'geo', 'timezone', 'default']
    const place: Place = { country: country.toUpperCase(), source: (sources.includes(source) ? source : 'default') as Place['source'] }
    if (city && city.length <= 60) place.city = city
    const la = Number(lat)
    const ln = Number(lng)
    if (lat !== '' && lng !== '' && Number.isFinite(la) && Number.isFinite(ln) && Math.abs(la) <= 90 && Math.abs(ln) <= 180) {
        place.lat = la
        place.lng = ln
    }
    return place
}

/** Pull our place cookie out of a raw Cookie header. */
export function placeFromCookieHeader(header: string | undefined): Place | null {
    if (!header) return null
    const match = header.split(';').map((p) => p.trim()).find((p) => p.startsWith(`${PLACE_COOKIE}=`))
    return match ? parsePlace(match.slice(PLACE_COOKIE.length + 1)) : null
}

// ---------------------------------------------------------------------------
// Which country is a listing in, and how near is it
// ---------------------------------------------------------------------------

interface ListingLike {
    country?: string | null
    location?: string | null
    title?: string | null
    currency?: string | null
    latitude?: number | null
    longitude?: number | null
}

// A currency that points at exactly one country (the shared ones - CFA francs, US dollars - do not).
const SOLE_CURRENCY = new Map(
    Array.from(
        AFRICAN_COUNTRIES.reduce((acc, x) => acc.set(x.currency, [...(acc.get(x.currency) ?? []), x.code]), new Map<string, string[]>()).entries(),
    )
        .filter(([, codes]) => codes.length === 1)
        .map(([currency, codes]) => [currency, codes[0]] as const),
)

/** The country a listing is in: its own field, else its coordinates, its place names, its currency, else the platform's home. */
export function inferListingCountry(p: ListingLike): string {
    if (isAfricanCountry(p.country)) return p.country.toUpperCase()
    if (typeof p.latitude === 'number' && typeof p.longitude === 'number') {
        const place = placeFromCoordinates(p.latitude, p.longitude)
        if (place) return place.country
    }
    const text = ` ${String(p.location ?? '')} ${String(p.title ?? '')} `.toLowerCase()
    for (const country of AFRICAN_COUNTRIES) {
        if (text.includes(` ${country.name.toLowerCase()}`) || text.includes(`,${country.name.toLowerCase()}`)) return country.code
    }
    for (const country of AFRICAN_COUNTRIES) {
        if (country.cities.some((city) => text.includes(city.name.toLowerCase()))) return country.code
    }
    const bySoleCurrency = p.currency ? SOLE_CURRENCY.get(p.currency.toUpperCase()) : undefined
    return bySoleCurrency ?? DEFAULT_COUNTRY
}

/** 0 = in the visitor's city, 1 = in their country, 2 = elsewhere. */
export function placeTier(p: ListingLike, place: Place): 0 | 1 | 2 {
    const country = inferListingCountry(p)
    if (country !== place.country) return 2
    if (place.city) {
        const city = place.city.toLowerCase()
        const text = `${p.location ?? ''} ${p.title ?? ''}`.toLowerCase()
        if (text.includes(city)) return 0
        if (typeof p.latitude === 'number' && typeof p.longitude === 'number' && typeof place.lat === 'number' && typeof place.lng === 'number') {
            if (haversineKm(place.lat, place.lng, p.latitude, p.longitude) <= 40) return 0
        }
    }
    return 1
}

/**
 * Put the visitor's own city first, then the rest of their country, then
 * everything else. Stable inside each group, so "newest first" (or whatever
 * order the caller had) still holds, and with exact coordinates on both sides
 * the closer listing comes first within its group.
 */
export function rankByPlace<T extends ListingLike>(items: T[], place: Place | null | undefined): T[] {
    if (!place) return items
    const withTier = items.map((item, index) => {
        const tier = placeTier(item, place)
        const km =
            typeof item.latitude === 'number' && typeof item.longitude === 'number' && typeof place.lat === 'number' && typeof place.lng === 'number'
                ? haversineKm(place.lat, place.lng, item.latitude, item.longitude)
                : Infinity
        return { item, index, tier, km }
    })
    withTier.sort((a, b) => a.tier - b.tier || (a.tier < 2 && a.km !== b.km ? a.km - b.km : 0) || a.index - b.index)
    return withTier.map((x) => x.item)
}

// ---------------------------------------------------------------------------
// Phone numbers from anywhere in Africa
// ---------------------------------------------------------------------------

/**
 * Digits for WhatsApp ("256772123456"), from a number typed the way people
 * type them: with +, with 00, with the country code, or the local way with a
 * leading 0. `defaultCountry` says which country a local number belongs to.
 * Null when it cannot be a real number.
 */
export function toInternationalDigits(raw: string, defaultCountry: string | null | undefined): string | null {
    const trimmed = String(raw ?? '').trim()
    let digits = trimmed.replace(/\D/g, '')
    if (!digits) return null
    if (trimmed.startsWith('+')) {
        // already international
    } else if (digits.startsWith('00')) {
        digits = digits.slice(2)
    } else {
        const dial = countryByCode(defaultCountry)?.dial ?? countryByCode(DEFAULT_COUNTRY)!.dial
        if (digits.startsWith(dial) && digits.length >= dial.length + 7) {
            // typed with the country code but no plus
        } else {
            digits = dial + digits.replace(/^0+/, '')
        }
    }
    if (digits.length < 9 || digits.length > 15) return null
    // The code at the front should be a real African one for this platform.
    return AFRICAN_COUNTRIES.some((x) => digits.startsWith(x.dial)) ? digits : null
}

// ---------------------------------------------------------------------------
// Places as web addresses (/homes/kenya/nairobi)
// ---------------------------------------------------------------------------

export const slugify = (name: string): string =>
    name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')

export const countrySlug = (code: string): string => slugify(countryName(code))

export function countryBySlug(slug: string | undefined): AfricanCountry | undefined {
    return slug ? AFRICAN_COUNTRIES.find((x) => slugify(x.name) === slug.toLowerCase()) : undefined
}

export function cityBySlug(country: AfricanCountry | undefined, slug: string | undefined): AfricanCity | undefined {
    return country && slug ? country.cities.find((x) => slugify(x.name) === slug.toLowerCase()) : undefined
}

/** The main city a listing is in, when its place names mention one of its country's cities. */
export function listingCity(p: ListingLike): AfricanCity | undefined {
    const country = countryByCode(inferListingCountry(p))
    if (!country) return undefined
    const text = `${p.location ?? ''} ${p.title ?? ''}`.toLowerCase()
    return country.cities.find((city) => text.includes(city.name.toLowerCase()))
}
