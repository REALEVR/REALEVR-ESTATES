import { Link } from "wouter";
import { Building2, Gavel, Home, Sofa, Tag } from "lucide-react";
import { usePlace } from "@/lib/place";
import { WHATSAPP_NUMBERS, whatsAppLink } from "@/lib/siteLinks";
import { DEFAULT_COUNTRY } from "@shared/africa";

const KINDS = [
  { label: "Rent it out", note: "Long-term rental units", href: "/list-your-property?category=rental_units", Icon: Home },
  { label: "Furnished stay / BnB", note: "Nightly and short stays", href: "/list-your-property?category=furnished_houses", Icon: Sofa },
  { label: "Sell it", note: "Homes, land, commercial", href: "/list-your-property?category=for_sale", Icon: Tag },
];

const bankSaleLink = whatsAppLink(
  WHATSAPP_NUMBERS[0].number,
  "Hello, I'd like to list a bank sale / auction property on RealEVR Estates (free). How do we start?",
);

/**
 * What a visitor from outside Africa sees first: the platform as a free place to list property in
 * Africa (rent, BnB, sale, bank sales). Renters and buyers in Africa get the normal home page.
 */
export default function ListFreeHero() {
  const { choose } = usePlace();
  return (
    <section className="relative -mx-4 overflow-hidden bg-[hsl(235_30%_9%)] text-white sm:-mx-6 lg:-mx-8">
      <div className="absolute inset-0 bg-[radial-gradient(60%_80%_at_85%_0%,hsl(40_92%_62%/0.28),transparent_60%),radial-gradient(50%_60%_at_0%_100%,hsl(36_80%_32%/0.35),transparent_65%)]" />
      <div className="relative mx-auto max-w-[1500px] px-4 py-14 md:px-8 md:py-24">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-[hsl(40_92%_62%)] px-3 py-1 text-xs font-bold text-[hsl(235_28%_12%)]">
          Free to list · no fee, ever
        </p>
        <h1 className="font-display text-4xl font-bold leading-[1.05] md:text-6xl lg:text-7xl">
          List your property in Africa.
          <span className="block italic text-[hsl(40_92%_62%)]">Free, with a 360° tour.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-base text-white/80 md:text-lg">
          Own, manage or sell a property in any of 54 African countries? List it on RealEVR Estates at no cost. The owner confirms it
          over WhatsApp, and tenants and buyers walk through it from anywhere.
        </p>

        <div className="mt-8 grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {KINDS.map(({ label, note, href, Icon }) => (
            <Link
              key={label}
              href={href}
              data-magnet className="group rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur transition hover:bg-white/15"
            >
              <Icon className="mb-3 h-6 w-6 text-[hsl(40_92%_62%)]" aria-hidden="true" />
              <div className="font-semibold">{label}</div>
              <div className="text-sm text-white/70">{note}</div>
              <div className="mt-3 text-sm font-semibold text-[hsl(40_92%_62%)] group-hover:underline">List free →</div>
            </Link>
          ))}
          <a
            href={bankSaleLink}
            target="_blank"
            rel="noopener noreferrer"
            data-magnet className="group rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur transition hover:bg-white/15"
          >
            <Gavel className="mb-3 h-6 w-6 text-[hsl(40_92%_62%)]" aria-hidden="true" />
            <div className="font-semibold">Bank sales &amp; auctions</div>
            <div className="text-sm text-white/70">Our team sets these up with you</div>
            <div className="mt-3 text-sm font-semibold text-[hsl(40_92%_62%)] group-hover:underline">Message us →</div>
          </a>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-white/80">
          <span className="inline-flex items-center gap-2">
            <Building2 className="h-4 w-4" aria-hidden="true" /> Owner confirmed over WhatsApp
          </span>
          <button type="button" onClick={() => choose(DEFAULT_COUNTRY)} className="font-semibold underline underline-offset-4 hover:text-white">
            Looking for a home in Africa instead? Browse listings
          </button>
        </div>
      </div>
    </section>
  );
}
