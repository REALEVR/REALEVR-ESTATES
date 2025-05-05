import { useQuery } from "@tanstack/react-query";
import { Property } from "@shared/schema";
import PropertyCard from "@/components/home/PropertyCard";
import { Loader2 } from "lucide-react";

export default function FeaturedPropertiesPage() {
  const { data: featuredProperties, isLoading, error } = useQuery<Property[]>({
    queryKey: ["/api/properties/featured"],
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-10 min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !featuredProperties || featuredProperties.length === 0) {
    return (
      <div className="container mx-auto px-4 py-10 min-h-screen">
        <h1 className="text-3xl font-bold mb-6">Featured Properties</h1>
        <p className="text-gray-500">No featured properties found.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-6">Featured Properties</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {featuredProperties.map((property) => (
          <PropertyCard key={property.id} property={property} />
        ))}
      </div>
    </div>
  );
}