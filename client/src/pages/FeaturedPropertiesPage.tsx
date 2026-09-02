import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Property } from "@shared/schema";
import PropertyCard from "@/components/home/PropertyCard";
import { Loader2 } from "lucide-react";
import { PageSeo } from "@/components/seo/PageSeo";
import { getSiteUrl } from "@/lib/siteUrl";
import { CATEGORY_PAGE_META } from "@shared/seo";

export default function FeaturedPropertiesPage() {
  const { data: featuredProperties, isLoading, error } = useQuery<Property[]>({
    queryKey: ["/api/properties/featured"],
  });

  const featuredJsonLd = useMemo(() => {
    const site = getSiteUrl();
    return {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: CATEGORY_PAGE_META.featuredProperties.title,
      description: CATEGORY_PAGE_META.featuredProperties.description,
      url: `${site}${CATEGORY_PAGE_META.featuredProperties.path}`,
    };

    setTimeout(()=>{
      console.log('welcomet0')
    },3000)
  }, []);

  if (isLoading) {
    return (
      <div className="container mx-auto px-6 py-10 min-h-screen flex items-center justify-center">
        <PageSeo
          title={CATEGORY_PAGE_META.featuredProperties.title}
          description={CATEGORY_PAGE_META.featuredProperties.description}
          canonicalPath={CATEGORY_PAGE_META.featuredProperties.path}
          jsonLd={featuredJsonLd}
        />
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !featuredProperties || featuredProperties.length === 0) {
    return (
      <div className="container mx-auto px-6 py-10 min-h-screen">
        <PageSeo
          title={CATEGORY_PAGE_META.featuredProperties.title}
          description={CATEGORY_PAGE_META.featuredProperties.description}
          canonicalPath={CATEGORY_PAGE_META.featuredProperties.path}
          jsonLd={featuredJsonLd}
        />
        <h1 className="text-3xl font-bold mb-6">Featured Properties</h1>
        <p className="text-gray-500">No featured properties found.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-10">
      <PageSeo
        title={CATEGORY_PAGE_META.featuredProperties.title}
        description={CATEGORY_PAGE_META.featuredProperties.description}
        canonicalPath={CATEGORY_PAGE_META.featuredProperties.path}
        jsonLd={featuredJsonLd}
      />
      <h1 className="text-3xl font-bold mb-6">Featured Properties</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {featuredProperties.map((property) => (
          <PropertyCard key={property.id} property={property} />
        ))}
      </div>
    </div>
  );
}