import { Link } from 'wouter'
import { Button } from '@/components/ui/button'

/** Listing boost tiers; keep in step with the Featured placement row on FeesPage. */
const BOOST_TIERS = [
  { name: 'Bronze', price: 'UGX 10,000', duration: '7 days' },
  { name: 'Silver', price: 'UGX 25,000', duration: '14 days' },
  { name: 'Gold', price: 'UGX 50,000', duration: '30 days' },
] as const

/** Says up front what renters and landlords pay, so the homepage no longer hides the price. */
export default function PricingStrip() {
  return (
    <section id="pricing" className="scroll-mt-24 py-8 md:py-12">
      <div className="mx-auto grid max-w-[1500px] gap-4 px-4 md:grid-cols-2 md:px-8">
        <div className="rounded-3xl border border-border bg-card p-6 md:p-8">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">For renters</p>
          <h2 className="font-display text-2xl font-bold tracking-[-0.02em] md:text-3xl">Tour it before you travel</h2>
          <p className="mt-3 text-muted-foreground">
            Walk through a home on your phone before you pay for transport. Unlock full tours with a viewing pass of{' '}
            <strong className="text-foreground">UGX 15,000</strong>, paid by mobile money.
          </p>
          <Button asChild className="mt-5 h-11 rounded-full px-6 font-semibold">
            <Link href="/rental-units?ref=home-pricing">Browse rentals with tours</Link>
          </Button>
        </div>
        <div className="rounded-3xl border border-border bg-card p-6 md:p-8">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">For landlords and agents</p>
          <h2 className="font-display text-2xl font-bold tracking-[-0.02em] md:text-3xl">Get seen first</h2>
          <p className="mt-3 text-muted-foreground">Listing is free. Boost a listing to the top of search:</p>
          <ul className="mt-3 space-y-1 text-sm">
            {BOOST_TIERS.map((tier) => (
              <li key={tier.name}>
                <strong>{tier.name}</strong> {tier.price} for {tier.duration}
              </li>
            ))}
          </ul>
          <Button asChild variant="outline" className="mt-5 h-11 rounded-full px-6 font-semibold">
            <Link href="/list-your-property?ref=home-landlord">List and boost a property</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
