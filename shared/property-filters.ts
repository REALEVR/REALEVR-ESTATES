/**
 * Showing homes by what someone asked for ("two bedrooms in Kololo under three million"): the same filters travel in
 * the address of the page (/properties?loc=Kololo&max=3000000&beds=2) so the page can show exactly those homes, and the
 * same test decides which ones match. Pure functions, used by the browser (the page and Kevin) alike.
 */

export interface PropertyFilters {
  location?: string
  minPrice?: number
  maxPrice?: number
  bedrooms?: number
  /** rental_units | for_sale | furnished_houses | bank_sales */
  category?: string
  /** apartment | house | land | commercial | hostel */
  propertyType?: string
  /** The currency the prices are in (default UGX). */
  currency?: string
}

const TYPE_SYNONYMS: Record<string, string[]> = {
  apartment: ['apartment', 'flat', 'condo', 'studio'],
  house: ['house', 'home', 'bungalow', 'villa', 'mansion', 'maisonette', 'townhouse'],
  land: ['land', 'plot'],
  commercial: ['office', 'shop', 'commercial', 'warehouse', 'store'],
  hostel: ['hostel'],
}

export const FILTER_CATEGORIES = ['rental_units', 'for_sale', 'furnished_houses', 'bank_sales']

const num = (v: string | null): number | undefined => {
  if (!v) return undefined
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

export function hasFilters(f: PropertyFilters): boolean {
  return !!(f.location || f.minPrice || f.maxPrice || f.bedrooms || f.category || f.propertyType)
}

/** The part after "?" of the page address for these filters ("" when there are none). */
export function filtersToSearch(f: PropertyFilters): string {
  const p = new URLSearchParams()
  if (f.location) p.set('loc', f.location)
  if (f.minPrice) p.set('min', String(f.minPrice))
  if (f.maxPrice) p.set('max', String(f.maxPrice))
  if (f.bedrooms) p.set('beds', String(f.bedrooms))
  if (f.category && FILTER_CATEGORIES.includes(f.category)) p.set('cat', f.category)
  if (f.propertyType && TYPE_SYNONYMS[f.propertyType]) p.set('type', f.propertyType)
  if (f.currency && f.currency !== 'UGX' && /^[A-Z]{3}$/.test(f.currency)) p.set('cur', f.currency)
  return p.toString()
}

export function filtersFromSearch(p: URLSearchParams): PropertyFilters {
  const cat = p.get('cat') ?? ''
  const type = p.get('type') ?? ''
  const cur = (p.get('cur') ?? '').toUpperCase()
  return {
    location: (p.get('loc') ?? '').trim().slice(0, 60) || undefined,
    minPrice: num(p.get('min')),
    maxPrice: num(p.get('max')),
    bedrooms: num(p.get('beds')),
    category: FILTER_CATEGORIES.includes(cat) ? cat : undefined,
    propertyType: TYPE_SYNONYMS[type] ? type : undefined,
    currency: /^[A-Z]{3}$/.test(cur) ? cur : undefined,
  }
}

/** Does a listing fit? Same rules Kevin's search uses on the server: every location word in the place or title, price in the asked currency, at least that many bedrooms. */
export function matchesFilters(p: Record<string, any>, f: PropertyFilters): boolean {
  if (f.category && p.category !== f.category) return false
  const words = (f.location ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length) {
    const haystack = `${p.location ?? ''} ${p.title ?? ''}`.toLowerCase()
    if (!words.every((w) => haystack.includes(w))) return false
  }
  if (f.minPrice || f.maxPrice) {
    if ((p.currency || 'UGX') !== (f.currency || 'UGX')) return false
    if (f.maxPrice && !(Number(p.price) <= f.maxPrice)) return false
    if (f.minPrice && !(Number(p.price) >= f.minPrice)) return false
  }
  if (f.bedrooms && (Number(p.bedrooms) || 0) < f.bedrooms) return false
  if (f.propertyType) {
    const text = `${p.propertyType ?? ''} ${p.title ?? ''}`.toLowerCase()
    if (!(TYPE_SYNONYMS[f.propertyType] ?? [f.propertyType]).some((w) => text.includes(w))) return false
  }
  return true
}

const CATEGORY_WORDS: Record<string, string> = {
  rental_units: 'for rent',
  for_sale: 'for sale',
  furnished_houses: 'BnB stays',
  bank_sales: 'bank sales',
}

const money = (n: number, cur: string) => `${cur} ${n.toLocaleString('en-US')}`

/** "2+ bedroom homes for rent in Kololo, up to UGX 3,000,000" */
export function describeFilters(f: PropertyFilters): string {
  const cur = f.currency || 'UGX'
  const parts: string[] = []
  parts.push(`${f.bedrooms ? `${f.bedrooms}+ bedroom ` : ''}${f.propertyType === 'land' ? 'land' : f.propertyType === 'apartment' ? 'apartments' : f.propertyType === 'commercial' ? 'commercial places' : f.propertyType === 'hostel' ? 'hostels' : 'homes'}`)
  if (f.category) parts.push(CATEGORY_WORDS[f.category] ?? '')
  if (f.location) parts.push(`in ${f.location}`)
  let s = parts.filter(Boolean).join(' ')
  if (f.minPrice && f.maxPrice) s += `, ${money(f.minPrice, cur)} to ${money(f.maxPrice, cur)}`
  else if (f.maxPrice) s += `, up to ${money(f.maxPrice, cur)}`
  else if (f.minPrice) s += `, from ${money(f.minPrice, cur)}`
  return s
}
