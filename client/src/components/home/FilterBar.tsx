import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Home, Landmark, LayoutGrid, Sparkles, Star, SlidersHorizontal, Sofa, Tag } from "lucide-react";
import ExploreFiltersDialog from "./ExploreFiltersDialog";

/**
 * The browse row: icon over label, swipeable on a phone, an underline on the one you are in
 * (Airbnb's category strip). One place to jump to any kind of home, and a Filters button
 * for everything else. Each chip is a real link, so it works with no script and can be
 * opened in a new tab.
 */
const CHIPS = [
  { href: "/properties", label: "All homes", icon: LayoutGrid },
  { href: "/rental-units", label: "Rentals", icon: Home },
  { href: "/bnbs", label: "BnBs", icon: Sofa },
  { href: "/for-sale", label: "For sale", icon: Tag },
  { href: "/bank-sales", label: "Bank sales", icon: Landmark },
  { href: "/featured-properties", label: "Featured", icon: Star },
  { href: "/new-listings", label: "New", icon: Sparkles },
] as const;

export default function FilterBar() {
  const [location] = useLocation();
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <section className="sticky top-16 z-30 -mx-4 border-b border-border bg-background/90 backdrop-blur-xl sm:-mx-6 md:top-20 lg:-mx-8" aria-label="Browse by type">
      <div className="mx-auto flex max-w-[1500px] items-center gap-2 px-4 md:px-8">
        <nav className="chip-nav min-w-0 flex-1" aria-label="Kinds of home">
          {CHIPS.map(({ href, label, icon: Icon }) => {
            const active = location === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`group flex min-h-[64px] min-w-[72px] shrink-0 flex-col items-center justify-center gap-1.5 border-b-2 px-3 pb-2 pt-3 text-[13px] font-medium transition-colors ${
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                <Icon className="h-6 w-6" strokeWidth={active ? 2.25 : 1.75} aria-hidden="true" />
                <span className="whitespace-nowrap">{label}</span>
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          className="my-2 flex h-11 shrink-0 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground shadow-sm transition hover:shadow-md"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Filters</span>
          <span className="sr-only sm:hidden">Filters</span>
        </button>
      </div>
      <ExploreFiltersDialog isOpen={filtersOpen} onClose={() => setFiltersOpen(false)} />
    </section>
  );
}
