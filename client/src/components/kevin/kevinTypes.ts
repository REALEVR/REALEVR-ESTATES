/** A listing as the Kevin endpoint returns it (server/gene/kevin-actions.ts KevinCard). */
export interface KevinCard {
  id: number
  title: string
  location: string
  price: number
  currency: string
  bedrooms: number
  category: string
  imageUrl: string
}

/** What Kevin did besides talking (server/gene/kevin-actions.ts KevinAction). */
export type KevinAction =
  | { type: 'results'; total: number }
  | { type: 'open'; propertyId: number }
  | { type: 'go'; page: string; path: string }

export function formatPrice(card: Pick<KevinCard, 'price' | 'currency' | 'category'>): string {
  const amount = new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(card.price)
  const per = card.category === 'rental_units' ? ' / month' : card.category === 'furnished_houses' ? ' / night' : ''
  return `${card.currency} ${amount}${per}`
}
