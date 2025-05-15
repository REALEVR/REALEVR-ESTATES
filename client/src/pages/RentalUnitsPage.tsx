import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { usePayment } from "@/contexts/PaymentContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import PropertyCard from "@/components/home/PropertyCard";
import type { Property } from "@shared/schema";

export default function RentalUnitsPage() {
  const { hasActiveViewingPackage, openViewingPaymentPrompt } = usePayment();
  const [searchTerm, setSearchTerm] = useState("");
  const [priceRange, setPriceRange] = useState<string>("all");
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("default");
  
  // Get all properties 
  const { data: properties, isLoading, error } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });
  
  useEffect(() => {
    // Set page title
    document.title = "Rental Units | RealEVR Estates";
  }, []);
  
  // Filter for only rental units (not furnished)
  const rentalUnits = properties?.filter(property => 
    property.propertyType === "Apartment" || 
    property.propertyType === "House" || 
    (property.category === "rental_units" && property.propertyType !== "Furnished Rental" && property.propertyType !== "BnB")
  );
  
  // Apply search filters
  const filteredProperties = rentalUnits?.filter(property => {
    // Search term filter (title, location, description)
    const matchesSearch = searchTerm === "" || 
      property.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      property.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
      property.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Price range filter
    let matchesPrice = true;
    if (priceRange === "low") {
      matchesPrice = property.price < 500000;
    } else if (priceRange === "medium") {
      matchesPrice = property.price >= 500000 && property.price < 1500000;
    } else if (priceRange === "high") {
      matchesPrice = property.price >= 1500000;
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
  
  // Handler for when user tries to view properties without an active package
  const handleViewProperty = (e: React.MouseEvent, property: Property) => {
    if (!hasActiveViewingPackage) {
      e.preventDefault();
      openViewingPaymentPrompt();
    }
  };

  // Sample rental unit properties (for demonstration)
  const sampleRentalUnits: Property[] = [
    {
      id: 101,
      title: "Modern 2BR Apartment in Nakasero",
      description: "Beautiful 2-bedroom apartment with modern finishes, security, and parking in the heart of Nakasero.",
      location: "Nakasero, Kampala",
      price: 850000,
      bedrooms: 2,
      bathrooms: 2,
      squareFeet: 950,
      imageUrl: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=60",
      rating: "4.8",
      reviewCount: 23,
      propertyType: "Apartment",
      category: "rental_units",
      amenities: ["Parking", "Security", "Water Tank", "Wi-Fi"],
      hasTour: false,
      tourUrl: null,
      auctionStatus: null,
      bankName: null,
      isFeatured: true
    },
    {
      id: 102,
      title: "Family Home in Kololo with Garden",
      description: "Spacious 4-bedroom house with large garden, servant quarters, and ample parking in the prestigious Kololo area.",
      location: "Kololo, Kampala",
      price: 2500000,
      bedrooms: 4,
      bathrooms: 3,
      squareFeet: 2200,
      imageUrl: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=60",
      rating: "4.9",
      reviewCount: 15,
      propertyType: "House",
      category: "rental_units",
      amenities: ["Garden", "Servant Quarters", "Security", "Parking"],
      hasTour: true,
      tourUrl: "https://app.lapentor.com/sphere/la-rose-royal-apartments",
      auctionStatus: null,
      bankName: null,
      isFeatured: true
    },
    {
      id: 103,
      title: "Budget Studio in Ntinda",
      description: "Cozy studio apartment with essential amenities in a convenient location near shops and transport.",
      location: "Ntinda, Kampala",
      price: 350000,
      bedrooms: 0,
      bathrooms: 1,
      squareFeet: 400,
      imageUrl: "https://images.unsplash.com/photo-1554995207-c18c203602cb?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=60",
      rating: "4.2",
      reviewCount: 8,
      propertyType: "Apartment",
      category: "rental_units",
      amenities: ["Water Tank", "Security", "Nearby Shops"],
      hasTour: false,
      tourUrl: null,
      auctionStatus: null,
      bankName: null,
      isFeatured: false
    },
    {
      id: 104,
      title: "Executive Apartment in Bugolobi",
      description: "Luxury 3-bedroom apartment with swimming pool, gym, and 24/7 security in Bugolobi's finest complex.",
      location: "Bugolobi, Kampala",
      price: 1800000,
      bedrooms: 3,
      bathrooms: 3,
      squareFeet: 1600,
      imageUrl: "https://images.unsplash.com/photo-1567496898669-ee935f5f647a?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=60",
      rating: "4.9",
      reviewCount: 31,
      propertyType: "Apartment",
      category: "rental_units",
      amenities: ["Pool", "Gym", "24/7 Security", "Balcony", "Parking"],
      hasTour: true,
      tourUrl: "https://app.lapentor.com/sphere/la-rose-royal-apartments",
      auctionStatus: null,
      bankName: null,
      isFeatured: true
    },
    {
      id: 105,
      title: "3BR House in Kira with Large Compound",
      description: "Spacious 3-bedroom house on a large compound with fruit trees, perfect for families who want space and privacy.",
      location: "Kira, Kampala",
      price: 1200000,
      bedrooms: 3,
      bathrooms: 2,
      squareFeet: 1800,
      imageUrl: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=60",
      rating: "4.6",
      reviewCount: 12,
      propertyType: "House",
      category: "rental_units",
      amenities: ["Large Compound", "Fruit Trees", "Borehole", "Security"],
      hasTour: false,
      tourUrl: null,
      auctionStatus: null,
      bankName: null,
      isFeatured: false
    },
    {
      id: 106,
      title: "1BR Apartment in Muyenga",
      description: "Cozy 1-bedroom apartment with city views, modern amenities, and convenient access to downtown Kampala.",
      location: "Muyenga, Kampala",
      price: 650000,
      bedrooms: 1,
      bathrooms: 1,
      squareFeet: 600,
      imageUrl: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=60",
      rating: "4.5",
      reviewCount: 19,
      propertyType: "Apartment",
      category: "rental_units",
      amenities: ["City View", "Security", "Balcony", "Wi-Fi"],
      hasTour: false,
      tourUrl: null,
      auctionStatus: null,
      bankName: null,
      isFeatured: false
    }
  ];

  return (
    <div className="py-8">
      <div className="container mx-auto px-4">
        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
          <h1 className="text-3xl font-bold mb-2">Rental Units</h1>
          <p className="text-gray-500 mb-6">
            Browse our collection of unfurnished apartments and houses available for monthly rental in Kampala and surrounding areas.
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
                    A one-time fee of 15,000 UGX is required to view contact details for up to 10 rental properties. This provides access for 1 day only.
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
                  <SelectItem value="low">Under 500,000 UGX</SelectItem>
                  <SelectItem value="medium">500,000 - 1,500,000 UGX</SelectItem>
                  <SelectItem value="high">Above 1,500,000 UGX</SelectItem>
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
              variant={areaFilter === "bugolobi" ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setAreaFilter("bugolobi")}
            >
              Bugolobi
            </Badge>
            <Badge 
              variant={areaFilter === "ntinda" ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setAreaFilter("ntinda")}
            >
              Ntinda
            </Badge>
            <Badge 
              variant={areaFilter === "muyenga" ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setAreaFilter("muyenga")}
            >
              Muyenga
            </Badge>
            <Badge 
              variant={areaFilter === "kira" ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setAreaFilter("kira")}
            >
              Kira
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
                <div key={property.id} className="cursor-pointer" onClick={(e) => {
                  if (!hasActiveViewingPackage) {
                    e.preventDefault();
                    openViewingPaymentPrompt();
                  } else {
                    window.location.href = `/property/${property.id}`;
                  }
                }}>
                  <PropertyCard property={property} />
                </div>
              ))}
            </div>
          </div>
        ) : sampleRentalUnits.length ? (
          <div>
            <div className="mb-4 text-gray-500">
              Showing {sampleRentalUnits.length} sample properties
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {sampleRentalUnits.map(property => (
                <div key={property.id} className="cursor-pointer" onClick={(e) => {
                  if (!hasActiveViewingPackage) {
                    e.preventDefault();
                    openViewingPaymentPrompt();
                  } else {
                    window.location.href = `/property/${property.id}`;
                  }
                }}>
                  <PropertyCard property={property} />
                </div>
              ))}
            </div>
            
            <div className="mt-8 p-6 bg-gray-50 rounded-lg border border-gray-200 text-center">
              <h3 className="text-xl font-semibold mb-2">Looking for a specific type of rental?</h3>
              <p className="text-gray-600 mb-4">We have many more properties available after purchasing a viewing package.</p>
              <Button 
                className="bg-[#FF5A5F] hover:bg-[#FF5A5F]/90"
                onClick={openViewingPaymentPrompt}
              >
                Unlock All Properties
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