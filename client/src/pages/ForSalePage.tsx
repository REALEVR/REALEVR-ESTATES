import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import PropertyCard from "@/components/home/PropertyCard";
import type { Property } from "@shared/schema";

export default function ForSalePage() {
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
    document.title = "Properties For Sale | RealEVR Estates";
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

  // Sample properties for sale (for demonstration)
  const samplePropertiesForSale: Property[] = [
    {
      id: 201,
      title: "Modern Villa in Munyonyo",
      description: "Stunning 5-bedroom villa with swimming pool, garden, and panoramic views of Lake Victoria in the exclusive Munyonyo area.",
      location: "Munyonyo, Kampala",
      price: 850000000, // 850M UGX
      bedrooms: 5,
      bathrooms: 5,
      squareFeet: 4500,
      imageUrl: "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=60",
      rating: "4.9",
      reviewCount: 7,
      propertyType: "Villa",
      category: "for_sale",
      amenities: ["Pool", "Garden", "Security", "Lake View", "Solar Power"],
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
      id: 202,
      title: "Luxury Apartment in Naguru",
      description: "Elegant 3-bedroom apartment in a newly built complex with gym, swimming pool, and 24/7 security in upscale Naguru.",
      location: "Naguru, Kampala",
      price: 350000000, // 350M UGX
      bedrooms: 3,
      bathrooms: 3,
      squareFeet: 1800,
      imageUrl: "https://images.unsplash.com/photo-1493809842364-78817add7ffb?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=60",
      rating: "4.8",
      reviewCount: 12,
      propertyType: "Apartment",
      category: "for_sale",
      amenities: ["Gym", "Pool", "Security", "Parking", "Elevator"],
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
      id: 203,
      title: "Family Home in Bugolobi",
      description: "Spacious 4-bedroom home with mature garden, servant quarters, and ample parking space in family-friendly Bugolobi neighborhood.",
      location: "Bugolobi, Kampala",
      price: 480000000, // 480M UGX
      bedrooms: 4,
      bathrooms: 3,
      squareFeet: 2800,
      imageUrl: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=60",
      rating: "4.7",
      reviewCount: 8,
      propertyType: "House",
      category: "for_sale",
      amenities: ["Garden", "Servant Quarters", "Security", "Parking"],
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
      id: 204,
      title: "Commercial Building in City Center",
      description: "Prime commercial property with 10 office spaces, ground floor retail options, and basement parking in Kampala CBD.",
      location: "Central Business District, Kampala",
      price: 1250000000, // 1.25B UGX
      bedrooms: 0,
      bathrooms: 8,
      squareFeet: 12000,
      imageUrl: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=60",
      rating: "4.6",
      reviewCount: 5,
      propertyType: "Commercial",
      category: "for_sale",
      amenities: ["Parking", "Security", "Elevator", "Central Location"],
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
      id: 205,
      title: "Affordable Starter Home in Naalya",
      description: "Cozy 2-bedroom house on a quiet street, perfect for first-time homebuyers or young families in the growing Naalya area.",
      location: "Naalya, Kampala",
      price: 120000000, // 120M UGX
      bedrooms: 2,
      bathrooms: 1,
      squareFeet: 900,
      imageUrl: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=60",
      rating: "4.3",
      reviewCount: 6,
      propertyType: "House",
      category: "for_sale",
      amenities: ["Garden", "Security", "Near Schools", "Near Shops"],
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
      id: 206,
      title: "Investment Land in Entebbe",
      description: "Prime 2-acre lakefront land ideal for hotel development or luxury residential homes near Entebbe International Airport.",
      location: "Entebbe, Uganda",
      price: 950000000, // 950M UGX
      bedrooms: 0,
      bathrooms: 0,
      squareFeet: 87120, // 2 acres in sq ft
      imageUrl: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=60",
      rating: "4.8",
      reviewCount: 3,
      propertyType: "Land",
      category: "for_sale",
      amenities: ["Lake Access", "Near Airport", "Investment Opportunity"],
      hasTour: false,
      tourUrl: null,
      auctionStatus: null,
      bankName: null,
      auctionDate: null,
      startingBid: null,
      currentBid: null,
      bidIncrement: null,
      isFeatured: true
    }
  ];

  return (
    <div className="py-8">
      <div className="container mx-auto px-4">
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
        ) : samplePropertiesForSale.length ? (
          <div>
            <div className="mb-4 text-gray-500">
              Showing {samplePropertiesForSale.length} sample properties
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {samplePropertiesForSale.map(property => (
                <div key={property.id} className="cursor-pointer" onClick={() => {
                  window.location.href = `/property/${property.id}`;
                }}>
                  <PropertyCard property={property} />
                </div>
              ))}
            </div>
            
            <div className="mt-8 p-6 bg-gray-50 rounded-lg border border-gray-200 text-center">
              <h3 className="text-xl font-semibold mb-2">Looking for your dream home?</h3>
              <p className="text-gray-600 mb-4">Contact us to schedule a viewing of any of these properties.</p>
              <Button 
                className="bg-[#FF5A5F] hover:bg-[#FF5A5F]/90"
                onClick={() => window.location.href = "/membership"}
              >
                Contact an Agent
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