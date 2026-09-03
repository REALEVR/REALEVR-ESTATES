import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import PropertyCard from "@/components/home/PropertyCard";
import type { Property } from "@shared/schema";
import { PageSeo } from "@/components/seo/PageSeo";
import { getSiteUrl } from "@/lib/siteUrl";
import { CATEGORY_PAGE_META } from "@shared/seo";

export default function ForSalePage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [priceRange, setPriceRange] = useState<string>("all");
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("default");
  
  // Get all properties 
  const { data: properties, isLoading, error } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });
  
  const forSaleJsonLd = useMemo(() => {
    const site = getSiteUrl();
    return {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: CATEGORY_PAGE_META.forSale.title,
      description: CATEGORY_PAGE_META.forSale.description,
      url: `${site}${CATEGORY_PAGE_META.forSale.path}`,
    };
  }, []);

  // Filter for only properties for sale
  const propertiesForSale = properties?.filter(property => 
    property.category === "for_sale"
  );
  
  // Apply search filters
  const filteredProperties = propertiesForSale?.filter(property => {
    // Search term filter (title, location, description)
    const matchesSearch = searchTerm === "" || 
      property.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      property.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
      property.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Price range filter
    let matchesPrice = true;
    if (priceRange === "low") {
      matchesPrice = property.price < 150000000;
    } else if (priceRange === "medium") {
      matchesPrice = property.price >= 150000000 && property.price < 450000000;
    } else if (priceRange === "high") {
      matchesPrice = property.price >= 450000000;
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
      // Default sorting by id if no createdAt field is available
      return b.id - a.id;
    }
    return 0; // default: no sorting
  });

  return (
    <div className="py-8">
      <PageSeo
        title={CATEGORY_PAGE_META.forSale.title}
        description={CATEGORY_PAGE_META.forSale.description}
        canonicalPath={CATEGORY_PAGE_META.forSale.path}
        jsonLd={forSaleJsonLd}
      />
      <div className="container mx-auto px-6">
        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
          <h1 className="text-3xl font-bold mb-2">Properties For Sale</h1>
          <p className="text-gray-500 mb-6">
            Discover properties available for purchase in Kampala and surrounding areas of Uganda.
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
                  <SelectItem value="low">Under 150M UGX</SelectItem>
                  <SelectItem value="medium">150M - 450M UGX</SelectItem>
                  <SelectItem value="high">Above 450M UGX</SelectItem>
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
              variant={areaFilter === "munyonyo" ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setAreaFilter("munyonyo")}
            >
              Munyonyo
            </Badge>
            <Badge 
              variant={areaFilter === "naguru" ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setAreaFilter("naguru")}
            >
              Naguru
            </Badge>
            <Badge 
              variant={areaFilter === "bugolobi" ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setAreaFilter("bugolobi")}
            >
              Bugolobi
            </Badge>
            <Badge 
              variant={areaFilter === "central" ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setAreaFilter("central")}
            >
              Central Business District
            </Badge>
            <Badge 
              variant={areaFilter === "naalya" ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setAreaFilter("naalya")}
            >
              Naalya
            </Badge>
            <Badge 
              variant={areaFilter === "entebbe" ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setAreaFilter("entebbe")}
            >
              Entebbe
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
                <div key={property.id} className="cursor-pointer" onClick={() => {
                  window.location.href = `/property/${property.id}`;
                }}>
                  <PropertyCard property={property} />
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