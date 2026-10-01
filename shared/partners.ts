/**
 * Companies that list with RealEVR Estates. Edit this list to add or change a partner; the Partners page and
 * its structured data are built from it. Only say what is certain: a description is added when the partner
 * has confirmed it, and a `search` word finds their listings on the site.
 */
export interface Partner {
    name: string
    kind: 'Developer' | 'Apartments' | 'Bank' | 'Agency'
    /** What the site may say about them. Left out until confirmed by the partner. */
    blurb?: string
    /** Finds their homes through the site search (`/properties?q=`). */
    search: string
    website?: string
}

export const PARTNERS: Partner[] = [
    { name: 'Mint Homes', kind: 'Developer', search: 'Mint Homes' },
    { name: 'Cadenza', kind: 'Developer', search: 'Cadenza' },
    { name: 'La Rose Royal Apartments', kind: 'Apartments', search: 'La Rose' },
    { name: 'Knightsbridge Avenues', kind: 'Developer', search: 'Knightsbridge' },
]
