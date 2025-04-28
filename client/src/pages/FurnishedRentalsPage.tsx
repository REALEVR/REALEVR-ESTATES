import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { usePayment } from "@/contexts/PaymentContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PropertyCard from "@/components/home/PropertyCard";
import VirtualTour from "@/components/property/VirtualTour";
import type { Property } from "@shared/schema";

export default function FurnishedRentalsPage() {
  const { hasActiveViewingPackage, openViewingPaymentPrompt } = usePayment();
  const [searchTerm, setSearchTerm] = useState("");
  const [priceRange, setPriceRange] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("default");
  
  // Get all properties 
  const { data: properties, isLoading, error } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });
  
  useEffect(() => {
    // Set page title
    document.title = "Furnished Rentals | RealEVR Estates";
  }, []);
  
  // Filter for only furnished rental properties
  const furnishedRentals = properties?.filter(property => 
    property.propertyType === "Furnished Rental" || property.propertyType === "BnB"
  );
  
  // Apply search filters
  const filteredProperties = furnishedRentals?.filter(property => {
    // Search term filter (title, location, description)
    const matchesSearch = searchTerm === "" || 
      property.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      property.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
      property.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Price range filter
    let matchesPrice = true;
    if (priceRange === "low") {
      matchesPrice = property.price < 100000;
    } else if (priceRange === "medium") {
      matchesPrice = property.price >= 100000 && property.price < 300000;
    } else if (priceRange === "high") {
      matchesPrice = property.price >= 300000;
    }
    
    return matchesSearch && matchesPrice;
  });
  
  // Apply sorting
  const sortedProperties = [...(filteredProperties || [])].sort((a, b) => {
    if (sortBy === "price-low") {
      return a.price - b.price;
    } else if (sortBy === "price-high") {
      return b.price - a.price;
    } else if (sortBy === "rating") {
      return parseFloat(b.rating) - parseFloat(a.rating);
    }
    return 0; // default: no sorting
  });
  
  // Handler for when user tries to view properties without an active package
  const handleViewProperty = (e: React.MouseEvent, property: Property) => {
    if (!hasActiveViewingPackage) {
      e.preventDefault();
      openViewingPaymentPrompt();
    }
  };

  return (
    <div className="py-8">
      <div className="container mx-auto px-4">
        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
          <h1 className="text-3xl font-bold mb-2">Furnished Rental Properties</h1>
          <p className="text-gray-500 mb-6">
            Browse our collection of fully furnished properties available for rent in Kampala and surrounding areas.
          </p>
          
          {!hasActiveViewingPackage && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
              <div className="flex items-start">
                <div className="flex-shrink-0 mr-3">
                  <svg className="h-6 w-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-amber-800 font-medium">Viewing Package Required</h3>
                  <p className="text-amber-700 text-sm mt-1">
                    A one-time fee of 10,000 UGX is required to view up to 5 furnished rental properties. This provides access for 7 days.
                  </p>
                  <Button 
                    className="mt-3 bg-amber-600 hover:bg-amber-700" 
                    onClick={openViewingPaymentPrompt}
                  >
                    Purchase Viewing Package
                  </Button>
                </div>
              </div>
            </div>
          )}
          
          <div className="grid md:grid-cols-3 gap-4 mb-6">
            <div>
              <Input
                type="text"
                placeholder="Search properties..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full"
              />
            </div>
            
            <div>
              <Select value={priceRange} onValueChange={setPriceRange}>
                <SelectTrigger>
                  <SelectValue placeholder="Price Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Prices</SelectItem>
                  <SelectItem value="low">Under 100,000 UGX</SelectItem>
                  <SelectItem value="medium">100,000 - 300,000 UGX</SelectItem>
                  <SelectItem value="high">Above 300,000 UGX</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger>
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="price-low">Price: Low to High</SelectItem>
                  <SelectItem value="price-high">Price: High to Low</SelectItem>
                  <SelectItem value="rating">Rating</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
        ) : sortedProperties.length ? (
          <div>
            <div className="mb-4 text-gray-500">
              Showing {sortedProperties.length} {sortedProperties.length === 1 ? 'property' : 'properties'}
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {sortedProperties.map(property => (
                <div key={property.id} className="flex flex-col">
                  <Link 
                    href={`/property/${property.id}`}
                    onClick={(e) => handleViewProperty(e, property)}
                  >
                    <a className="block">
                      <PropertyCard property={property} />
                    </a>
                  </Link>
                  
                  {/* Virtual Tour Preview (if available) */}
                  {property.hasTour && hasActiveViewingPackage && (
                    <div className="mt-3 rounded-lg overflow-hidden border border-gray-200 shadow-sm h-40">
                      <div className="relative w-full h-full bg-gray-100">
                        {/* Virtual Tour Frame */}
                        <div className="w-full h-full">
                          <VirtualTour 
                            tourUrl={property.tourUrl || 'https://app.lapentor.com/sphere/la-rose-royal-apartments'} 
                            isFullscreen={false} 
                          />
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Link href={`/property/${property.id}`}>
                            <a className="px-4 py-2 bg-black/70 hover:bg-black/80 text-white rounded-md transition duration-200 transform hover:scale-105">
                              View Full Tour
                            </a>
                          </Link>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <h2 className="text-2xl font-semibold mb-2">No properties found</h2>
            <p className="text-gray-500">Try adjusting your search criteria</p>
          </div>
        )}
      </div>
    </div>
  );
}