import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { AnimatedContainer, AnimatedItem } from "@/components/ui/animated-components";
import ExploreFiltersDialog from "./ExploreFiltersDialog";

type CategoryType = {
  name: string;
  icon: string;
  slug: string;
  isActive?: boolean;
};

// The 4 property-type categories (For Rent / BnBs / For Sale / Bank Sales)
// used to each be their own top-level "Browse by" entry here, each linking
// to its own page. Reduced to 3 broader entries instead — Featured / All
// Properties / New Listings — with the 4 property types now reachable as
// filter tabs inside "All Properties" (see AllPropertiesPage.tsx) and the
// "Filters" dialog's Property Type tab (ExploreFiltersDialog.tsx), not as
// separate top-level destinations.
const ROUTE_BY_SLUG: Record<string, string> = {
  featured: '/featured-properties',
  all: '/properties',
  new: '/new-listings',
};

export default function FilterBar() {
  const [location, setLocation] = useLocation();
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);

  const [categories, setCategories] = useState<CategoryType[]>([
    { name: "Featured", icon: "star", slug: "featured", isActive: false },
    { name: "All Properties", icon: "building", slug: "all", isActive: false },
    { name: "New Listings", icon: "clock", slug: "new", isActive: false }
  ]);

  // Set the active category based on the current URL route
  useEffect(() => {
    const currentSlug = Object.entries(ROUTE_BY_SLUG).find(([, route]) => route === location)?.[0]

    setCategories((prev) => prev.map((cat) => ({ ...cat, isActive: cat.slug === currentSlug })))
  }, [location]);

  const toggleCategory = (index: number) => {
    setCategories((prev) => prev.map((cat, i) => ({ ...cat, isActive: i === index })))

    const route = ROUTE_BY_SLUG[categories[index].slug]
    setLocation(route);
  };

  return (
    // Mobile gets its own compact tier (base classes below) so the whole row —
    // label, all 3 category chips, and the Filters button — fits inside a
    // single phone-width frame with no horizontal scroll needed. `sm:` steps
    // back up to what used to be the only "mobile" sizing (still used on
    // small tablets), `md:` is unchanged desktop sizing.
    <section className="py-3 sm:py-4 border-b border-border overflow-x-auto whitespace-nowrap hide-scrollbar px-3 sm:px-6">
      <AnimatedContainer className="container mx-auto flex items-center space-x-2 sm:space-x-6 md:space-x-8">
        <AnimatedItem>
          <h2 className="font-display text-[11px] sm:text-lg mr-1 sm:mr-4 md:mr-6 text-foreground shrink-0">Browse by:</h2>
        </AnimatedItem>
        {categories.map((category, index) => (
          <AnimatedItem key={category.name} delay={index * 0.1}>
            <button
              onClick={() => toggleCategory(index)}
              className={`flex flex-col items-center opacity-70 hover:opacity-100 transition-all duration-300 pb-1.5 sm:pb-2 border-b-2 min-w-[52px] sm:min-w-[80px] md:min-w-[100px] px-0.5 sm:px-2 shrink-0 ${
                category.isActive
                  ? 'border-accent text-accent opacity-100'
                  : 'border-transparent text-foreground hover:border-accent/50'
              } focus:outline-none`}
            >
              {/* Design-review fix (round 3): bare Font Awesome glyphs sitting
                  directly on the page background read as a plain icon list,
                  not a set of tappable category chips — the mobile/visual
                  reviewers both cited this row as flat compared to the rest
                  of the redesign. A circular badge (Airbnb's category-icon
                  treatment) gives each icon a contained shape and makes the
                  active state read clearly as a filled badge, not just a
                  color change on a tiny glyph. */}
              <span
                className={`flex items-center justify-center w-6 h-6 sm:w-9 sm:h-9 md:w-10 md:h-10 rounded-full mb-0.5 sm:mb-1 transition-colors ${
                  category.isActive ? 'bg-accent/15' : 'bg-secondary'
                }`}
              >
                <i className={`fas fa-${category.icon} text-[10px] sm:text-base md:text-lg`}></i>
              </span>
              <span className="text-[9px] sm:text-sm md:text-base font-medium leading-tight whitespace-nowrap">{category.name}</span>
            </button>
          </AnimatedItem>
        ))}
        <AnimatedItem delay={0.4}>
          <Button
            variant="outline"
            className="bg-card border border-border rounded-lg px-2 sm:px-4 md:px-6 py-1 sm:py-2 h-auto ml-0.5 sm:ml-4 md:ml-6 flex items-center hover:bg-secondary transition-colors min-w-0 sm:min-w-[100px] shrink-0"
            onClick={() => setIsFilterDialogOpen(true)}
          >
            <i className="fas fa-sliders-h mr-1 sm:mr-2 text-[10px] sm:text-base md:text-lg"></i>
            <span className="text-[10px] sm:text-sm md:text-base font-medium">Filters</span>
          </Button>
        </AnimatedItem>
      </AnimatedContainer>
      
      {/* Filters Dialog */}
      <ExploreFiltersDialog 
        isOpen={isFilterDialogOpen} 
        onClose={() => setIsFilterDialogOpen(false)} 
      />
    </section>
  );
}
