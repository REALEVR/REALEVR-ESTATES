import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import Hero from "@/components/home/Hero";
import FilterBar from "@/components/home/FilterBar";
import FeaturedTour from "@/components/home/FeaturedTour";
import FeaturedProperties from "@/components/home/FeaturedProperties";
import PopularProperties from "@/components/home/PopularProperties";
import PropertyCard from "@/components/home/PropertyCard";
import AmenitiesHighlight from "@/components/home/AmenitiesHighlight";
import HowItWorks from "@/components/home/HowItWorks";
import DownloadApp from "@/components/home/DownloadApp";
import { useProperties } from "@/hooks/usePropertyData";
import { queryClient } from "@/lib/queryClient";
import type { Property } from "@shared/schema";

export default function Home() {
  // Force refetch on mount to ensure fresh data
  const [key, setKey] = useState(0);
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
    queryClient.refetchQueries({ queryKey: ["/api/properties"] });
    setKey(prev => prev + 1);
  }, []);
  
  const { data: properties, isLoading, error } = useProperties();

  useEffect(() => {
    // Set page title
    document.title = "RealEVR Estates - Virtual Property Tours";
  }, []);

  return (
    <>
      <Hero />
      <FilterBar />
      <FeaturedTour />
      <FeaturedProperties />
      <PopularProperties />

      {/* Property Listings */}
      <section className="py-10">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl md:text-3xl font-bold">Popular Virtual Tours</h2>
            <div className="flex items-center">
              <span className="text-gray-500 mr-2">Sort by:</span>
              <Select defaultValue="recommended">
                <SelectTrigger className="border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#FF5A5F]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recommended">Recommended</SelectItem>
                  <SelectItem value="price_asc">Price: Low to High</SelectItem>
                  <SelectItem value="price_desc">Price: High to Low</SelectItem>
                  <SelectItem value="newest">Newest</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[...Array(8)].map((_, index) => (
                <div key={index} className="bg-white rounded-xl overflow-hidden shadow-md animate-pulse">
                  <div className="h-52 bg-gray-200"></div>
                  <div className="p-4">
                    <div className="h-5 bg-gray-200 rounded w-3/4 mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
                    <div className="flex justify-between">
                      <div className="h-6 bg-gray-200 rounded w-1/4"></div>
                      <div className="h-6 bg-gray-200 rounded w-1/4"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-red-500">Error loading properties. Please try again later.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {properties && (properties as Property[]).filter(p => !p.isFeatured).map((property) => (
                  <PropertyCard key={property.id} property={property} />
                ))}
              </div>
              
              <div className="mt-12 text-center">
                <Button variant="outline" className="px-6 py-3 bg-white border border-gray-200 rounded-lg font-medium hover:bg-gray-50">
                  Load More Properties
                </Button>
              </div>
            </>
          )}
        </div>
      </section>

      <AmenitiesHighlight />
      <HowItWorks />
      <DownloadApp />
    </>
  );
}
