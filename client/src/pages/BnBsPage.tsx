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
  const sampleFurnishedProperties: Property[] = [
    {
      id: 301,
      title: "Luxury Apartment with Lake View",
      description: "Elegant fully furnished apartment with panoramic views of Lake Victoria, modern amenities, and daily housekeeping.",
      location: "Munyonyo, Kampala",
      price: 250000, // 250,000 UGX per night
      bedrooms: 2,
      bathrooms: 2,
      squareFeet: 1200,
      imageUrl: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=60",
      rating: "4.9",
      reviewCount: 42,
      propertyType: "BnB",
      category: "furnished_houses",
      amenities: ["Lake View", "Wi-Fi", "Pool", "Gym", "24/7 Security"],
      hasTour: true,
      tourUrl: "https://app.lapentor.com/sphere/la-rose-royal-apartments",
      auctionStatus: null,
      bankName: null,
      auctionDate: null,
      startingBid: null,
      currentBid: null,
      bidIncrement: null,
      isFeatured: true
    },
    {
      id: 302,
      title: "Cozy Studio in Central Kampala",
      description: "Stylish studio in the heart of Kampala with modern decor, kitchenette, and access to rooftop social area.",
      location: "Central Business District, Kampala",
      price: 120000, // 120,000 UGX per night
      bedrooms: 0,
      bathrooms: 1,
      squareFeet: 500,
      imageUrl: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=60",
      rating: "4.7",
      reviewCount: 29,
      propertyType: "BnB",
      category: "furnished_houses",
      amenities: ["Wi-Fi", "Air Conditioning", "City View", "Security"],
      hasTour: true,
      tourUrl: "https://app.lapentor.com/sphere/la-rose-royal-apartments",
      auctionStatus: null,
      bankName: null,
      auctionDate: null,
      startingBid: null,
      currentBid: null,
      bidIncrement: null,
      isFeatured: true
    },
    {
      id: 303,
      title: "Family Villa with Garden",
      description: "Spacious 3-bedroom villa with large garden, BBQ area, and children's play area. Perfect for family getaways.",
      location: "Lubowa, Kampala",
      price: 380000, // 380,000 UGX per night
      bedrooms: 3,
      bathrooms: 3,
      squareFeet: 2500,
      imageUrl: "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=60",
      rating: "4.8",
      reviewCount: 18,
      propertyType: "BnB",
      category: "furnished_houses",
      amenities: ["Garden", "BBQ", "Wi-Fi", "Parking", "Children's Play Area"],
      hasTour: false,
      tourUrl: null,
      auctionStatus: null,
      bankName: null,
      auctionDate: null,
      startingBid: null,
      currentBid: null,
      bidIncrement: null,
      isFeatured: false
    },
    {
      id: 304,
      title: "Modern Loft in Kololo",
      description: "Contemporary loft-style apartment in upscale Kololo with high ceilings, designer furniture, and private balcony.",
      location: "Kololo, Kampala",
      price: 200000, // 200,000 UGX per night
      bedrooms: 1,
      bathrooms: 1,
      squareFeet: 850,
      imageUrl: "https://images.unsplash.com/photo-1493809842364-78817add7ffb?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=60",
      rating: "4.8",
      reviewCount: 35,
      propertyType: "BnB",
      category: "furnished_houses",
      amenities: ["Balcony", "Designer Furniture", "Wi-Fi", "Air Conditioning", "Workspace"],
      hasTour: true,
      tourUrl: "https://app.lapentor.com/sphere/la-rose-royal-apartments",
      auctionStatus: null,
      bankName: null,
      auctionDate: null,
      startingBid: null,
      currentBid: null,
      bidIncrement: null,
      isFeatured: true
    },
    {
      id: 305,
      title: "Lakeside Cottage in Entebbe",
      description: "Charming cottage minutes from Entebbe Beach with private garden, outdoor dining, and lake access.",
      location: "Entebbe, Uganda",
      price: 320000, // 320,000 UGX per night
      bedrooms: 2,
      bathrooms: 2,
      squareFeet: 1100,
      imageUrl: "https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=60",
      rating: "4.9",
      reviewCount: 24,
      propertyType: "BnB",
      category: "furnished_houses",
      amenities: ["Lake Access", "Garden", "Outdoor Dining", "Wi-Fi", "Parking"],
      hasTour: false,
      tourUrl: null,
      auctionStatus: null,
      bankName: null,
      auctionDate: null,
      startingBid: null,
      currentBid: null,
      bidIncrement: null,
      isFeatured: false
    },
    {
      id: 306,
      title: "Luxury Penthouse with City Views",
      description: "Spectacular penthouse in the heart of Kampala with panoramic city views, luxury amenities, and rooftop terrace.",
      location: "Nakasero, Kampala",
      price: 450000, // 450,000 UGX per night
      bedrooms: 3,
      bathrooms: 3,
      squareFeet: 1800,
      imageUrl: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=60",
      rating: "5.0",
      reviewCount: 15,
      propertyType: "BnB",
      category: "furnished_houses",
      amenities: ["City View", "Rooftop Terrace", "Luxury Amenities", "Wi-Fi", "Concierge"],
      hasTour: true,
      tourUrl: "https://app.lapentor.com/sphere/la-rose-royal-apartments",
      auctionStatus: null,
      bankName: null,
      auctionDate: null,
      startingBid: null,
      currentBid: null,
      bidIncrement: null,
      isFeatured: true
    }
  ];

  const handleViewProperty = (propertyId: number) => {
    setLocation(`/property/${propertyId}`);
  };

  return (
    <div className="py-8">
      <div className="container mx-auto px-4">
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