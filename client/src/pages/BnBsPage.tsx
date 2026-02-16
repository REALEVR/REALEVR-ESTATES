import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import PropertyCard from "@/components/home/PropertyCard";
import { useLocation } from "wouter";
import type { Property } from "@shared/schema";

export default function BnBsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [priceRange, setPriceRange] = useState<string>("all");
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("default");
  const [, setLocation] = useLocation();
  
  // Get all properties 
  const { data: properties, isLoading, error } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });
  
  useEffect(() => {
    document.title = "BnBs & Vacation Rentals | RealEVR Estates";
  }, []);
  
  // Filter for only furnished properties
  const furnishedProperties = properties?.filter(property => 
    property.propertyType === "Furnished Rental" || 
    property.propertyType === "BnB" || 
    property.category === "furnished_houses"
  );
  
  // Apply search filters
  const filteredProperties = furnishedProperties?.filter(property => {
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
    
    // Area filter
    let matchesArea = true;
    if (areaFilter !== "all") {
      matchesArea = property.location.toLowerCase().includes(areaFilter.toLowerCase());
    }
    
    return matchesSearch && matchesPrice && matchesArea;
  });
  
  // Apply sorting
  const sortedProperties = [...(filteredProperties || [])].sort((a, b) => {
    if (sortBy === "price-low") {
      return a.price - b.price;
    } else if (sortBy === "price-high") {
      return b.price - a.price;
    } else if (sortBy === "newest") {
      return b.id - a.id;
    }
    return 0; // default: no sorting
  });
  
  // Sample furnished properties (for demonstration)
  // 

  const handleViewProperty = (propertyId: number) => {
    setLocation(`/property/${propertyId}`);
  };

  return (
    <div className="py-8">
      <div className="container mx-auto px-6">
        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
          <h1 className="text-3xl font-bold mb-2">BnBs & Vacation Rentals</h1>
          <p className="text-gray-500 mb-6">
            Browse our collection of fully furnished properties available for short-term stays in Kampala and surrounding areas.
          </p>
          
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
                  <SelectItem value="low">Under 100,000 UGX/night</SelectItem>
                  <SelectItem value="medium">100,000 - 300,000 UGX/night</SelectItem>
                  <SelectItem value="high">Above 300,000 UGX/night</SelectItem>
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
                  <SelectItem value="newest">Newest First</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2 mb-6">
            <Badge 
              variant={areaFilter === "all" ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setAreaFilter("all")}
            >
              All Areas
            </Badge>
            <Badge 
              variant={areaFilter === "kololo" ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setAreaFilter("kololo")}
            >
              Kololo
            </Badge>
            <Badge 
              variant={areaFilter === "nakasero" ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setAreaFilter("nakasero")}
            >
              Nakasero
            </Badge>
            <Badge 
              variant={areaFilter === "munyonyo" ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setAreaFilter("munyonyo")}
            >
              Munyonyo
            </Badge>
            <Badge 
              variant={areaFilter === "central" ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setAreaFilter("central")}
            >
              Central Business District
            </Badge>
            <Badge 
              variant={areaFilter === "entebbe" ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setAreaFilter("entebbe")}
            >
              Entebbe
            </Badge>
            <Badge 
              variant={areaFilter === "lubowa" ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setAreaFilter("lubowa")}
            >
              Lubowa
            </Badge>
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
        ) : sortedProperties?.length ? (
          <div>
            <div className="mb-4 text-gray-500">
              Showing {sortedProperties.length} {sortedProperties.length === 1 ? 'property' : 'properties'}
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {sortedProperties.map(property => (
                <div 
                  key={property.id} 
                  className="cursor-pointer"
                  onClick={() => handleViewProperty(property.id)}
                >
                  <PropertyCard property={property} />
                </div>
              ))}
            </div>
          </div>
        ) : sampleFurnishedProperties.length ? (
          <div>
            <div className="mb-4 text-gray-500">
              Showing {sampleFurnishedProperties.length} sample properties
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {sampleFurnishedProperties.map(property => (
                <div 
                  key={property.id} 
                  className="cursor-pointer"
                  onClick={() => handleViewProperty(property.id)}
                >
                  <PropertyCard property={property} />
                </div>
              ))}
            </div>
            
            <div className="mt-8 p-6 bg-gray-50 rounded-lg border border-gray-200 text-center">
              <h3 className="text-xl font-semibold mb-2">Planning your next stay?</h3>
              <p className="text-gray-600 mb-4">Click on any property to view details and book your stay. Payment is only required after booking confirmation.</p>
              <Button 
                className="bg-[#FF5A5F] hover:bg-[#FF5A5F]/90"
                onClick={() => setLocation("/")}
              >
                Explore More Options
              </Button>
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