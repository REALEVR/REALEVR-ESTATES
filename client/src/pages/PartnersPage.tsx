import { useMemo } from "react";
import { Link } from "wouter";
import { ArrowRight, Building2, Gavel, Landmark, MessageCircle } from "lucide-react";
import { PageSeo } from "@/components/seo/PageSeo";
import { Button } from "@/components/ui/button";
import { PARTNERS } from "@shared/partners";
import { WHATSAPP_NUMBERS, whatsAppLink } from "@/lib/siteLinks";
import { getSiteUrl } from "@/lib/siteUrl";
import { SITE_NAME } from "@shared/seo";

const monogram = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

export default function PartnersPage() {
  const jsonLd = useMemo(() => {
    const site = getSiteUrl();
    return {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `${SITE_NAME} partners`,
      url: `${site}/partners`,
      itemListElement: PARTNERS.map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: { "@type": "Organization", name: p.name, ...(p.website ? { url: p.website } : {}) },
      })),
    };
  }, []);

  const bankMessage = whatsAppLink(
    WHATSAPP_NUMBERS[0].number,
    "Hello, we are a bank / lender and would like to list properties for sale by live auction on RealEVR Estates.",
  );
  const partnerMessage = whatsAppLink(
    WHATSAPP_NUMBERS[0].number,
    "Hello, I would like to become a RealEVR Estates partner.",
  );

  return (
    <div>
      <PageSeo
        title="Our partners | RealEVR Estates"
        description="The developers, apartment owners and banks that list with RealEVR Estates: Mint Homes, Cadenza, La Rose Royal Apartments, Knightsbridge Avenues and more."
        canonicalPath="/partners"
        jsonLd={jsonLd}
      />

      <section className="-mx-4 bg-[hsl(235_30%_9%)] px-4 py-14 text-white sm:-mx-6 lg:-mx-8 md:py-20">
        <div className="mx-auto max-w-5xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-[hsl(40_92%_62%)]">Partners</p>
          <h1 className="font-display text-4xl font-bold leading-tight md:text-5xl">
            The people who build, own and sell the homes you tour.
          </h1>
          <p className="mt-4 max-w-2xl text-white/80">
            Developers, apartment owners and banks list their properties with RealEVR Estates, each with a 360° virtual
            tour you can walk through before you visit.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-0 py-10 md:py-14">
        <h2 className="section-title mb-6">Property partners</h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {PARTNERS.map((p) => (
            <li key={p.name}>
              <article className="flex h-full flex-col rounded-2xl border border-border bg-card p-5 transition hover:shadow-md">
                <div className="mb-4 flex items-center gap-4">
                  <span
                    aria-hidden="true"
                    className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[hsl(235_30%_12%)] font-display text-lg font-bold text-[hsl(40_92%_62%)]"
                  >
                    {monogram(p.name)}
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate font-display text-xl font-bold">{p.name}</h3>
                    <p className="text-sm text-muted-foreground">{p.kind}</p>
                  </div>
                </div>
                {p.blurb && <p className="mb-4 text-sm text-foreground/80">{p.blurb}</p>}
                <div className="mt-auto flex flex-wrap items-center gap-3">
                  <Button asChild variant="outline" size="sm" className="rounded-full">
                    <Link href={`/properties?q=${encodeURIComponent(p.search)}`}>
                      See their homes <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
                    </Link>
                  </Button>
                  {p.website && (
                    <a href={p.website} target="_blank" rel="noopener noreferrer" className="text-sm text-accent underline-offset-2 hover:underline">
                      Website
                    </a>
                  )}
                </div>
              </article>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-5xl rounded-3xl bg-secondary/60 p-6 md:p-10">
        <div className="mb-3 flex items-center gap-3">
          <Landmark className="h-6 w-6 text-accent" aria-hidden="true" />
          <h2 className="section-title !mb-0">Banks and lenders</h2>
        </div>
        <p className="max-w-3xl text-foreground/85">
          Banks list repossessed and surplus properties on RealEVR Estates as <strong>live online auctions</strong>. The bank
          states the starting price, the closing date and its own provisions of sale. Every bidder is vetted before they can
          bid, bids appear live as they come in, and the winner is bound by the bank's provisions.
        </p>
        <ul className="mt-5 grid gap-3 sm:grid-cols-3">
          <li className="rounded-xl bg-card p-4"><Gavel className="mb-2 h-5 w-5 text-accent" aria-hidden="true" /><strong className="block">Live bidding</strong><span className="text-sm text-muted-foreground">Current price, bid history and a countdown for everyone watching.</span></li>
          <li className="rounded-xl bg-card p-4"><Building2 className="mb-2 h-5 w-5 text-accent" aria-hidden="true" /><strong className="block">Vetted bidders</strong><span className="text-sm text-muted-foreground">Identity and proof of funds checked, and a commitment fee paid, before the first bid.</span></li>
          <li className="rounded-xl bg-card p-4"><Landmark className="mb-2 h-5 w-5 text-accent" aria-hidden="true" /><strong className="block">Your provisions</strong><span className="text-sm text-muted-foreground">Your conditions of sale shown beside every listing and binding on the winner.</span></li>
        </ul>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild className="rounded-full">
            <Link href="/become-a-partner">Become a partner in your country</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-full">
            <a href={bankMessage} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="mr-2 h-4 w-4" aria-hidden="true" /> List a bank sale
            </a>
          </Button>
          <Button asChild variant="outline" className="rounded-full">
            <Link href="/bank-sales">See live auctions</Link>
          </Button>
          <Button asChild variant="ghost" className="rounded-full">
            <Link href="/auction-terms">Auction terms</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-5xl py-10 text-center md:py-14">
        <h2 className="section-title mb-2">Want to be a partner?</h2>
        <p className="mx-auto mb-5 max-w-xl text-muted-foreground">
          Developers, apartment owners, agencies and banks: list with us free and give every home a virtual tour.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild className="rounded-full">
            <a href={partnerMessage} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="mr-2 h-4 w-4" aria-hidden="true" /> Message us on WhatsApp
            </a>
          </Button>
          <Button asChild variant="outline" className="rounded-full">
            <Link href="/contact">Contact us</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
