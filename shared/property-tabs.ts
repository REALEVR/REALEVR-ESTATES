/**
 * Category tabs on the All Properties page, and how they round-trip through
 * the URL (`/properties?tab=for_sale`). Keeping the tab in the URL means a
 * shared link, a refresh or the back button lands on the same category the
 * visitor was looking at, instead of resetting to "All".
 */

export const CATEGORY_TABS = [
    { value: 'all', label: 'All' },
    { value: 'rental_units', label: 'For Rent' },
    { value: 'furnished_houses', label: 'BnBs' },
    { value: 'for_sale', label: 'For Sale' },
    { value: 'bank_sales', label: 'Bank Sales' },
] as const

export type CategoryTab = (typeof CATEGORY_TABS)[number]['value']

export const DEFAULT_CATEGORY_TAB: CategoryTab = 'all'

/** The URL query key that carries the selected tab. */
export const CATEGORY_TAB_PARAM = 'tab'

const TAB_VALUES: ReadonlySet<string> = new Set(CATEGORY_TABS.map((t) => t.value))

/**
 * Read a tab from a raw query value. Anything unknown, empty or missing falls
 * back to "All" so a hand-edited or stale link never shows an empty page.
 */
export function parseCategoryTab(raw: string | null | undefined): CategoryTab {
    const value = (raw ?? '').trim().toLowerCase()
    return TAB_VALUES.has(value) ? (value as CategoryTab) : DEFAULT_CATEGORY_TAB
}

/**
 * The next query string for a tab change. Every other parameter (search,
 * filters) is kept; the default tab is dropped so the canonical
 * `/properties` URL stays clean.
 */
export function withCategoryTab(params: URLSearchParams, tab: CategoryTab): URLSearchParams {
    const next = new URLSearchParams(params)
    if (tab === DEFAULT_CATEGORY_TAB) next.delete(CATEGORY_TAB_PARAM)
    else next.set(CATEGORY_TAB_PARAM, tab)
    return next
}
