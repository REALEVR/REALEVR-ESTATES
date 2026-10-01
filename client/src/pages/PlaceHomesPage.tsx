import { useMemo } from "react";
import { Link, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MapPin, Share2 } from "lucide-react";
import type { Property } from "@shared/schema";
import { Button } from "@/components/ui/button";
import PropertyCard from "@/components/home/PropertyCard";
import { PageSeo } from "@/components/seo/PageSeo";
import { useToast } from "@/hooks/use-toast";
import { getSiteUrl } from "@/lib/siteUrl";
import { buildPlaceHomesMeta } from "@shared/seo";
import { cityBySlug, countryBySlug, inferListingCountry, listingCity, slugify } from "@shared/africa";

interface PlaceRow {
  slug: string;
  name: string;
  count: number;
  cities: Array<{ name: string; slug: string; count: number }>;
}

/**
 * "Homes in Nairobi, Kenya": a real page for each country and city that has homes
 * listed, so someone searching for a place can land on it (and share it). Built from
 * the live listings only, and linked/sitemapped only when there is something to show.
 */
export default function PlaceHomesPage() {
  const [, params] = useRoute<{ country: string; city?: string }>("/homes/:country/:city?");
  const { toast } = useToast();
  const country = countryBySlug(params?.country);
  const city = params?.city ? cityBySlug(country, params.city) : undefined;

  const listings = useQuery<Property[]>({ queryKey: ["/api/properties"] });
  const places = useQuery<PlaceRow[]>({ queryKey: ["/api/places"] });

  const homes = useMemo(
    () =>
      (listings.data ?? []).filter(
        (p) => !!country && inferListingCountry(p) === country.code && (!city || listingCity(p)?.name === city.name),
      ),
    [listings.data, country, city],
  );

  if (!country || (params?.city && !city)) {
    return (
      <div className="container mx-auto px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold mb-2">We don't have that place yet</h1>
        <p className="text-muted-foreground mb-6">Try one of the places listed below, or browse everything.</p>
        <Button asChild>
          <Link href="/properties">Browse all properties</Link>
        </Button>
      </div>
    );
  }

  const where = city ? `${city.name}, ${country.name}` : country.name;
  const meta = buildPlaceHomesMeta({ country: country.name, city: city?.name, count: homes.length });
  const path = `/homes/${slugify(country.name)}${city ? `/${slugify(city.name)}` : ""}`;
  const row = places.data?.find((p) => p.slug === slugify(country.name));
  const otherCities = (row?.cities ?? []).filter((c) => !city || c.slug !== slugify(city.name));

  const share = async () => {
    const url = `${getSiteUrl()}${path}?utm_source=share&utm_medium=button`;
    try {
      if (navigator.share) await navigator.share({ title: meta.title, url });
      else {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copied", description: "Paste it anywhere to share these homes." });
      }
    } catch {
      /* cancelled */
    }
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: meta.title,
    description: meta.description,
    url: `${getSiteUrl()}${path}`,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: homes.length,
      itemListElement: homes.slice(0, 20).map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${getSiteUrl()}/property/${p.id}`,
        name: p.title,
      })),
    },
  };

  return (
    <div className="container mx-auto px-6 py-10">
      <PageSeo title={meta.title} description={meta.description} canonicalPath={path} jsonLd={jsonLd} />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <MapPin className="h-7 w-7 text-accent" aria-hidden="true" /> Homes in {where}
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Rental units, furnished BnBs and properties for sale in {where}, each with a virtual tour you can walk through on your
            phone before you visit.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void share()}>
          <Share2 className="mr-1.5 h-4 w-4" /> Share
        </Button>
      </div>

      {listings.isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : homes.length === 0 ? (
        <div className="rounded-xl border p-10 text-center">
          <p className="mb-4 text-muted-foreground">
            No homes are listed in {where} yet. Own or manage one, or live in a building we don't have? You can add it, free.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild>
              <Link href="/list-your-property">List a property</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/recommend-a-place">Recommend your building</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {homes.map((p) => (
            <PropertyCard key={p.id} property={p} />
          ))}
        </div>
      )}

      {otherCities.length > 0 && (
        <section className="mt-12" aria-label="More places">
          <h2 className="text-lg font-semibold mb-3">{city ? `More of ${country.name}` : `Cities in ${country.name}`}</h2>
          <div className="flex flex-wrap gap-2">
            {city && (
              <Link href={`/homes/${slugify(country.name)}`} className="rounded-full border px-4 py-1.5 text-sm hover:bg-secondary">
                All of {country.name}
              </Link>
            )}
            {otherCities.map((c) => (
              <Link
                key={c.slug}
                href={`/homes/${slugify(country.name)}/${c.slug}`}
                className="rounded-full border px-4 py-1.5 text-sm hover:bg-secondary"
              >
                {c.name} ({c.count})
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
